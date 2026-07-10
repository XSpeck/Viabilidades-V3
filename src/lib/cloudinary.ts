const MAX_DIMENSAO = 1600;
const QUALIDADE_JPEG = 0.75;

/** Redimensiona/comprime a foto no navegador antes do upload, pra poupar espaço no Cloudinary. Se algo der errado, devolve o arquivo original. */
async function comprimirImagem(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const escala = Math.min(1, MAX_DIMENSAO / Math.max(bitmap.width, bitmap.height));
    const largura = Math.round(bitmap.width * escala);
    const altura = Math.round(bitmap.height * escala);

    const canvas = document.createElement("canvas");
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALIDADE_JPEG));
    if (!blob || blob.size >= file.size) return file;

    const nome = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], nome, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export async function uploadFoto(file: File): Promise<string> {
  const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
  if (!cloudName || !uploadPreset) {
    throw new Error("Upload de foto não configurado (defina NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME e NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET).");
  }

  const fotoComprimida = await comprimirImagem(file);

  const formData = new FormData();
  formData.append("file", fotoComprimida);
  formData.append("upload_preset", uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error?.message ?? "Erro ao enviar a foto.");
  }
  const { secure_url } = await res.json();
  return secure_url as string;
}

/** Best-effort — não lança erro se a limpeza falhar, pra não travar quem excluiu o registro. */
export async function deleteFotos(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await fetch("/api/cloudinary/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls }),
    });
  } catch {
    // silencioso — limpeza de foto orfã não deve bloquear o fluxo do usuário
  }
}
