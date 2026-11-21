"use client";

import { useState, useEffect } from "react";
import { Camera, X } from "lucide-react";
import { MAX_FOTOS_DEMANDA } from "@/components/analise-rede/constantes";

// ── Lightbox de foto ──────────────────────────────────────
export function FotoLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <button onClick={onClose} aria-label="Fechar" className="absolute top-4 right-4 text-white/80 hover:text-white p-2">
        <X className="w-6 h-6" />
      </button>
      <img src={url} alt="Foto ampliada" className="max-w-full max-h-full object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

// ── Seletor de fotos (novas + existentes) ─────────────────
export function FotoPicker({ fotos, onFotosChange, existentes, onRemoveExistente, max = MAX_FOTOS_DEMANDA }: {
  fotos: File[];
  onFotosChange: (fotos: File[]) => void;
  existentes?: string[];
  onRemoveExistente?: (index: number) => void;
  max?: number;
}) {
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = fotos.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [fotos]);

  const totalExistentes = existentes?.length ?? 0;
  const total = totalExistentes + fotos.length;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length === 0) return;
    const limite = Math.max(0, max - totalExistentes);
    onFotosChange([...fotos, ...selected].slice(0, limite));
    e.target.value = "";
  }

  return (
    <div>
      <label className="flex items-center gap-1.5 text-xs text-gray-500 mb-1">
        <Camera className="w-3.5 h-3.5" /> Fotos (opcional, até {max})
      </label>
      {(totalExistentes > 0 || previews.length > 0) && (
        <div className="grid grid-cols-4 gap-2 mb-2">
          {existentes?.map((url, i) => (
            <div key={url} className="relative aspect-square">
              <img src={url} alt={`Foto ${i + 1}`} className="w-full h-full object-cover rounded-lg border" />
              <button type="button" onClick={() => onRemoveExistente?.(i)} aria-label="Remover foto"
                className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {previews.map((url, i) => (
            <div key={url} className="relative aspect-square">
              <img src={url} alt={`Nova foto ${i + 1}`} className="w-full h-full object-cover rounded-lg border" />
              <button type="button" onClick={() => onFotosChange(fotos.filter((_, x) => x !== i))} aria-label="Remover foto"
                className="absolute -top-1.5 -right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      {total < max && (
        <label className="flex items-center justify-center gap-2 border-2 border-dashed rounded-lg py-2.5 text-xs text-gray-600 cursor-pointer hover:bg-gray-50">
          <Camera className="w-3.5 h-3.5" />
          {total > 0 ? `Adicionar mais (${total}/${max})` : "Tirar foto ou escolher da galeria"}
          <input type="file" accept="image/*" capture="environment" multiple onChange={handleChange} className="hidden" />
        </label>
      )}
    </div>
  );
}

