"use client";

import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";

/**
 * Zoom pela roda do mouse só com Ctrl apertado (a página rola normalmente por cima do mapa).
 * Use com scrollWheelZoom={false} no MapContainer. Pinça no touchpad também chega com Ctrl.
 */
export default function ZoomComCtrl() {
  const map = useMap();
  const [aviso, setAviso] = useState(false);

  useEffect(() => {
    const el = map.getContainer();
    let timer: number | undefined;
    let ultimo = 0;
    let acumulado = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setAviso(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setAviso(false), 1300);
        return;
      }
      e.preventDefault();
      setAviso(false);
      acumulado += e.deltaY;
      const agora = Date.now();
      // Touchpad manda muitos eventos pequenos: junta e aplica no máximo 1 nível a cada 120 ms
      if (Math.abs(acumulado) < 40 || agora - ultimo < 120) return;
      ultimo = agora;
      const passo = acumulado < 0 ? 1 : -1;
      acumulado = 0;
      map.setZoomAround(map.mouseEventToLatLng(e), map.getZoom() + passo);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.clearTimeout(timer);
    };
  }, [map]);

  if (!aviso) return null;
  return (
    <div className="absolute inset-0 z-[800] flex items-center justify-center bg-black/30 pointer-events-none rounded-xl">
      <span className="bg-white/95 text-gray-800 text-sm font-medium px-3 py-1.5 rounded-lg shadow">
        Segure Ctrl e role para dar zoom no mapa
      </span>
    </div>
  );
}
