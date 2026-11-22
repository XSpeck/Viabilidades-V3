"use client";

import { useState, useEffect, useRef } from "react";
import { compararCtos, getCtos, importCtosToFirestore, infoCtosNoFirestore, parseCtoKml, type Cto, type DiferencaCtos } from "@/lib/ctos";
import { useAuth } from "@/contexts/AuthContext";
import { formatDateTime } from "@/lib/pluscode";
import { Loader2, Upload, CheckCircle, AlertTriangle, MapPin } from "lucide-react";

// =====================
// Card: Importar CTOs
// =====================
export default function ImportCtos() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [ctosNoFirebase, setCtosNoFirebase] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ count: number; ctos: Cto[]; dif: DiferencaCtos | null } | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [ultima, setUltima] = useState<{ atualizado_em?: string; importado_por?: string }>({});
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    infoCtosNoFirestore()
      .then((i) => { setCtosNoFirebase(i.total); setUltima(i); })
      .catch(() => setCtosNoFirebase(0))
      .finally(() => setLoadingCount(false));
  }, []);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(null);
    setResult(null);
    setParseError(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const text = ev.target?.result as string;
      try {
        const ctos = parseCtoKml(text);
        if (ctos.length === 0) {
          setParseError("Nenhuma CTO encontrada no arquivo. Verifique se é um KML válido com Placemarks.");
        } else {
          // compara com a base atual antes de trocar
          let dif: DiferencaCtos | null = null;
          try { dif = compararCtos(await getCtos(), ctos); } catch { dif = null; }
          setPreview({ count: ctos.length, ctos, dif });
          setConfirmando(false);
        }
      } catch (err) {
        setParseError(`Erro ao ler o arquivo: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(f);
  }

  async function handleImport() {
    if (!file || !preview) return;
    setImporting(true);
    setResult(null);
    setProgress({ done: 0, total: preview.count });

    try {
      const ctos = preview.ctos;

      await importCtosToFirestore(ctos, (done, total) => {
        setProgress({ done, total });
      }, user?.nome);
      setUltima({ atualizado_em: new Date().toISOString(), importado_por: user?.nome });
      setConfirmando(false);

      setCtosNoFirebase(ctos.length);
      setResult({ ok: true, msg: `✅ ${ctos.length} CTOs importadas com sucesso!` });
      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";

      // Limpar cache de sessão para forçar recarregamento
      try { sessionStorage.removeItem("viab_ctos_v3"); } catch {}
    } catch (err) {
      setResult({ ok: false, msg: `❌ Erro: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setImporting(false);
    }
  }

  const progressPct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Header do card */}
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50">
        <MapPin className="w-5 h-5 text-indigo-600" />
        <div>
          <h3 className="font-semibold text-gray-800">Importar CTOs</h3>
          <p className="text-xs text-gray-500">Carregar arquivo KML com posições das caixas</p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Status atual */}
        <div className="flex items-center justify-between bg-indigo-50 border border-indigo-100 rounded-lg px-4 py-3">
          <span className="text-sm text-gray-600">CTOs no Firebase:</span>
          {loadingCount ? (
            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
          ) : (
            <span className={`text-sm font-bold ${(ctosNoFirebase ?? 0) > 0 ? "text-green-700" : "text-red-600"}`}>
              {(ctosNoFirebase ?? 0) > 0 ? `✅ ${ctosNoFirebase} CTOs` : "⚠️ Nenhuma CTO importada"}
            </span>
          )}
        </div>

        {/* Upload */}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-xl p-6 text-center cursor-pointer transition-colors group"
        >
          <Upload className="w-8 h-8 text-gray-400 group-hover:text-indigo-500 mx-auto mb-2 transition-colors" />
          <p className="text-sm font-medium text-gray-600 group-hover:text-indigo-600">
            {file ? file.name : "Clique para selecionar o arquivo KML"}
          </p>
          <p className="text-xs text-gray-400 mt-1">Apenas arquivos .kml</p>
          <input
            ref={fileRef}
            type="file"
            accept=".kml"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* Erro de parse */}
        {parseError && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            {parseError}
          </div>
        )}

        {/* Preview */}
        {preview && !parseError && (
          <div className="space-y-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            <p className="flex items-center gap-2"><CheckCircle className="h-4 w-4 shrink-0 text-green-600" /><span><strong>{preview.count} CTOs</strong> no arquivo.</span></p>
            {preview.dif ? (
              <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs sm:grid-cols-4">
                <li><strong className="text-green-700">{preview.dif.novas.length}</strong> novas</li>
                <li><strong className={preview.dif.removidas.length ? "text-red-700" : ""}>{preview.dif.removidas.length}</strong> somem</li>
                <li><strong className={preview.dif.movidas.length ? "text-amber-700" : ""}>{preview.dif.movidas.length}</strong> mudam de lugar</li>
                <li><strong>{preview.dif.iguais}</strong> iguais</li>
              </ul>
            ) : <p className="text-xs">Não foi possível comparar com a base atual.</p>}
            {preview.dif && preview.dif.removidas.length > 0 && (
              <details className="text-xs text-red-700">
                <summary className="cursor-pointer">Ver as que somem</summary>
                <p className="mt-1 max-h-32 overflow-auto break-words">{preview.dif.removidas.slice(0, 200).join(", ")}{preview.dif.removidas.length > 200 ? "…" : ""}</p>
              </details>
            )}
          </div>
        )}

        {/* Progresso */}
        {importing && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Importando...</span>
              <span>{progress.done} / {progress.total}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Resultado */}
        {result && (
          <div className={`flex items-start gap-2 rounded-lg px-4 py-3 text-sm ${result.ok ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            {result.ok
              ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
              : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
            {result.msg}
          </div>
        )}

        {/* Botão */}
        {confirmando && preview && !importing && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <span className="flex-1">Trocar as {ctosNoFirebase ?? 0} CTOs atuais pelas {preview.count} do arquivo?</span>
            <button type="button" onClick={handleImport} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700">Sim, importar</button>
            <button type="button" onClick={() => setConfirmando(false)} className="text-xs text-amber-800 underline">Não</button>
          </div>
        )}

        <button
          onClick={() => setConfirmando(true)}
          disabled={!preview || importing || confirmando}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
        >
          {importing ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Importando...</>
          ) : (
            <><Upload className="w-4 h-4" /> Importar CTOs</>
          )}
        </button>

        {(ctosNoFirebase ?? 0) > 0 && !importing && (
          <p className="text-xs text-gray-400 text-center">
            A importação substitui todas as CTOs existentes.
            {ultima.atualizado_em && ` Última: ${formatDateTime(ultima.atualizado_em)}${ultima.importado_por ? ` por ${ultima.importado_por}` : ""}.`}
          </p>
        )}
      </div>
    </div>
  );
}

