"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { parseCtoKml, importCtosToFirestore, countCtosInFirestore } from "@/lib/ctos";
import { Loader2, Upload, CheckCircle, AlertTriangle, MapPin, Settings } from "lucide-react";

export default function AdminPage() {
  const { user } = useAuth();

  if (user?.nivel !== 1) {
    return (
      <div className="text-center py-20 text-red-500">
        🚫 Acesso restrito a administradores.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="w-7 h-7 text-indigo-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Administração</h1>
          <p className="text-gray-500 text-sm mt-0.5">Configurações e ferramentas do sistema</p>
        </div>
      </div>

      {/* Grid de seções */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Importação de CTOs */}
        <ImportCtos />

        {/* Placeholder para futuras seções */}
        <PlaceholderCard
          icon="👥"
          title="Gestão de Usuários"
          desc="Criar, editar e remover usuários do sistema"
        />

        <PlaceholderCard
          icon="📡"
          title="KMLs de Distribuidoras"
          desc="Importar redes das distribuidoras de energia (CELESC, COOPERA, etc.)"
        />

        <PlaceholderCard
          icon="🔔"
          title="Notificações Telegram"
          desc="Configurar bot e grupos de notificação"
        />
      </div>
    </div>
  );
}

// =====================
// Card: Importar CTOs
// =====================
function ImportCtos() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [ctosNoFirebase, setCtosNoFirebase] = useState<number | null>(null);
  const [loadingCount, setLoadingCount] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ count: number } | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    countCtosInFirestore()
      .then(setCtosNoFirebase)
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
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const ctos = parseCtoKml(text);
        if (ctos.length === 0) {
          setParseError("Nenhuma CTO encontrada no arquivo. Verifique se é um KML válido com Placemarks.");
        } else {
          setPreview({ count: ctos.length });
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
      const text = await file.text();
      const ctos = parseCtoKml(text);

      await importCtosToFirestore(ctos, (done, total) => {
        setProgress({ done, total });
      });

      setCtosNoFirebase(ctos.length);
      setResult({ ok: true, msg: `✅ ${ctos.length} CTOs importadas com sucesso!` });
      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";

      // Limpar cache de sessão para forçar recarregamento
      try { sessionStorage.removeItem("viab_ctos_v2"); } catch {}
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
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
            <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
            <p className="text-sm text-green-700">
              <strong>{preview.count} CTOs</strong> encontradas no arquivo. Pronto para importar.
            </p>
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
        <button
          onClick={handleImport}
          disabled={!preview || importing}
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
            ⚠️ A importação substitui todas as CTOs existentes.
          </p>
        )}
      </div>
    </div>
  );
}

// =====================
// Card placeholder
// =====================
function PlaceholderCard({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden opacity-60">
      <div className="flex items-center gap-3 px-5 py-4 border-b bg-gray-50">
        <span className="text-xl">{icon}</span>
        <div>
          <h3 className="font-semibold text-gray-700">{title}</h3>
          <p className="text-xs text-gray-400">{desc}</p>
        </div>
      </div>
      <div className="px-5 py-8 text-center text-gray-400 text-sm">
        🚧 Em desenvolvimento
      </div>
    </div>
  );
}
