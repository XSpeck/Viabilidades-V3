import { BOT_TOKEN } from "./config";

export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendMessage(chatId: string, html: string): Promise<void> {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML" }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[Telegram] Erro ao enviar para ${chatId}: ${body}`);
    }
  } catch (err) {
    console.error(`[Telegram] Falha de rede para ${chatId}:`, err);
  }
}
