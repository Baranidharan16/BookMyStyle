"use client";
/**
 * Map provider abstraction. The default implementation uses Leaflet with
 * OpenStreetMap tiles (no API key). To switch providers (Google Maps,
 * Mapbox, Ola Maps), implement the same props in another component and swap
 * the dynamic import in `salon-map-lazy.tsx`.
 */
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { useEffect } from "react";
import { formatINR, formatKm } from "@/lib/utils";

export type MapSalon = { id: string; name: string; lat: number; lng: number; ratingAvg: number; distanceKm: number | null; startingPrice: number | null; href: string; service?: string | null };

const pin = (color = "#a3214f") =>
  L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 30 40"><path d="M15 0C6.7 0 0 6.6 0 14.8 0 26 15 40 15 40s15-14 15-25.2C30 6.6 23.3 0 15 0z" fill="${color}"/><circle cx="15" cy="14.5" r="6" fill="#fff"/></svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
    popupAnchor: [0, -36],
  });

function Fit({ points, center }: { points: [number, number][]; center: [number, number] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
    else map.setView(points[0] ?? center, 14);
  }, [map, points, center]);
  return null;
}

export default function SalonMap({ salons, center, you, className, height = 420 }: { salons: MapSalon[]; center: [number, number]; you?: [number, number] | null; className?: string; height?: number }) {
  const points = salons.map((s) => [s.lat, s.lng] as [number, number]);
  return (
    <div className={className} style={{ height }}>
      <MapContainer center={center} zoom={13} scrollWheelZoom={false} className="h-full w-full rounded-2xl" attributionControl>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit points={points} center={center} />
        {you && (
          <Marker position={you} icon={L.divIcon({ className: "", html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#1d5fbf;border:3px solid #fff;box-shadow:0 0 0 6px #1d5fbf33"></span>`, iconSize: [16, 16], iconAnchor: [8, 8] })}>
            <Popup>You are here</Popup>
          </Marker>
        )}
        {salons.map((s) => (
          <Marker key={s.id} position={[s.lat, s.lng]} icon={pin()}>
            <Popup>
              <div style={{ minWidth: 180, fontFamily: "inherit" }}>
                <strong style={{ fontSize: 14 }}>{s.name}</strong>
                <div style={{ fontSize: 12, marginTop: 4, color: "#555" }}>
                  ★ {s.ratingAvg.toFixed(1)}
                  {s.distanceKm != null && ` · ${formatKm(s.distanceKm)}`}
                </div>
                {s.service && <div style={{ fontSize: 12, marginTop: 2 }}>{s.service}</div>}
                {s.startingPrice != null && <div style={{ fontSize: 12, marginTop: 2 }}>From {formatINR(s.startingPrice)}</div>}
                <a href={s.href} style={{ display: "inline-block", marginTop: 8, fontWeight: 700, color: "#a3214f" }}>
                  View salon →
                </a>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
