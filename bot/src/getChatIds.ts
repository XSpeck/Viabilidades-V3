/**
 * Script auxiliar — rode UMA VEZ para descobrir os IDs dos grupos.
 *
 * Pré-requisito: adicione o bot aos grupos e envie pelo menos uma
 * mensagem em cada um deles antes de rodar este script.
 *
 * Uso: npm run get-ids
 */
import "dotenv/config";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) {
  console.error("BOT_TOKEN não definido no .env");
  process.exit(1);
}

interface TelegramUpdate {
  message?: {
    chat: { id: number; title?: string; type: string };
    text?: string;
    date: number;
  };
}

async function main(): Promise<void> {
  const res = await fetch(
    `https://api.telegram.org/bot${BOT_TOKEN}/getUpdates?limit=100`
  );
  const data = (await res.json()) as { ok: boolean; result: TelegramUpdate[] };

  if (!data.ok) {
    console.error("Erro na API do Telegram:", data);
    process.exit(1);
  }

  const grupos = new Map<number, { title: string; type: string }>();
  for (const update of data.result) {
    const chat = update.message?.chat;
    if (chat && (chat.type === "group" || chat.type === "supergroup")) {
      grupos.set(chat.id, { title: chat.title ?? "sem título", type: chat.type });
    }
  }

  if (grupos.size === 0) {
    console.log("\n⚠️  Nenhum grupo encontrado. Verifique se:");
    console.log("   1. O bot foi adicionado aos grupos");
    console.log("   2. Pelo menos uma mensagem foi enviada em cada grupo");
    console.log("   3. O BOT_TOKEN no .env está correto\n");
    return;
  }

  console.log("\n=== Grupos encontrados ===\n");
  for (const [id, info] of grupos) {
    console.log(`📣 ${info.title} (${info.type})`);
    console.log(`   ID: ${id}\n`);
  }

  console.log("Copie os IDs acima para o .env conforme o nome de cada grupo.\n");
}

main().catch(console.error);
