"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { createViabilizacao, getPrediosAtendidos, getPrediosSemViabilidade } from "@/lib/firestore";
import { validatePlusCode, plusCodeToCoords } from "@/lib/pluscode";
import type { TipoInstalacao, PredioAtendido, PredioSemViabilidade } from "@/types";
import { MapPin, Search, CheckCircle, XCircle, Loader2, Building2, Home, Users } from "lucide-react";

type InputMethod = "pluscode" | "coords";

export default function HomePage() {
  const { user } = useAuth();
  const [inputMethod, setInputMethod] = useState<InputMethod>("pluscode");
  const [locationInput, setLocationInput] = useState("");
  const [validatedPlusCode, setValidatedPlusCode] = useState<string | null>(null);
  const [inputValid, setInputValid] = useState<boolean | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [loading, setLoading] = useState(false);

  // Dados de prédios
  const [prediosAtendidos, setPrediosAtendidos] = useState<PredioAtendido[]>([]);
  const [prediosSemViab, setPrediosSemViab] = useState<PredioSemViabilidade[]>([]);
  const [searchAtendidos, setSearchAtendidos] = useState("");
  const [searchSemViab, setSearchSemViab] = useState("");

  // Campos FTTH
  const [nomeClienteFtth, setNomeClienteFtth] = useState("");
  const [urgenteFtth, setUrgenteFtth] = useState(false);

  // Campos Prédio
  const [nomeClientePredio, setNomeClientePredio] = useState("");
  const [nomePredio, setNomePredio] = useState("");
  const [andarPredio, setAndarPredio] = useState("");
  const [blocoPredio, setBlocoPredio] = useState("");
  const [urgentePredio, setUrgentePredio] = useState(false);

  // Campos Condomínio
  const [nomeClienteCond, setNomeClienteCond] = useState("");
  const [nomeCond, setNomeCond] = useState("");
  const [casaCond, setCasaCond] = useState("");
  const [blocoCond, setBlocoCond] = useState("");
  const [urgenteCond, setUrgenteCond] = useState(false);

  useEffect(() => {
    getPrediosAtendidos().then(setPrediosAtendidos);
    getPrediosSemViabilidade().then(setPrediosSemViab);
  }, []);

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
        } else {
          setInputValid(false);
          setValidatedPlusCode(null);
        }
      } else {
        setInputValid(false);
        setValidatedPlusCode(null);
      }
    }
  }, [locationInput, inputMethod]);

  async function handleConfirm(tipo: TipoInstalacao) {
    if (!validatedPlusCode || !user) return;
    setLoading(true);
    try {
      let nomeCliente = "";
      let nomePredioVal: string | undefined;
      let andar: string | undefined;
      let bloco: string | undefined;
      let urgente = false;

      if (tipo === "FTTH") {
        if (!nomeClienteFtth.trim()) { alert("Informe o nome do cliente!"); setLoading(false); return; }
        nomeCliente = nomeClienteFtth.trim();
        urgente = urgenteFtth;
      } else if (tipo === "Prédio") {
        if (!nomeClientePredio.trim() || !nomePredio.trim() || !andarPredio.trim()) {
          alert("Preencha todos os campos obrigatórios!"); setLoading(false); return;
        }
        nomeCliente = nomeClientePredio.trim();
        nomePredioVal = nomePredio.trim();
        andar = andarPredio.trim();
        bloco = blocoPredio.trim() || undefined;
        urgente = urgentePredio;
      } else {
        if (!nomeClienteCond.trim() || !nomeCond.trim() || !casaCond.trim()) {
          alert("Preencha todos os campos obrigatórios!"); setLoading(false); return;
        }
        nomeCliente = nomeClienteCond.trim();
        nomePredioVal = nomeCond.trim();
        andar = casaCond.trim();
        bloco = blocoCond.trim() || undefined;
        urgente = urgenteCond;
      }

      await createViabilizacao({
        usuario: user.nome,
        nome_cliente: nomeCliente,
        plus_code_cliente: validatedPlusCode,
        tipo_instalacao: tipo,
        urgente,
        status: "pendente",
        predio_ftta: nomePredioVal,
        andar_predio: andar,
        bloco_predio: bloco,
      });

      setShowModal(false);
      setSuccessMsg(tipo);
      setLocationInput("");
      setValidatedPlusCode(null);
      setNomeClienteFtth(""); setNomePredio(""); setNomeClientePredio(""); setAndarPredio(""); setBlocoPredio("");
      setNomeClienteCond(""); setNomeCond(""); setCasaCond(""); setBlocoCond("");
    } catch (e) {
      alert("Erro ao criar solicitação. Tente novamente.");
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">🏠 Solicitar Viabilização</h1>
        <p className="text-gray-500 mt-1">Bem-vindo, <strong>{user?.nome}</strong>!</p>
      </div>

      {/* Mensagem de sucesso */}
      {successMsg && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-green-800">✅ Solicitação de {successMsg} enviada!</p>
            <p className="text-sm text-green-600 mt-0.5">Acompanhe em "Meus Resultados" no menu.</p>
            <button onClick={() => setSuccessMsg("")} className="text-xs text-green-700 underline mt-1">
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* Input localização */}
      <div className="bg-white rounded-xl shadow-sm border p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <MapPin className="w-5 h-5 text-indigo-600" /> Localização do Cliente
        </h2>

        {/* Toggle método */}
        <div className="flex gap-2">
          {(["pluscode", "coords"] as InputMethod[]).map((m) => (
            <button
              key={m}
              onClick={() => { setInputMethod(m); setLocationInput(""); setInputValid(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                inputMethod === m
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {m === "pluscode" ? "Plus Code" : "Coordenadas"}
            </button>
          ))}
        </div>

        <div>
          <input
            type="text"
            value={locationInput}
            onChange={(e) => setLocationInput(e.target.value.toUpperCase())}
            placeholder={inputMethod === "pluscode" ? "Ex: 8J3G+WGV" : "Ex: -28.695133, -49.373710"}
            className={`w-full px-4 py-2.5 border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
              inputValid === null
                ? "border-gray-300 focus:ring-indigo-500"
                : inputValid
                ? "border-green-400 focus:ring-green-400 bg-green-50"
                : "border-red-400 focus:ring-red-400 bg-red-50"
            }`}
          />
          {inputValid === true && (
            <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" /> Localização válida
            </p>
          )}
          {inputValid === false && (
            <p className="text-sm text-red-600 mt-1 flex items-center gap-1">
              <XCircle className="w-3.5 h-3.5" /> Formato inválido
            </p>
          )}
        </div>

        {validatedPlusCode && (
          <button
            onClick={() => setShowModal(true)}
            className="w-full sm:w-auto bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2"
          >
            <Search className="w-4 h-4" /> Viabilizar Esta Localização
          </button>
        )}
      </div>

      {/* Modal de seleção de tipo */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-6 rounded-t-2xl">
              <h3 className="text-xl font-bold text-white text-center">🏠 Qual o tipo de instalação?</h3>
              <p className="text-indigo-200 text-sm text-center mt-1">{validatedPlusCode}</p>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* FTTH */}
              <div className="border-2 border-green-200 rounded-xl p-4 space-y-3">
                <div className="text-center">
                  <Home className="w-10 h-10 text-green-600 mx-auto" />
                  <h4 className="font-semibold text-gray-800 mt-2">FTTH — Casa</h4>
                  <p className="text-xs text-gray-500">Fibra até a residência</p>
                </div>
                <input
                  type="text"
                  placeholder="👤 Nome do cliente *"
                  value={nomeClienteFtth}
                  onChange={(e) => setNomeClienteFtth(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-green-400"
                />
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={urgenteFtth} onChange={(e) => setUrgenteFtth(e.target.checked)} />
                  🔥 Cliente Presencial (Urgente)
                </label>
                <button
                  onClick={() => handleConfirm("FTTH")}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar FTTH"}
                </button>
              </div>

              {/* Prédio */}
              <div className="border-2 border-blue-200 rounded-xl p-4 space-y-3">
                <div className="text-center">
                  <Building2 className="w-10 h-10 text-blue-600 mx-auto" />
                  <h4 className="font-semibold text-gray-800 mt-2">Prédio / Edifício</h4>
                  <p className="text-xs text-gray-500">FTTA ou UTP</p>
                </div>
                <input type="text" placeholder="👤 Nome do cliente *" value={nomeClientePredio} onChange={(e) => setNomeClientePredio(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <input type="text" placeholder="🏢 Nome do prédio *" value={nomePredio} onChange={(e) => setNomePredio(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="🏠 Apto *" value={andarPredio} onChange={(e) => setAndarPredio(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  <input type="text" placeholder="Bloco" value={blocoPredio} onChange={(e) => setBlocoPredio(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={urgentePredio} onChange={(e) => setUrgentePredio(e.target.checked)} />
                  🔥 Cliente Presencial (Urgente)
                </label>
                <button onClick={() => handleConfirm("Prédio")} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Prédio"}
                </button>
              </div>

              {/* Condomínio */}
              <div className="border-2 border-orange-200 rounded-xl p-4 space-y-3">
                <div className="text-center">
                  <Users className="w-10 h-10 text-orange-600 mx-auto" />
                  <h4 className="font-semibold text-gray-800 mt-2">Condomínio de Casas</h4>
                  <p className="text-xs text-gray-500">Conjunto residencial</p>
                </div>
                <input type="text" placeholder="👤 Nome do cliente *" value={nomeClienteCond} onChange={(e) => setNomeClienteCond(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <input type="text" placeholder="🏘️ Nome do condomínio *" value={nomeCond} onChange={(e) => setNomeCond(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="🏠 Casa *" value={casaCond} onChange={(e) => setCasaCond(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
                  <input type="text" placeholder="Quadra" value={blocoCond} onChange={(e) => setBlocoCond(e.target.value)} className="px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-400" />
                </div>
                <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                  <input type="checkbox" checked={urgenteCond} onChange={(e) => setUrgenteCond(e.target.checked)} />
                  🔥 Cliente Presencial (Urgente)
                </label>
                <button onClick={() => handleConfirm("Condomínio")} disabled={loading} className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-orange-300 text-white py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirmar Condomínio"}
                </button>
              </div>
            </div>

            <div className="px-6 pb-6">
              <button onClick={() => setShowModal(false)} className="w-full border border-gray-300 text-gray-600 hover:bg-gray-50 py-2.5 rounded-lg text-sm font-medium transition-colors">
                ❌ Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabelas de consulta */}
      <div className="bg-white rounded-xl shadow-sm border">
        <div className="border-b">
          <div className="flex">
            {["✅ Prédios Atendidos", "❌ Sem Viabilidade"].map((tab, i) => (
              <button key={i} className="px-6 py-4 text-sm font-medium text-indigo-600 border-b-2 border-indigo-600">
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 space-y-3">
          <input
            type="text"
            placeholder="🔍 Buscar prédio..."
            value={searchAtendidos}
            onChange={(e) => setSearchAtendidos(e.target.value)}
            className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Condomínio</th>
                  <th className="text-left px-4 py-3 font-medium">Tecnologia</th>
                  <th className="text-left px-4 py-3 font-medium">Giga</th>
                  <th className="text-left px-4 py-3 font-medium">Localização</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredAtendidos.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">Nenhum registro</td></tr>
                ) : filteredAtendidos.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{p.condominio}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.tecnologia === "FTTA" ? "bg-blue-100 text-blue-700" :
                        p.tecnologia === "UTP" ? "bg-green-100 text-green-700" :
                        "bg-orange-100 text-orange-700"
                      }`}>{p.tecnologia}</span>
                    </td>
                    <td className="px-4 py-3">{p.giga ? "⚡ Sim" : "Não"}</td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">{p.localizacao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
