"use client";
import { confirmar } from "@/lib/dialogo";

import { useMemo, useState } from "react";
import { ArrowLeft, Loader2, Plus, Save, Search, Trash2, UserRound } from "lucide-react";
import type { RotaOptica } from "@/lib/rotaOptica";
import type { CaixaRede } from "@/lib/caixasRede";
import {
  documentoValido,
  ESTADOS,
  excluirCliente,
  formatarCep,
  formatarDocumento,
  ligacoesDosClientes,
  ligarCliente,
  proximoCodigoCliente,
  salvarCliente,
  soDigitos,
  type ClienteRede,
} from "@/lib/clientesRede";
import { IconeElemento } from "./IconesRede";

/**
 * Cadastro de clientes da rede: dados do cliente e a perna de splitter (CTO ou CDOI) onde ele está ligado.
 * A ligação fica na porta da caixa, então aparece também na aba CTO/CDOI e conta nos clientes do prédio e da HUB.
 */

interface Props {
  rotas: RotaOptica[];
  caixas: CaixaRede[];
  clientes: ClienteRede[];
  usuario: string;
  onClientes: (c: ClienteRede[]) => void;
  onCaixas: (c: CaixaRede[]) => void;
}

type Rascunho = Omit<ClienteRede, "id" | "atualizado_em"> & { id?: string };

const vazio = (codigo: string): Rascunho => ({
  nome: "", nascimento: "", codigo, documento: "", endereco: "", bairro: "", cep: "", cidade: "", estado: "", contato: "", email: "", obs: "",
});

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function ClientesRede({ rotas, caixas, clientes, usuario, onClientes, onCaixas }: Props) {
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState<Rascunho | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const ligacoes = useMemo(() => ligacoesDosClientes(rotas, caixas), [rotas, caixas]);

  const t = norm(busca.trim());
  const lista = clientes.filter((c) => {
    if (!t) return true;
    const l = ligacoes.get(c.id);
    return norm(`${c.nome} ${c.codigo} ${c.documento ?? ""} ${c.endereco ?? ""} ${c.bairro ?? ""} ${c.cidade ?? ""} ${l?.caixa ?? ""}`).includes(t);
  });

  function abrir(c?: ClienteRede) {
    setErro(null);
    if (c) {
      setForm({ ...c });
    } else {
      setForm(vazio(proximoCodigoCliente(clientes)));
    }
  }
  const set = (m: Partial<Rascunho>) => setForm((f) => (f ? { ...f, ...m } : f));

  async function salvar() {
    if (!form) return;
    if (!form.nome.trim()) return setErro("Informe o nome (ou a razão social).");
    if (form.documento && !documentoValido(form.documento)) return setErro("CPF/CNPJ inválido: confira os números.");
    if (form.documento && clientes.some((c) => c.id !== form.id && c.documento && soDigitos(c.documento) === soDigitos(form.documento!))) return setErro("Já existe um cliente com este CPF/CNPJ.");
    if (form.cep && soDigitos(form.cep).length !== 8) return setErro("CEP precisa ter 8 números.");
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) return setErro("E-mail inválido.");
    setSalvando(true);
    setErro(null);
    try {
      const antes = clientes.find((c) => c.id === form.id);
      // código: automático e fixo — o cliente novo pega o próximo livre na hora de salvar; o existente mantém o dele
      const codigo = form.id ? (antes?.codigo || form.codigo) : proximoCodigoCliente(clientes);
      const salvo = await salvarCliente({ ...form, codigo }, usuario);
      onClientes([...clientes.filter((c) => c.id !== salvo.id), salvo].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")));
      // o nome mudou e ele está ligado: a perna passa a mostrar o nome novo
      const atual = ligacoes.get(salvo.id);
      if (atual && antes?.nome !== salvo.nome) {
        onCaixas(await ligarCliente(salvo, { chave: atual.chave, spl: atual.spl, porta: atual.porta }, rotas, caixas, usuario));
      }
      setForm(null);
    } catch (e) {
      setErro(/permission/i.test(String(e)) ? "Sem permissão: publique a regra clientes_rede no Firebase." : e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function excluir() {
    if (!form?.id) return;
    if (!(await confirmar(`Excluir o cliente "${form.nome}"? A perna onde ele está ligado fica livre.`, { ok: "Excluir" }))) return;
    setSalvando(true);
    try {
      if (ligacoes.has(form.id)) onCaixas(await ligarCliente({ id: form.id, nome: form.nome }, null, rotas, caixas, usuario));
      await excluirCliente(form.id);
      onClientes(clientes.filter((c) => c.id !== form.id));
      setForm(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível excluir.");
    } finally {
      setSalvando(false);
    }
  }

  const campo = "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none";
  const rot = "mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500";

  // ---------- Formulário ----------
  if (form) {
    const doc = soDigitos(form.documento ?? "");
    const docOk = !doc || documentoValido(doc);
    const pj = doc.length === 14;
    return (
      <div className="space-y-3 p-3">
        <button type="button" onClick={() => setForm(null)} className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Clientes
        </button>
        <div className="grid grid-cols-2 gap-2">
          <div className="col-span-2">
            <label className={rot}>{pj ? "Razão social" : "Nome"} *</label>
            <input className={campo} value={form.nome} onChange={(e) => set({ nome: e.target.value })} placeholder="Nome completo ou razão social" />
          </div>
          <div>
            <label className={rot}>Código 🔒</label>
            <input
              className={`${campo} cursor-not-allowed bg-slate-50 font-mono text-slate-600`}
              value={form.id ? form.codigo : `${proximoCodigoCliente(clientes)} (ao salvar)`}
              readOnly
              title="Código automático e único: não pode ser mudado"
            />
          </div>
          <div>
            <label className={rot}>{pj ? "CNPJ" : "CPF / CNPJ"}</label>
            <input
              className={`${campo} tabular-nums ${docOk ? "" : "border-red-400"}`}
              inputMode="numeric"
              value={formatarDocumento(form.documento)}
              onChange={(e) => set({ documento: soDigitos(e.target.value).slice(0, 14) })}
              placeholder="000.000.000-00"
            />
            {!docOk && doc.length >= 11 && <p className="text-[10px] text-red-600">dígitos não conferem</p>}
          </div>
          <div>
            <label className={rot}>{pj ? "Abertura" : "Nascimento"}</label>
            <input type="date" className={campo} value={form.nascimento ?? ""} onChange={(e) => set({ nascimento: e.target.value })} />
          </div>
          <div>
            <label className={rot}>Contato</label>
            <input className={campo} inputMode="tel" value={form.contato ?? ""} onChange={(e) => set({ contato: e.target.value })} placeholder="(47) 99999-9999" />
          </div>
          <div className="col-span-2">
            <label className={rot}>E-mail</label>
            <input className={campo} type="email" value={form.email ?? ""} onChange={(e) => set({ email: e.target.value })} />
          </div>
          <div className="col-span-2">
            <label className={rot}>Endereço</label>
            <input className={campo} value={form.endereco ?? ""} onChange={(e) => set({ endereco: e.target.value })} placeholder="Rua, número, complemento (apto)" />
          </div>
          <div>
            <label className={rot}>Bairro</label>
            <input className={campo} value={form.bairro ?? ""} onChange={(e) => set({ bairro: e.target.value })} />
          </div>
          <div>
            <label className={rot}>CEP</label>
            <input className={`${campo} tabular-nums`} inputMode="numeric" value={formatarCep(form.cep)} onChange={(e) => set({ cep: soDigitos(e.target.value).slice(0, 8) })} placeholder="00000-000" />
          </div>
          <div>
            <label className={rot}>Cidade</label>
            <input className={campo} value={form.cidade ?? ""} onChange={(e) => set({ cidade: e.target.value })} />
          </div>
          <div>
            <label className={rot}>Estado</label>
            <select className={campo} value={form.estado ?? ""} onChange={(e) => set({ estado: e.target.value })}>
              <option value="">—</option>
              {ESTADOS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className={rot}>Obs</label>
            <textarea className={`${campo} min-h-[56px]`} value={form.obs ?? ""} onChange={(e) => set({ obs: e.target.value })} />
          </div>
        </div>

        {/* Onde está ligado (a ligação é feita na perna do splitter, na aba CTO/CDOI) */}
        {(() => {
          const l = form.id ? ligacoes.get(form.id) : undefined;
          return (
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px] text-slate-600">
              {l ? (
                <>
                  <IconeElemento tipo={l.tipo} tamanho={18} />
                  <span>Ligado na <b>{l.caixa}</b> · perna <b>{l.rotulo}</b></span>
                </>
              ) : (
                <span>Sem ligação. Para ligar, abra a CTO/CDOI na árvore, marque a perna como <b>Cliente</b> e busque pelo código ou nome.</span>
              )}
            </div>
          );
        })()}

        {erro && <p className="text-xs text-red-600">{erro}</p>}
        <div className="flex items-center gap-2">
          {form.id && (
            <button type="button" disabled={salvando} onClick={excluir} className="flex items-center gap-1 text-[11px] text-red-600 hover:underline">
              <Trash2 className="h-3.5 w-3.5" /> Excluir cliente
            </button>
          )}
          <button type="button" onClick={() => setForm(null)} className="ml-auto rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700">Cancelar</button>
          <button type="button" disabled={salvando} onClick={salvar} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
            {salvando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Salvar
          </button>
        </div>
      </div>
    );
  }

  // ---------- Lista ----------
  const ligados = clientes.filter((c) => ligacoes.has(c.id)).length;
  return (
    <div className="space-y-2.5 p-3">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={`${campo} pl-8`} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome, código, CPF, endereço, caixa…" />
        </div>
        <button type="button" onClick={() => abrir()} className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">
          <Plus className="h-4 w-4" /> Novo cliente
        </button>
      </div>
      <p className="text-[11px] text-slate-500">
        {clientes.length} cliente{clientes.length !== 1 ? "s" : ""} · {ligados} ligado{ligados !== 1 ? "s" : ""} na rede
      </p>
      {erro && <p className="text-xs text-red-600">{erro}</p>}
      {lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-5 text-center text-xs text-slate-500">
          <UserRound className="mx-auto mb-1 h-6 w-6 text-slate-400" />
          {clientes.length ? "Nenhum cliente encontrado." : "Nenhum cliente cadastrado ainda."}
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {lista.map((c) => {
            const l = ligacoes.get(c.id);
            return (
              <li key={c.id}>
                <button type="button" onClick={() => abrir(c)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-800">{c.nome}</p>
                    <p className="truncate text-[11px] text-slate-500">
                      <span className="font-mono">{c.codigo}</span>
                      {c.documento ? ` · ${formatarDocumento(c.documento)}` : ""}
                      {c.bairro || c.cidade ? ` · ${[c.bairro, c.cidade && c.estado ? `${c.cidade}/${c.estado}` : c.cidade].filter(Boolean).join(", ")}` : ""}
                    </p>
                  </div>
                  {l ? (
                    <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${l.tipo === "cdoi" ? "bg-orange-50 text-orange-700" : "bg-emerald-50 text-emerald-700"}`} title={`${l.caixa} · perna ${l.rotulo}`}>
                      <IconeElemento tipo={l.tipo} tamanho={14} /> {l.caixa.split(" / ")[0].slice(0, 18)} · {l.rotulo}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">sem ligação</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
