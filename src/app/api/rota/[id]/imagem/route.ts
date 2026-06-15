import { adminDb } from "@/lib/firebaseAdmin";
import { plusCodeToCoords } from "@/lib/pluscode";

export const runtime = "nodejs";

const TILE_SIZE = 256;
const IMG_W = 900;
const IMG_H = 600;

function lonToFrac(lon: number, z: number) {
  return ((lon + 180) / 360) * (1 << z);
}

function latToFrac(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * (1 << z);
}

function chooseZoom(minLon: number, maxLon: number, minLat: number, maxLat: number): number {
  for (let z = 18; z >= 1; z--) {
    const xSpan = (lonToFrac(maxLon, z) - lonToFrac(minLon, z)) * TILE_SIZE;
    const ySpan = (latToFrac(minLat, z) - latToFrac(maxLat, z)) * TILE_SIZE;
    if (xSpan <= IMG_W * 0.7 && ySpan <= IMG_H * 0.7) return z;
  }
  return 10;
}

async function fetchTile(tx: number, ty: number, z: number): Promise<Buffer | null> {
  const max = 1 << z;
  if (tx < 0 || ty < 0 || tx >= max || ty >= max) return null;
  const s = ["a", "b", "c"][(tx + ty) % 3];
  try {
    const res = await fetch(
      `https://${s}.tile.openstreetmap.org/${z}/${tx}/${ty}.png`,
      {
        headers: { "User-Agent": "Viabilidades-V3/1.0 map-image-export" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sharp = require("sharp");

  const { id } = await params;
  const snap = await adminDb.collection("viabilizacoes").doc(id).get();
  if (!snap.exists) return new Response("Not found", { status: 404 });

  const data = snap.data()!;
  const pontos: { lat: number; lon: number }[] = data.trajeto_cabo ?? [];
  const nomeCliente = (data.nome_cliente ?? "mapa")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "_");

  let clientCoords: { lat: number; lon: number } | null = null;
  try { clientCoords = await plusCodeToCoords(data.plus_code_cliente ?? ""); } catch { /* */ }

  let ctoCoords: { lat: number; lon: number } | null = null;
  try {
    if (data.localizacao_caixa) ctoCoords = await plusCodeToCoords(data.localizacao_caixa);
  } catch { /* */ }

  const allPoints = [
    ...(clientCoords ? [clientCoords] : []),
    ...(ctoCoords ? [ctoCoords] : []),
    ...pontos,
  ];
  if (allPoints.length === 0) return new Response("Sem localização", { status: 404 });

  // Bounds
  let minLat = Math.min(...allPoints.map(p => p.lat));
  let maxLat = Math.max(...allPoints.map(p => p.lat));
  let minLon = Math.min(...allPoints.map(p => p.lon));
  let maxLon = Math.max(...allPoints.map(p => p.lon));

  // Minimum area to avoid degenerate zoom
  if (maxLon - minLon < 0.005) { const m = (minLon + maxLon) / 2; minLon = m - 0.005; maxLon = m + 0.005; }
  if (maxLat - minLat < 0.003) { const m = (minLat + maxLat) / 2; minLat = m - 0.003; maxLat = m + 0.003; }

  const zoom = chooseZoom(minLon, maxLon, minLat, maxLat);

  // Center of view in fractional tile coords
  const cx = lonToFrac((minLon + maxLon) / 2, zoom);
  const cy = latToFrac((minLat + maxLat) / 2, zoom);

  // Top-left of view
  const viewLeft = cx - IMG_W / 2 / TILE_SIZE;
  const viewTop  = cy - IMG_H / 2 / TILE_SIZE;

  // Tile range needed
  const t0x = Math.floor(viewLeft);
  const t0y = Math.floor(viewTop);
  const t1x = Math.ceil(viewLeft + IMG_W / TILE_SIZE);
  const t1y = Math.ceil(viewTop  + IMG_H / TILE_SIZE);

  const canvasW = (t1x - t0x) * TILE_SIZE;
  const canvasH = (t1y - t0y) * TILE_SIZE;

  // Fetch all tiles in parallel
  const fetches = [];
  for (let tx = t0x; tx < t1x; tx++) {
    for (let ty = t0y; ty < t1y; ty++) {
      fetches.push(fetchTile(tx, ty, zoom).then(buf => ({ tx, ty, buf })));
    }
  }
  const tiles = await Promise.all(fetches);

  // Compose tile canvas
  const composites = tiles
    .filter(t => t.buf != null)
    .map(t => ({
      input: t.buf as Buffer,
      left: (t.tx - t0x) * TILE_SIZE,
      top:  (t.ty - t0y) * TILE_SIZE,
    }));

  const tileCanvas = await sharp({
    create: {
      width: canvasW, height: canvasH, channels: 3,
      background: { r: 190, g: 200, b: 210 },
    },
  })
    .composite(composites)
    .png()
    .toBuffer();

  // Geo → pixel on canvas
  function toPixel(lat: number, lon: number): [number, number] {
    return [
      Math.round((lonToFrac(lon, zoom) - t0x) * TILE_SIZE),
      Math.round((latToFrac(lat, zoom) - t0y) * TILE_SIZE),
    ];
  }

  // SVG overlay: polyline + markers
  let svg = "";

  if (pontos.length >= 2) {
    const pts = pontos.map(p => toPixel(p.lat, p.lon).join(",")).join(" ");
    svg += `<polyline points="${pts}" fill="none" stroke="white" stroke-width="8" stroke-opacity="0.45" stroke-linecap="round" stroke-linejoin="round"/>`;
    svg += `<polyline points="${pts}" fill="none" stroke="#7c3aed" stroke-width="5" stroke-opacity="0.9" stroke-linecap="round" stroke-linejoin="round"/>`;
  }

  if (ctoCoords) {
    const [px, py] = toPixel(ctoCoords.lat, ctoCoords.lon);
    svg += `<circle cx="${px}" cy="${py}" r="13" fill="white" stroke="#16a34a" stroke-width="3"/>`;
    svg += `<circle cx="${px}" cy="${py}" r="10" fill="#16a34a"/>`;
    svg += `<text x="${px}" y="${py + 4}" text-anchor="middle" font-size="9" font-weight="bold" font-family="Arial,sans-serif" fill="white">CTO</text>`;
  }

  if (clientCoords) {
    const [px, py] = toPixel(clientCoords.lat, clientCoords.lon);
    svg += `<circle cx="${px}" cy="${py}" r="13" fill="white" stroke="#4f46e5" stroke-width="3"/>`;
    svg += `<circle cx="${px}" cy="${py}" r="10" fill="#4f46e5"/>`;
    svg += `<text x="${px}" y="${py + 4}" text-anchor="middle" font-size="12" font-weight="bold" font-family="Arial,sans-serif" fill="white">C</text>`;
  }

  const svgBuf = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">${svg}</svg>`
  );

  // Crop position in canvas
  const cropX = Math.round((viewLeft - t0x) * TILE_SIZE);
  const cropY = Math.round((viewTop  - t0y) * TILE_SIZE);

  const output = await sharp(tileCanvas)
    .composite([{ input: svgBuf, left: 0, top: 0 }])
    .extract({ left: cropX, top: cropY, width: IMG_W, height: IMG_H })
    .png()
    .toBuffer();

  return new Response(new Uint8Array(output), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="mapa-${nomeCliente}.png"`,
      "Cache-Control": "no-store",
    },
  });
}
