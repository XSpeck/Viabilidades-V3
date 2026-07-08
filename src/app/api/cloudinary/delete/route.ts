import { NextResponse } from "next/server";

export const runtime = "nodejs";

function extractPublicId(url: string): string | null {
  const match = url.match(/\/upload\/(?:v\d+\/)?(.+)\.[a-zA-Z0-9]+$/);
  return match ? match[1] : null;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const { urls } = await request.json() as { urls: string[] };
    if (!Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json({ error: "Cloudinary não configurado no servidor." }, { status: 500 });
    }

    const publicIds = urls.map(extractPublicId).filter((id): id is string => !!id);
    if (publicIds.length === 0) {
      return NextResponse.json({ ok: true });
    }

    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString("base64");
    const params = publicIds.map((id) => `public_ids[]=${encodeURIComponent(id)}`).join("&");
    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/resources/image/upload?${params}`,
      { method: "DELETE", headers: { Authorization: `Basic ${auth}` } }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro interno." },
      { status: 500 }
    );
  }
}
