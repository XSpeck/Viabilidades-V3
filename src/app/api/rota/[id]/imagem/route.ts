import { adminDb } from "@/lib/firebaseAdmin";
import { plusCodeToCoords } from "@/lib/pluscode";
import { writeFileSync, existsSync, mkdirSync } from "fs";

export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const StaticMaps = require("staticmaps");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require("sharp");

const TMP = "/tmp/viab-markers";

function ensureTmpDir() {
  if (!existsSync(TMP)) mkdirSync(TMP, { recursive: true });
}

async function markerPng(name: string, svg: string): Promise<string> {
  ensureTmpDir();
  const p = `${TMP}/${name}.png`;
  if (!existsSync(p)) {
    const buf = await sharp(Buffer.from(svg)).png().toBuffer();
    writeFileSync(p, buf);
  }
  return p;
}

const CLIENT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="50" viewBox="0 0 36 50">
  <path d="M18 2C10 2 4 8 4 16C4 27 18 48 18 48S32 27 32 16C32 8 26 2 18 2z" fill="#4f46e5"/>
  <circle cx="18" cy="16" r="9" fill="white"/>
  <text x="18" y="21" text-anchor="middle" font-size="13" font-weight="bold" font-family="Arial,sans-serif" fill="#4f46e5">C</text>
</svg>`;

const CTO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="50" viewBox="0 0 40 50">
  <path d="M20 2C12 2 6 8 6 16C6 27 20 48 20 48S34 27 34 16C34 8 28 2 20 2z" fill="#16a34a"/>
  <circle cx="20" cy="16" r="11" fill="white"/>
  <text x="20" y="20" text-anchor="middle" font-size="8" font-weight="bold" font-family="Arial,sans-serif" fill="#16a34a">CTO</text>
</svg>`;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const snap = await adminDb.collection("viabilizacoes").doc(id).get();
  if (!snap.exists) return new Response("Not found", { status: 404 });

  const data = snap.data()!;
  const pontos: { lat: number; lon: number }[] = data.trajeto_cabo ?? [];
  const nomeCliente: string = (data.nome_cliente ?? "mapa").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "_");

  // Decode client coordinates
  let clientCoords: { lat: number; lon: number } | null = null;
  try {
    clientCoords = await plusCodeToCoords(data.plus_code_cliente ?? "");
  } catch { /* ignore */ }

  // Decode CTO coordinates
  let ctoCoords: { lat: number; lon: number } | null = null;
  try {
    if (data.localizacao_caixa) {
      ctoCoords = await plusCodeToCoords(data.localizacao_caixa);
    }
  } catch { /* ignore */ }

  // Need at least one reference point
  if (!clientCoords && pontos.length === 0) {
    return new Response("Sem localização", { status: 404 });
  }

  const map = new StaticMaps({
    width: 900,
    height: 600,
    tileUrl: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileSubdomains: ["a", "b", "c"],
    tileRequestHeader: {
      "User-Agent": "Viabilidades-V3/1.0 (map image export)",
    },
  });

  // Cable route polyline
  if (pontos.length >= 2) {
    map.addLine({
      coords: pontos.map((p) => [p.lon, p.lat]),
      color: "#7c3aedCC",
      width: 5,
    });
  }

  // Markers
  const [clientPng, ctoPng] = await Promise.all([
    markerPng("client", CLIENT_SVG),
    markerPng("cto", CTO_SVG),
  ]);

  if (clientCoords) {
    map.addMarker({
      coord: [clientCoords.lon, clientCoords.lat],
      img: clientPng,
      width: 36,
      height: 50,
      offsetX: 18,
      offsetY: 50,
    });
  }

  if (ctoCoords) {
    map.addMarker({
      coord: [ctoCoords.lon, ctoCoords.lat],
      img: ctoPng,
      width: 40,
      height: 50,
      offsetX: 20,
      offsetY: 50,
    });
  }

  // Render — auto-fits bounds to all markers + lines
  await map.render();

  const buffer: Buffer = await map.image.buffer("image/png", { quality: 0.92 });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="mapa-${nomeCliente}.png"`,
      "Cache-Control": "no-store",
    },
  });
}
