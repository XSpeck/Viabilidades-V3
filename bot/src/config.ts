import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export const BOT_TOKEN = req("BOT_TOKEN");

// Suporta dois formatos de credencial Firebase:
// 1. FIREBASE_SERVICE_ACCOUNT_JSON — JSON completo da conta de serviço (recomendado para produção)
// 2. Três vars separadas — FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
function resolveFirebase() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (json) {
    const sa = JSON.parse(json) as Record<string, string>;
    return {
      projectId:   sa.project_id,
      clientEmail: sa.client_email,
      privateKey:  sa.private_key,
    };
  }
  return {
    projectId:   req("FIREBASE_PROJECT_ID"),
    clientEmail: req("FIREBASE_CLIENT_EMAIL"),
    privateKey:  req("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
  };
}

export const FIREBASE = resolveFirebase();

export const GRUPOS = {
  auditores:       req("TELEGRAM_GROUP_AUDITORES"),
  agendamento:     req("TELEGRAM_GROUP_AGENDAMENTO"),
  comercial_mf:    req("TELEGRAM_GROUP_COMERCIAL_MF"),
  comercial:       req("TELEGRAM_GROUP_COMERCIAL"),
  atendimento:     req("TELEGRAM_GROUP_ATENDIMENTO"),
  comercial_gmarx: req("TELEGRAM_GROUP_COMERCIAL_GMARX"),
} as const;

export type GrupoEquipe = keyof typeof GRUPOS;
