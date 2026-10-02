"use client";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type UserLocation = { label: string; lat: number; lng: number; city?: string; source: "gps" | "manual" | "default" };

const DEFAULT: UserLocation = { label: "Chennai", lat: 13.0569, lng: 80.2425, city: "Chennai", source: "default" };
type State = { location: UserLocation; setLocation: (l: UserLocation) => void; requestGps: () => Promise<UserLocation | null>; gpsState: "idle" | "locating" | "denied" | "unavailable" };
const Ctx = createContext<State | null>(null);

/**
 * Customer location: never forced. Falls back to a default city, supports
 * manual area selection, and requests GPS only on explicit user action.
 */
export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLoc] = useState<UserLocation>(DEFAULT);
  const [gpsState, setGps] = useState<State["gpsState"]>("idle");

  useEffect(() => {
    try {
      const raw = localStorage.getItem("bms-location");
      if (raw) setLoc(JSON.parse(raw));
    } catch {}
  }, []);

  const setLocation = useCallback((l: UserLocation) => {
    setLoc(l);
    try {
      localStorage.setItem("bms-location", JSON.stringify(l));
    } catch {}
  }, []);

  const requestGps = useCallback(async () => {
    if (!("geolocation" in navigator)) {
      setGps("unavailable");
      return null;
    }
    setGps("locating");
    return new Promise<UserLocation | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const l: UserLocation = { label: "Current location", lat: pos.coords.latitude, lng: pos.coords.longitude, source: "gps" };
          setLocation(l);
          setGps("idle");
          resolve(l);
        },
        (err) => {
          setGps(err.code === err.PERMISSION_DENIED ? "denied" : "unavailable");
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
      );
    });
  }, [setLocation]);

  return <Ctx.Provider value={{ location, setLocation, requestGps, gpsState }}>{children}</Ctx.Provider>;
}

export function useUserLocation() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useUserLocation must be used within LocationProvider");
  return c;
}
