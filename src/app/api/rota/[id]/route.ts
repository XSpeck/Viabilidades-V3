import { adminDb } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const snap = await adminDb.collection("viabilizacoes").doc(id).get();

  if (!snap.exists) return new Response("Not found", { status: 404 });

  const data = snap.data()!;
  const pontos: { lat: number; lon: number }[] = data.trajeto_cabo ?? [];
  const expira: string | undefined = data.trajeto_expira_em;

  if (!pontos.length || !expira) return new Response("Sem trajeto", { status: 404 });
  if (new Date(expira) < new Date()) return new Response("Link expirado", { status: 404 });

  const nome = data.nome_cliente ?? "Cliente";
  const cto = data.cto_numero ?? "";

  const coords = pontos.map((p) => `${p.lon},${p.lat},0`).join("\n                  ");

  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Rota do Cabo — ${nome}</name>
    <description>CTO: ${cto} | Traçado pelo auditor</description>
    <Style id="cabo">
      <LineStyle>
        <color>ff0000ff</color>
        <width>4</width>
      </LineStyle>
    </Style>
    <Placemark>
      <name>Lançamento de Fibra</name>
      <styleUrl>#cabo</styleUrl>
      <LineString>
        <tessellate>1</tessellate>
        <coordinates>
                  ${coords}
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

  return new Response(kml, {
    headers: {
      "Content-Type": "application/vnd.google-earth.kml+xml",
      "Content-Disposition": `attachment; filename="rota-${id}.kml"`,
      "Cache-Control": "no-store",
    },
  });
}
