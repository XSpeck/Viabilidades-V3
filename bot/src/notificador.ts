import { GRUPOS } from "./config";
import { sendMessage, esc } from "./telegram";
import { getEquipeDoUsuario } from "./usuarios";
import type { Viabilizacao, StatusViabilizacao, StatusInstalacao, EquipeUsuario } from "./tipos";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function grupoEquipe(equipe: EquipeUsuario): string {
  return GRUPOS[equipe];
}

function cabecalho(v: Viabilizacao): string {
  const cliente = v.nome_cliente ? esc(v.nome_cliente) : `<i>${esc(v.usuario)}</i>`;
  const urgente = v.urgente ? " ⚡ <b>URGENTE</b>" : "";
  return `👤 ${cliente} | ${esc(v.tipo_instalacao)}${urgente}`;
}

// ─── Eventos de status da viabilização ───────────────────────────────────────

export async function onNovaViabilizacao(v: Viabilizacao): Promise<void> {
  const msg = [
    `🆕 <b>Nova Viabilização</b>`,
    cabecalho(v),
    `📋 ID: <code>${v.id}</code>`,
  ].join("\n");
  await sendMessage(GRUPOS.auditores, msg);
}

export async function onStatusMudou(
  v: Viabilizacao,
  anterior: StatusViabilizacao
): Promise<void> {
  // Contestação — avisar auditores
  if (v.status === "em_revisao") {
    const msg = [
      `🔁 <b>Contestação de Auditoria</b>`,
      cabecalho(v),
      `📋 ID: <code>${v.id}</code>`,
    ].join("\n");
    await sendMessage(GRUPOS.auditores, msg);
    return;
  }

  // Resultados que chegam à equipe comercial do usuário
  const mensagensPorStatus: Partial<Record<StatusViabilizacao, string>> = {
    aprovado:  "✅ <b>Viabilização Aprovada</b>",
    rejeitado: "❌ <b>Viabilização Rejeitada</b>",
    utp:       "🔶 <b>Viabilização UTP</b> (sem fibra disponível)",
  };

  const titulo = mensagensPorStatus[v.status];
  if (!titulo) return;

  const equipe = await getEquipeDoUsuario(v.usuario);
  if (!equipe) {
    console.warn(`[notificador] Usuário sem equipe: ${v.usuario} — status ${v.status} não notificado`);
    return;
  }

  const linhas = [titulo, cabecalho(v)];

  if (v.status === "aprovado" && v.cto_numero) {
    linhas.push(`📦 CTO ${esc(v.cto_numero)} | ${v.portas_disponiveis ?? "?"} portas disponíveis`);
  }
  if (v.status === "rejeitado" && v.motivo_rejeicao) {
    linhas.push(`💬 Motivo: ${esc(v.motivo_rejeicao)}`);
  }
  linhas.push(`📋 ID: <code>${v.id}</code>`);

  await sendMessage(grupoEquipe(equipe), linhas.join("\n"));
}

// ─── Eventos de status da instalação ─────────────────────────────────────────

export async function onInstalacaoMudou(
  v: Viabilizacao,
  anterior: StatusInstalacao | undefined
): Promise<void> {
  switch (v.status_instalacao) {
    case "proposta_enviada": {
      // Usuário enviou proposta → avisar Agendamento
      const msg = [
        `📅 <b>Nova Proposta de Agendamento</b>`,
        cabecalho(v),
        `📋 ID: <code>${v.id}</code>`,
        `<i>Aguardando confirmação do setor de agendamento.</i>`,
      ].join("\n");
      await sendMessage(GRUPOS.agendamento, msg);
      break;
    }

    case "aguardando_confirmacao": {
      // Agendamento propôs data → avisar equipe do usuário
      const equipe = await getEquipeDoUsuario(v.usuario);
      if (!equipe) break;
      const data = v.agendamento_data
        ? formatarData(v.agendamento_data)
        : "—";
      const msg = [
        `🔔 <b>Proposta de Data para Instalação</b>`,
        cabecalho(v),
        `📆 ${data} — ${esc(v.agendamento_periodo ?? "período não informado")}`,
        `👷 Técnico: ${esc(v.agendamento_tecnico ?? "a definir")}`,
        `<i>Aguardando confirmação do cliente.</i>`,
        `📋 ID: <code>${v.id}</code>`,
      ].join("\n");
      await sendMessage(grupoEquipe(equipe), msg);
      break;
    }

    case "agendado": {
      // Instalação confirmada → avisar equipe do usuário
      const equipe = await getEquipeDoUsuario(v.usuario);
      if (!equipe) break;
      const data = v.data_instalacao ? formatarData(v.data_instalacao) : "—";
      const msg = [
        `🗓️ <b>Instalação Confirmada!</b>`,
        cabecalho(v),
        `📆 ${data} — ${esc(v.periodo_instalacao ?? "período não informado")}`,
        `👷 Técnico: ${esc(v.tecnico_instalacao ?? "a definir")}`,
        `📋 ID: <code>${v.id}</code>`,
      ].join("\n");
      await sendMessage(grupoEquipe(equipe), msg);
      break;
    }

    case "instalado": {
      // Instalação concluída → avisar equipe do usuário
      const equipe = await getEquipeDoUsuario(v.usuario);
      if (!equipe) break;
      const msg = [
        `🎉 <b>Instalação Concluída!</b>`,
        cabecalho(v),
        `📋 ID: <code>${v.id}</code>`,
      ].join("\n");
      await sendMessage(grupoEquipe(equipe), msg);
      break;
    }
  }
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function formatarData(iso: string): string {
  try {
    return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", {
      weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    });
  } catch {
    return iso;
  }
}
