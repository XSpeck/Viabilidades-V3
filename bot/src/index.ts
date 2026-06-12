import "./firebase"; // inicializa Firebase Admin
import { db } from "./firebase";
import { onNovaViabilizacao, onStatusMudou, onInstalacaoMudou } from "./notificador";
import type { Viabilizacao } from "./tipos";

const cache = new Map<string, Viabilizacao>();
let pronto = false;

function parseViab(id: string, data: FirebaseFirestore.DocumentData): Viabilizacao {
  return { id, ...data } as Viabilizacao;
}

async function processarMudanca(
  viab: Viabilizacao,
  anterior: Viabilizacao | undefined,
  isNew: boolean
): Promise<void> {
  try {
    if (isNew) {
      if (viab.status === "pendente") {
        await onNovaViabilizacao(viab);
      }
      return;
    }

    if (!anterior) return;

    // Status da viabilização mudou
    if (anterior.status !== viab.status) {
      await onStatusMudou(viab, anterior.status);
    }

    // Status da instalação mudou
    if (anterior.status_instalacao !== viab.status_instalacao) {
      await onInstalacaoMudou(viab, anterior.status_instalacao);
    }
  } catch (err) {
    console.error(`[bot] Erro ao processar viabilização ${viab.id}:`, err);
  }
}

function iniciarListener(): void {
  const col = db.collection("viabilizacoes");

  col.onSnapshot(
    (snapshot) => {
      if (!pronto) {
        // Primeira chamada: apenas popula o cache com o estado atual
        snapshot.docs.forEach((doc) => {
          cache.set(doc.id, parseViab(doc.id, doc.data()));
        });
        pronto = true;
        console.log(`[bot] Pronto. ${snapshot.docs.length} viabilizações no cache.`);
        return;
      }

      // Chamadas subsequentes: processa apenas as mudanças
      for (const change of snapshot.docChanges()) {
        const viab = parseViab(change.doc.id, change.doc.data());

        if (change.type === "added") {
          void processarMudanca(viab, undefined, true);
          cache.set(viab.id, viab);
        } else if (change.type === "modified") {
          const anterior = cache.get(viab.id);
          void processarMudanca(viab, anterior, false);
          cache.set(viab.id, viab);
        } else if (change.type === "removed") {
          cache.delete(viab.id);
        }
      }
    },
    (err) => {
      console.error("[bot] Erro no listener do Firestore:", err);
      process.exit(1);
    }
  );
}

iniciarListener();
