"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/contexts/AuthContext";
import { createViabilizacao, getPrediosAtendidos, getPrediosSemViabilidade } from "@/lib/firestore";
import { validatePlusCode, locationToPlusCode } from "@/lib/pluscode";
import type { TipoInstalacao, PredioAtendido, PredioSemViabilidade } from "@/types";
import { MapPin, Search, CheckCircle, XCircle, Loader2, Building2, Home, Users, ArrowLeft, AlertTriangle } from "lucide-react";
import { findPredioEstruturado, type MatchPredio } from "@/lib/predios";
import { canAccess, getCargo } from "@/lib/access";

const LocationPicker = dynamic(() => import("@/components/home/LocationPicker"), { ssr: false });

type InputMethod = "pluscode" | "coords";
type ModalStep = "tipo" | "form";

export default function HomePage() {
  const { user } = useAuth();
  const [inputMethod, setInputMethod] = useState<InputMethod>("pluscode");
  const [locationInput, setLocationInput] = useState("");
  const [validatedPlusCode, setValidatedPlusCode] = useState<string | null>(null);
  const [inputValid, setInputValid] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [modalStep, setModalStep] = useState<ModalStep>("tipo");
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [tipoSelecionado, setTipoSelecionado] = useState<TipoInstalacao | null>(null);
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  // Dados de prédios
  const [prediosAtendidos, setPrediosAtendidos] = useState<PredioAtendido[]>([]);
  const [prediosSemViab, setPrediosSemViab] = useState<PredioSemViabilidade[]>([]);
  const [searchAtendidos, setSearchAtendidos] = useState("");
  const [searchSemViab, setSearchSemViab] = useState("");

  // Campos do formulário (compartilhados)
  const [nomeCliente, setNomeCliente] = useState("");
  const [nomePredio, setNomePredio] = useState("");
  const [andar, setAndar] = useState("");
  const [bloco, setBloco] = useState("");
  const [urgente, setUrgente] = useState(false);
  const [matchPredio, setMatchPredio] = useState<MatchPredio | null>(null);
  const [buscandoPredio, setBuscandoPredio] = useState(false);

  useEffect(() => {
    getPrediosAtendidos().then(setPrediosAtendidos);
    getPrediosSemViabilidade().then(setPrediosSemViab);
  }, []);

  // Re-busca quando o nome do prédio muda
  useEffect(() => {
    if (!tipoSelecionado || tipoSelecionado === "FTTH" || !validatedPlusCode) return;
    const timer = setTimeout(() => {
      setBuscandoPredio(true);
      findPredioEstruturado(validatedPlusCode, nomePredio.trim() || undefined)
        .then(setMatchPredio)
        .catch(() => {})
        .finally(() => setBuscandoPredio(false));
    }, 500);
    return () => clearTimeout(timer);
  }, [nomePredio, tipoSelecionado, validatedPlusCode]);

  // Validação em tempo real
  useEffect(() => {
    if (!locationInput) { setInputValid(null); setValidatedPlusCode(null); return; }
    if (inputMethod === "pluscode") {
      const valid = validatePlusCode(locationInput);
      setInputValid(valid);
      setValidatedPlusCode(valid ? locationInput.trim().toUpperCase() : null);
    } else {
      const parts = locationInput.split(",");
      if (parts.length === 2) {
        const lat = parseFloat(parts[0].trim());
        const lon = parseFloat(parts[1].trim());
        if (!isNaN(lat) && !isNaN(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
          setInputValid(true);
          setValidatedPlusCode(`${lat.toFixed(6)},${lon.toFixed(6)}`);
        } else { setInputValid(false); setValidatedPlusCode(null); }
      } else { setInputValid(false); setValidatedPlusCode(null); }
    }
  }, [locationInput, inputMethod]);

  if (!canAccess(user ?? null, "home")) return <div className="text-center py-20 text-red-500">🚫 Acesso restrito.</div>;

  const podeViabilizar = user ? ["adm", "usuario"].includes(getCargo(user)) : false;

  function abrirModal() {
    setModalStep("tipo");
    setTipoSelecionado(null);
    setNomeCliente(""); setNomePredio(""); setAndar(""); setBloco(""); setUrgente(false);
    setShowModal(true);
  }

  function fecharModal() {
    setShowModal(false);
    setModalStep("tipo");
    setTipoSelecionado(null);
  }

  function selecionarTipo(tipo: TipoInstalacao) {
    setTipoSelecionado(tipo);
    setModalStep("form");
    setMatchPredio(null);
    if (tipo !== "FTTH" && validatedPlusCode) {
      setBuscandoPredio(true);
      findPredioEstruturado(validatedPlusCode, nomePredio.trim() || undefined)
        .then(setMatchPredio)
        .catch(() => {})
        .finally(() => setBuscandoPredio(false));
    }
  }

  async function handleConfirm() {
    if (!validatedPlusCode || !user || !tipoSelecionado) return;
    if (!nomeCliente.trim()) { alert("Informe o nome do cliente!"); return; }
    if (tipoSelecionado !== "FTTH" && !nomePredio.trim()) { alert("Informe o nome do prédio/condomínio!"); return; }
    if (tipoSelecionado !== "FTTH" && !andar.trim()) { alert("Informe o apartamento/casa!"); return; }

    // Garantir que a localização seja salva sempre como Plus Code
    let plusCodeFinal = validatedPlusCode!;
    if (!plusCodeFinal.includes("+")) {
      try {
        const parts = plusCodeFinal.split(",");
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        const { OpenLocationCode } = await import("open-location-code");
        plusCodeFinal = new OpenLocationCode().encode(lat, lon);
      } catch { /* mantém como coordenadas se falhar */ }
    }

    setLoading(true);
    try {
      await createViabilizacao({
        usuario: user.nome,
        nome_cliente: nomeCliente.trim(),
        plus_code_cliente: plusCodeFinal,
        tipo_instalacao: tipoSelecionado,
        urgente,
        equipe: user.equipe,
        status: "pendente",
        predio_ftta: tipoSelecionado !== "FTTH" ? nomePredio.trim() : undefined,
        andar_predio: tipoSelecionado !== "FTTH" ? andar.trim() : undefined,
        bloco_predio: bloco.trim() || undefined,
      });
      fecharModal();
      setSuccessMsg(tipoSelecionado);
      setLocationInput("");
      setValidatedPlusCode(null);
    } catch (err) {
      console.error("Erro ao criar viabilização:", err);
      alert(`Erro: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  }

  const filteredAtendidos = prediosAtendidos.filter((p) =>
    !searchAtendidos || p.condominio.toLowerCase().includes(searchAtendidos.toLowerCase())
  );
  const filteredSemViab = prediosSemViab.filter((p) =>
    !searchSemViab || p.condominio.toLowerCase().includes(searchSemViab.toLowerCase())
  );

  const tipoConfig = {
    FTTH: { icon: <Home className="w-8 h-8" />, color: "green", label: "FTTH — Casa", desc: "Fibra até a residência", border: "border-green-400", bg: "bg-green-600 hover:bg-green-700" },
    "Prédio": { icon: <Building2 className="w-8 h-8" />, color: "blue", label: "Prédio / Edifício", desc: "FTTA ou UTP", border: "border-blue-400", bg: "bg-blue-600 hover:bg-blue-700" },
    "Condomínio": { icon: <Users className="w-8 h-8" />, color: "orange", label: "Condomínio de Casas", desc: "Conjunto residencial", border: "border-orange-400", bg: "bg-orange-600 hover:bg-orange-700" },
  } as const;

  const cfg = tipoSelecionado ? tipoConfig[tipoSelecionado] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          {podeViabilizar ? "🏠 Solicitar Viabilização" : "🏢 Consulta de Prédios"}
        </h1>
        <p className="text-gray-500 mt-1">Bem-vindo, <strong>{user?.nome}</strong>!</p>
      </div>

      {podeViabilizar && (
        <>
          {/* Mensagem de sucesso */}
          {successMsg && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-green-800">✅ Solicitação de {successMsg} enviada!</p>
                <p className="text-sm text-green-600 mt-0.5">Acompanhe em "Meus Resultados" no menu.</p>
                <button onClick={() => setSuccessMsg("")} className="text-xs text-green-700 underline mt-1">Fechar</button>
              </div>
            </div>
          )}

          {/* Input localização */}
          <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-600" /> Localização do Cliente
            </h2>
            <div className="flex gap-2 flex-wrap">
              {(["pluscode", "coords"] as InputMethod[]).map((m) => (
                <button key={m} onClick={() => { setInputMethod(m); setLocationInput(""); setInputValid(null); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${inputMethod === m ? "bg-indigo-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                  {m === "pluscode" ? "Plus Code" : "Coordenadas"}
                </button>
              ))}
              <button
                onClick={() => setShowLocationPicker(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors flex items-center gap-1.5"
              >
                🛰️ Selecionar no Mapa
              </button>
            </div>
            <div>
              <input type="text" value={locationInput}
                onChange={(e) => setLocationInput(e.target.value.toUpperCase())}
                placeholder={inputMethod === "pluscode" ? "Ex: 8J3G+WGV" : "Ex: -28.695133, -49.373710"}
                className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                  inputValid === null ? "border-gray-300 focus:ring-indigo-500"
                  : inputValid ? "border-green-400 focus:ring-green-400 bg-green-50"
                  : "border-red-400 focus:ring-red-400 bg-red-50"}`}
              />
              {inputValid === true && <p className="text-sm text-green-600 mt-1 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Localização válida</p>}
              {inputValid === false && <p className="text-sm text-red-600 mt-1 flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> Formato inválido</p>}
            </div>
            {validatedPlusCode && (
              <button onClick={abrirModal}
                className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2">
                <Search className="w-4 h-4" /> Viabilizar Esta Localização
              </button>
            )}
          </div>

          {/* Location Picker */}
          {showLocationPicker && (
            <LocationPicker
              onConfirm={(code) => {
                setLocationInput(code);
                setInputMethod("pluscode");
                setInputValid(true);
                setValidatedPlusCode(code);
                setShowLocationPicker(false);
              }}
              onClose={() => setShowLocationPicker(false)}
            />
          )}
        </>
      )}

      {/* Modal 2 etapas */}
      {podeViabilizar && showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">

            {/* Header do modal */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 rounded-t-2xl flex items-center gap-3">
              {modalStep === "form" && (
                <button onClick={() => setModalStep("tipo")} className="text-white/80 hover:text-white transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                </button>
              )}
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">
                  {modalStep === "tipo" ? "Qual o tipo de instalação?" : `Nova solicitação — ${tipoSelecionado}`}
                </h3>
                <p className="text-indigo-200 text-xs mt-0.5">📍 {validatedPlusCode}</p>
              </div>
              <button onClick={fecharModal} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
            </div>

            {/* Etapa 1 — escolher tipo */}
            {modalStep === "tipo" && (
              <div className="p-5 space-y-3">
                {(["FTTH", "Prédio", "Condomínio"] as TipoInstalacao[]).map((tipo) => {
                  const c = tipoConfig[tipo];
                  return (
                    <button key={tipo} onClick={() => selecionarTipo(tipo)}
                      className={`w-full flex items-center gap-4 p-4 border-2 ${c.border} rounded-xl hover:bg-gray-50 transition-colors text-left`}>
                      <div className={`text-${c.color}-600`}>{c.icon}</div>
                      <div>
                        <p className="font-semibold text-gray-900">{c.label}</p>
                        <p className="text-sm text-gray-500">{c.desc}</p>
                      </div>
                      <span className="ml-auto text-gray-300">›</span>
                    </button>
                  );
                })}
                <button onClick={fecharModal} className="w-full py-2.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Cancelar
                </button>
              </div>
            )}

            {/* Etapa 2 — formulário */}
            {modalStep === "form" && cfg && (
              <div className="p-5 space-y-3">
                <input type="text" placeholder="👤 Nome do cliente *" value={nomeCliente}
                  onChange={(e) => setNomeCliente(e.target.value)}
                  className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm" />

                {tipoSelecionado !== "FTTH" && (
                  <>
                    <input type="text"
                      placeholder={tipoSelecionado === "Prédio" ? "🏢 Nome do prédio *" : "🏘️ Nome do condomínio *"}
                      value={nomePredio} onChange={(e) => setNomePredio(e.target.value)}
                      className="w-full px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm" />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="text"
                        placeholder={tipoSelecionado === "Prédio" ? "🏠 Apto *" : "🏠 Casa *"}
                        value={andar} onChange={(e) => setAndar(e.target.value)}
                        className="px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm" />
                      <input type="text"
                        placeholder={tipoSelecionado === "Prédio" ? "Bloco" : "Quadra"}
                        value={bloco} onChange={(e) => setBloco(e.target.value)}
                        className="px-3 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400 text-sm" />
                    </div>
                  </>
                )}

                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer py-1">
                  <input type="checkbox" checked={urgente} onChange={(e) => setUrgente(e.target.checked)} className="w-4 h-4" />
                  🔥 Cliente Presencial (Urgente)
                </label>

                {/* Banner: prédio já estruturado */}
                {buscandoPredio && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-500">
                    <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    Verificando se o prédio já existe no sistema…
                  </div>
                )}
                {!buscandoPredio && matchPredio && (
                  <div className="flex items-start gap-2.5 px-3 py-3 bg-emerald-50 border border-emerald-300 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div className="text-xs text-emerald-800 space-y-0.5">
                      <p className="font-semibold text-sm">🏗️ Prédio já estruturado no sistema!</p>
                      <p><strong>{matchPredio.predio.predio_ftta}</strong></p>
                      <p className="text-emerald-700">
                        {matchPredio.porProximidade && matchPredio.porNome
                          ? `📍 ${Math.round(matchPredio.distancia)}m de distância · nome similar`
                          : matchPredio.porProximidade
                          ? `📍 ${Math.round(matchPredio.distancia)}m de distância`
                          : "📝 Nome similar ao cadastrado"}
                        {matchPredio.predio.data_auditoria && ` · estruturado em ${new Date(matchPredio.predio.data_auditoria).toLocaleDateString("pt-BR")}`}
                      </p>
                      <p className="text-emerald-600 pt-0.5">A estrutura já está pronta — você pode continuar com a solicitação normalmente.</p>
                    </div>
                  </div>
                )}

                <button onClick={handleConfirm} disabled={loading}
                  className={`w-full ${cfg.bg} disabled:opacity-50 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2`}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : `Confirmar ${tipoSelecionado}`}
                </button>

                <button onClick={fecharModal} className="w-full py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tabelas de consulta */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <div className="flex border-b">
          {["🏢 Prédios Atendidos", "❌ Sem Viabilidade"].map((tab, i) => (
            <button key={i} onClick={() => setActiveTab(i)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === i ? "text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50" : "text-gray-500 hover:bg-gray-50"}`}>
              {tab}
            </button>
          ))}
        </div>

        <div className="p-4 space-y-3">
          {activeTab === 0 ? (
            <>
              <p className="font-semibold text-gray-700 text-sm">🏢 Prédios/Condomínios com Estrutura Instalada</p>
              <input type="text" placeholder="🔍 Buscar por nome do prédio/condomínio..."
                value={searchAtendidos} onChange={(e) => setSearchAtendidos(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <div className="overflow-auto rounded-lg border max-h-72">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Condomínio</th>
                      <th className="text-left px-4 py-3 font-medium">Tecnologia</th>
                      <th className="text-left px-4 py-3 font-medium">Giga</th>
                      <th className="text-left px-4 py-3 font-medium">Observação</th>
                      <th className="text-left px-4 py-3 font-medium">Localização</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredAtendidos.length === 0
                      ? <tr><td colSpan={5} className="text-center py-8 text-gray-400">Nenhum registro</td></tr>
                      : filteredAtendidos.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{p.condominio}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.tecnologia === "FTTA" ? "bg-blue-100 text-blue-700"
                              : p.tecnologia === "UTP" ? "bg-green-100 text-green-700"
                              : "bg-orange-100 text-orange-700"}`}>
                              {p.tecnologia}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs">
                            {p.tecnologia === "FTTA" || p.giga ? "⚡ Giga" : "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[180px] truncate">{p.observacao ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs"><a href={`https://maps.google.com/?q=${encodeURIComponent(p.localizacao)}`} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 hover:underline" title="Ver no Google Maps">{locationToPlusCode(p.localizacao)}</a></td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <input type="text" placeholder="🔍 Buscar prédio sem viabilidade..."
                value={searchSemViab} onChange={(e) => setSearchSemViab(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
              <div className="overflow-auto rounded-lg border max-h-64">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium">Condomínio</th>
                      <th className="text-left px-4 py-3 font-medium">Localização</th>
                      <th className="text-left px-4 py-3 font-medium">Motivo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredSemViab.length === 0
                      ? <tr><td colSpan={3} className="text-center py-8 text-gray-400">Nenhum registro</td></tr>
                      : filteredSemViab.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium">{p.condominio}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500"><a href={`https://maps.google.com/?q=${encodeURIComponent(p.localizacao)}`} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600 hover:underline" title="Ver no Google Maps">{locationToPlusCode(p.localizacao)}</a></td>
                          <td className="px-4 py-3 text-gray-600 whitespace-pre-wrap">{p.observacao}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
