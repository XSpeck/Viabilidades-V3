import { NextResponse } from "next/server";

const FILE_ID = "1EcKNk2yqHDEMMXJZ17fT0flPV19HDhKJ";

export async function GET() {
  try {
    const url = `https://drive.google.com/uc?export=download&id=${FILE_ID}`;
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) throw new Error(`Drive retornou ${res.status}`);

    const text = await res.text();

    // Google Drive pode retornar página de aviso de vírus para arquivos grandes
    if (text.includes("confirm=") && text.includes("drive.google.com")) {
      const match = text.match(/href="(\/uc\?export=download[^"]+)"/);
      if (match) {
        const confirmUrl = `https://drive.google.com${match[1].replace(/&amp;/g, "&")}`;
        const confirmRes = await fetch(confirmUrl, {
          redirect: "follow",
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        const kml = await confirmRes.text();
        return new NextResponse(kml, {
          headers: { "Content-Type": "application/xml; charset=utf-8" },
        });
      }
    }

    return new NextResponse(text, {
      headers: { "Content-Type": "application/xml; charset=utf-8" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
