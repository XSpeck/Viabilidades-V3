"use client";

import { useEffect } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

const icone = L.divIcon({
  html: `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="42" viewBox="0 0 40 55"><path d="M20 2C10.6 2 3 9.6 3 19c0 12.5 17 33 17 33s17-20.5 17-33C37 9.6 29.4 2 20 2z" fill="#4f46e5" stroke="white" stroke-width="2"/><circle cx="20" cy="19" r="7" fill="white"/></svg>`,
  className: "",
  iconSize: [30, 42],
  iconAnchor: [15, 42],
});

function Centralizar({ lat, lon }: { lat: number; lon: number }) {
  const map = useMap();
  useEffect(() => { map.setView([lat, lon], 18); }, [lat, lon, map]);
  return null;
}

/** Mapa pequeno, só para conferir o ponto antes de pedir a viabilidade */
export default function MiniMapa({ lat, lon }: { lat: number; lon: number }) {
  return (
    <MapContainer
      center={[lat, lon]}
      zoom={18}
      className="h-full w-full"
      zoomControl={false}
      attributionControl={false}
      dragging={false}
      scrollWheelZoom={false}
      doubleClickZoom={false}
      touchZoom={false}
      keyboard={false}
    >
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
      <TileLayer url="https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}" maxZoom={19} />
      <Marker position={[lat, lon]} icon={icone} />
      <Centralizar lat={lat} lon={lon} />
    </MapContainer>
  );
}
