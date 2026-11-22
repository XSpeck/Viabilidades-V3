"use client";

import { useState, useEffect, useRef } from "react";
import { importRedeToFirestore, listRedesImportadas, EMPRESAS } from "@/lib/redes";
import { Loader2, Upload, CheckCircle, AlertTriangle, Network } from "lucide-react";

// =====================
// Card: Importar Redes Distribuidoras
// =====================
export default function ImportRedes() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [empresa, setEmpresa] = useState<string>(Object.keys(EMPRESAS)[0]);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [importadas, setImportadas] = useState<{ empresa: string; cor: string; atualizado_em: string }[]>([]);
  const [loadingList, setLoadingList] = useState(true);

  useEffect(() => {
    listRedesImportadas()
      .then(setImportadas)
      .catch(() => setImportadas([]))
      .finally(() => setLoadingList(false));
  }, []);

  async function handleImport() {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const text = await file.text();
      await importRedeToFirestore(empresa, text);
      setResult({ ok: true, msg: `✅ Rede ${empresa} importada!` });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      // Atualiza lista + limpa cache
      const lista = await listRedesImportadas();
      setImportadas(lista);
      try { sessionStorage.removeItem("viab_redes_v1"); } catch {}
    } catch (e) {
      setResult({ ok: false, msg: `❌ Erro: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setImporting(false);
    }
  }

  const empresasNomes = Object.keys(EMPRESAS);

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50">
        <Network className="w-5 h-5 text-indigo-600" />
        <div>
          <h3 className="font-semibold text-gray-800">Redes de Distribuidoras</h3>
          <p className="text-xs text-gray-500">KMLs das empresas de energia (linhas no mapa)</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Status importadas */}
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Status</p>
          {loadingList ? (
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-1.5">
              {empresasNomes.map((e) => {
                const imp = importadas.find((i) => i.empresa === e);
                return (
                  <div key={e} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg bg-gray-50 border">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: EMPRESAS[e].cor }} />
                    <span className="font-medium text-gray-700 truncate">{EMPRESAS[e].label}</span>
                    {imp ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 ml-auto shrink-0" />
                    ) : (
                      <span className="text-gray-300 ml-auto">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Seleção de empresa */}
        <div>
          <label className="block text-xs text-gray-500 mb-1 font-medium">Empresa</label>
          <select
            value={empresa}
            onChange={(e) => { setEmpresa(e.target.value); setFile(null); setResult(null); }}
            className="w-full px-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-400"
          >
            {empresasNomes.map((e) => (
              <option key={e} value={e}>{EMPRESAS[e].label}</option>
            ))}
          </select>
        </div>

        {/* Upload */}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-xl p-4 text-center cursor-pointer transition-colors group"
        >
          <Upload className="w-6 h-6 text-gray-400 group-hover:text-indigo-500 mx-auto mb-1 transition-colors" />
          <p className="text-sm font-medium text-gray-600 group-hover:text-indigo-600">
            {file ? file.name : `Selecionar KML da ${EMPRESAS[empresa].label}`}
          </p>
          <input ref={fileRef} type="file" accept=".kml" className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
        </div>

        {result && (
          <div className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${result.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {result.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            {result.msg}
          </div>
        )}

        <button
          onClick={handleImport}
          disabled={!file || importing}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2"
        >
          {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</> : <><Upload className="w-4 h-4" /> Importar {EMPRESAS[empresa].label}</>}
        </button>
      </div>
    </div>
  );
}

