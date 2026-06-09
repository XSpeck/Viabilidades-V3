import type { Cto } from "@/lib/ctos";

interface IxcCto {
  id: string;
  descricao: string;
  latitude: string;
  longitude: string;
}

interface IxcResponse {
  registros: IxcCto[];
  total: string;
  page: number;
}

async function fetchPage(url: string, auth: string, page: number): Promise<IxcResponse> {
  const res = await fetch(`${url}/webservice/v1/rad_caixa_ftth`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      ixcsoft: "listar",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      qtype: "rad_caixa_ftth.id",
      query: "0",
      oper: ">",
      rp: "1000",
      page: String(page),
    }),
  });
  if (!res.ok) throw new Error(`IXC Soft retornou ${res.status}`);
  return res.json();
}

export async function GET() {
  const ixcUrl = process.env.IXCSOFT_URL;
  const ixcToken = process.env.IXCSOFT_TOKEN;

  if (!ixcUrl || !ixcToken) {
    return Response.json(
      { error: "Credenciais IXC Soft não configuradas (IXCSOFT_URL / IXCSOFT_TOKEN)." },
      { status: 500 }
    );
  }

  const auth = btoa(ixcToken);

  try {
    const allCtos: Cto[] = [];
    let page = 1;

    while (true) {
      const data = await fetchPage(ixcUrl, auth, page);
      const registros = data.registros ?? [];

      for (const r of registros) {
        const lat = parseFloat(r.latitude);
        const lon = parseFloat(r.longitude);
        if (!isFinite(lat) || !isFinite(lon)) continue;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) continue;

        const name = r.descricao?.trim() || `CTO-${r.id}`;
        const isCdoi = name.toUpperCase().startsWith("CDOI");

        allCtos.push({ name, lat, lon, tipo: isCdoi ? "CDOI" : "CTO" });
      }

      if (registros.length < 1000) break;
      page++;
    }

    return Response.json({ ctos: allCtos, total: allCtos.length });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Erro ao buscar CTOs do IXC Soft." },
      { status: 500 }
    );
  }
}
