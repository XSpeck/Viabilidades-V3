// Server-side only — importado apenas por API routes
import type { EquipeUsuario } from "@/types";
import { adminDb } from "./firebaseAdmin";

export type TipoNotificacao =
  | "nova_viabilizacao"
  | "aprovado"
  | "rejeitado"
  | "utp"
  | "contestacao"
  | "proposta_enviada"
  | "aguardando_confirmacao"
  | "agendado"
  | "instalado";

const BOT_TOKEN = process.env.BOT_TOKEN ?? "";

const GRUPOS: Record<string, string> = {
  auditores:       process.env.TELEGRAM_GROUP_AUDITORES ?? "",
  agendamento:     process.env.TELEGRAM_GROUP_AGENDAMENTO ?? "",
  comercial_mf:    process.env.TELEGRAM_GROUP_COMERCIAL_MF ?? "",
  comercial:       process.env.TELEGRAM_GROUP_COMERCIAL ?? "",
  atendimento:     process.env.TELEGRAM_GROUP_ATENDIMENTO ?? "",
  comercial_gmarx: process.env.TELEGRAM_GROUP_COMERCIAL_GMARX ?? "",
};

// ─── Telegram ────────────────────────────────────────────────────────────────

function esc(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendTelegram(chatId: string, html: string): Promise<void> {
  if (!chatId || !BOT_TOKEN) return;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML" }),
  });
  if (!res.ok) console.error("[bot] Telegram error:", await res.text());
}

// ─── Usuários ────────────────────────────────────────────────────────────────

const equipeCache = new Map<string, EquipeUsuario | null>();

async function getEquipe(login: string): Promise<EquipeUsuario | null> {
  if (equipeCache.has(login)) return equipeCache.get(login) ?? null;
  const snap = await adminDb.collection("users").where("login", "==", login).limit(1).get();
  const equipe = (snap.docs[0]?.data()?.equipe ?? null) as EquipeUsuario | null;
  equipeCache.set(login, equipe);
  return equipe;
}

// ─── Formatação ──────────────────────────────────────────────────────────────

type V = Record<string, unknown>;

function cabecalho(v: V): string {
  const cliente = v.nome_cliente
    ? esc(String(v.nome_cliente))
    : `<i>${esc(String(v.usuario ?? ""))}</i>`;
  const urgente = v.urgente ? " ⚡ <b>URGENTE</b>" : "";
  return `👤 ${cliente} | ${esc(String(v.tipo_instalacao ?? ""))}${urgente}`;
}

function formatarData(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch { return iso; }
}

// ─── Dispatcher ──────────────────────────────────────────────────────────────

export async function processarNotificacao(tipo: TipoNotificacao, v: V): Promise<void> {
  const usuario = String(v.usuario ?? "");
  const id      = String(v.id ?? "");

  switch (tipo) {
    case "nova_viabilizacao":
      await sendTelegram(GRUPOS.auditores, [
        `🆕 <b>Nova Viabilização</b>`,
        cabecalho(v),
        `📋 ID: <code>${id}</code>`,
      ].join("\n"));
      break;

    case "aprovado": {
      const equipe = await getEquipe(usuario);
      if (!equipe) break;
      const linhas = [`✅ <b>Viabilização Aprovada</b>`, cabecalho(v)];
      if (v.cto_numero) linhas.push(`📦 CTO ${esc(String(v.cto_numero))} | ${v.portas_disponiveis ?? "?"} portas`);
      linhas.push(`📋 ID: <code>${id}</code>`);
      await sendTelegram(GRUPOS[equipe], linhas.join("\n"));
      break;
    }

    case "rejeitado": {
      const equipe = await getEquipe(usuario);
      if (!equipe) break;
      const linhas = [`❌ <b>Viabilização Rejeitada</b>`, cabecalho(v)];
      if (v.motivo_rejeicao) linhas.push(`💬 ${esc(String(v.motivo_rejeicao))}`);
      linhas.push(`📋 ID: <code>${id}</code>`);
      await sendTelegram(GRUPOS[equipe], linhas.join("\n"));
      break;
    }

    case "utp": {
      const equipe = await getEquipe(usuario);
      if (!equipe) break;
      await sendTelegram(GRUPOS[equipe], [
        `🔶 <b>Viabilização UTP</b> (sem fibra disponível)`,
        cabecalho(v),
        `📋 ID: <code>${id}</code>`,
      ].join("\n"));
      break;
    }

    case "contestacao":
      await sendTelegram(GRUPOS.auditores, [
        `🔁 <b>Contestação de Auditoria</b>`,
        cabecalho(v),
        `📋 ID: <code>${id}</code>`,
      ].join("\n"));
      break;

    case "proposta_enviada":
      await sendTelegram(GRUPOS.agendamento, [
        `📅 <b>Nova Proposta de Agendamento</b>`,
        cabecalho(v),
        `📋 ID: <code>${id}</code>`,
        `<i>Aguardando confirmação do setor de agendamento.</i>`,
      ].join("\n"));
      break;

    case "aguardando_confirmacao": {
      const equipe = await getEquipe(usuario);
      if (!equipe) break;
      const data = v.agendamento_data ? formatarData(String(v.agendamento_data)) : "—";
      await sendTelegram(GRUPOS[equipe], [
        `🔔 <b>Nova Proposta de Data para Instalação</b>`,
        cabecalho(v),
        `📆 ${data} — ${esc(String(v.agendamento_periodo ?? "período não informado"))}`,
        `👷 Técnico: ${esc(String(v.agendamento_tecnico ?? "a definir"))}`,
        `<i>Aguardando confirmação do cliente.</i>`,
        `📋 ID: <code>${id}</code>`,
      ].join("\n"));
      break;
    }

    case "agendado": {
      const equipe = await getEquipe(usuario);
      if (!equipe) break;
      const data = v.data_instalacao ? formatarData(String(v.data_instalacao)) : "—";
      await sendTelegram(GRUPOS[equipe], [
        `🗓️ <b>Instalação Confirmada!</b>`,
        cabecalho(v),
        `📆 ${data} — ${esc(String(v.periodo_instalacao ?? "período não informado"))}`,
        `👷 Técnico: ${esc(String(v.tecnico_instalacao ?? "a definir"))}`,
        `📋 ID: <code>${id}</code>`,
      ].join("\n"));
      break;
    }

    case "instalado": {
      const equipe = await getEquipe(usuario);
      if (!equipe) break;
      await sendTelegram(GRUPOS[equipe], [
        `🎉 <b>Instalação Concluída!</b>`,
        cabecalho(v),
        `📋 ID: <code>${id}</code>`,
      ].join("\n"));
      break;
    }
  }
}
