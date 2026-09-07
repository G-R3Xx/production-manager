"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type WeatherDay = {
  date: string;
  weatherCode: number | null;
  maxC: number | null;
  minC: number | null;
  rainChance: number | null;
  rainMm: number | null;
};

type WeatherSnapshot = {
  ok: boolean;
  location?: string;
  timezone?: string;
  current?: {
    temperatureC: number | null;
    apparentC: number | null;
    weatherCode: number | null;
  };
  daily?: WeatherDay[];
};

function weatherDescription(code: number | null | undefined): { icon: string; label: string } {
  if (code == null) return { icon: "○", label: "Weather" };
  if (code === 0) return { icon: "☀", label: "Clear" };
  if (code === 1) return { icon: "☀", label: "Mostly clear" };
  if (code === 2) return { icon: "◒", label: "Partly cloudy" };
  if (code === 3) return { icon: "☁", label: "Cloudy" };
  if (code === 45 || code === 48) return { icon: "≋", label: "Fog" };
  if ([51, 53, 55, 56, 57].includes(code)) return { icon: "☂", label: "Drizzle" };
  if ([61, 63, 65, 66, 67].includes(code)) return { icon: "☂", label: "Rain" };
  if ([71, 73, 75, 77].includes(code)) return { icon: "❄", label: "Snow" };
  if ([80, 81, 82].includes(code)) return { icon: "☂", label: "Showers" };
  if ([85, 86].includes(code)) return { icon: "❄", label: "Snow showers" };
  if ([95, 96, 99].includes(code)) return { icon: "ϟ", label: "Thunderstorm" };
  return { icon: "○", label: "Weather" };
}

function rounded(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(Math.round(value)) : "—";
}

function rainAmount(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "— mm";
  if (value === 0) return "0 mm";
  if (value < 1) return `${value.toFixed(1)} mm`;
  return `${Math.round(value * 10) / 10} mm`;
}

const panelStyle = {
  minHeight: 42,
  borderRadius: 14,
  border: "1px solid #dbe4f0",
  background: "rgba(255,255,255,.96)",
  boxShadow: "0 8px 22px rgba(15,23,42,.06)",
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "0 13px",
  minWidth: 0,
  overflow: "hidden",
} as const;

const eyebrowStyle = {
  color: "#64748b",
  fontSize: 10,
  lineHeight: 1,
  fontWeight: 950,
  letterSpacing: ".07em",
  textTransform: "uppercase" as const,
  flex: "0 0 auto",
} as const;

export function CurrentInfoBar() {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  const refreshWeather = useCallback(async () => {
    try {
      const response = await fetch("/api/current-weather", {
        cache: "no-store",
        credentials: "same-origin",
      });
      if (!response.ok) return;
      const snapshot = await response.json() as WeatherSnapshot;
      if (snapshot.ok) setWeather(snapshot);
    } catch {
      // Weather is optional convenience information; the app should never be interrupted by it.
    }
  }, []);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    void refreshWeather();
    const timer = window.setInterval(() => void refreshWeather(), 30 * 60_000);
    const onFocus = () => void refreshWeather();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [refreshWeather]);

  const timeZone = weather?.timezone || "Australia/Sydney";
  const formatted = useMemo(() => {
    const date = new Intl.DateTimeFormat("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone,
    }).format(now);
    const time = new Intl.DateTimeFormat("en-AU", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
      timeZone,
    }).format(now);
    return { date, time };
  }, [now, timeZone]);

  const currentCondition = weatherDescription(weather?.current?.weatherCode);
  const today = weather?.daily?.[0];
  const tomorrow = weather?.daily?.[1];
  const todayCondition = weatherDescription(today?.weatherCode);
  const tomorrowCondition = weatherDescription(tomorrow?.weatherCode);

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "stretch", flexWrap: "wrap", flex: "1 1 900px", minWidth: 0 }}>
      <div style={{ ...panelStyle, flex: "1 1 280px" }} title="Current workspace date and time">
        <span aria-hidden="true" style={{ fontSize: 17, color: "#2563eb", lineHeight: 1 }}>◷</span>
        <span style={eyebrowStyle}>Current</span>
        <strong style={{ fontSize: 13, whiteSpace: "nowrap" }}>{formatted.date}</strong>
        <span style={{ color: "#cbd5e1" }}>·</span>
        <strong style={{ fontSize: 13, color: "#1d4ed8", whiteSpace: "nowrap" }}>{formatted.time}</strong>
      </div>

      <div style={{ ...panelStyle, flex: "1 1 245px" }} title={weather?.location ? `Current weather for ${weather.location}` : "Current weather"}>
        <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>{currentCondition.icon}</span>
        <span style={eyebrowStyle}>Now</span>
        <strong style={{ fontSize: 13, whiteSpace: "nowrap" }}>{rounded(weather?.current?.temperatureC)}°</strong>
        <span style={{ color: "#475569", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{weather ? currentCondition.label : "Loading weather…"}</span>
        {weather?.location ? <span style={{ marginLeft: "auto", color: "#94a3b8", fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{weather.location.split(",")[0]}</span> : null}
      </div>

      <div style={{ ...panelStyle, flex: "1 1 275px" }} title="Today's temperature range and precipitation forecast">
        <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>{todayCondition.icon}</span>
        <span style={eyebrowStyle}>Today</span>
        <strong style={{ fontSize: 12, whiteSpace: "nowrap" }}>{rounded(today?.minC)}°–{rounded(today?.maxC)}°</strong>
        <span style={{ color: "#475569", fontSize: 12, whiteSpace: "nowrap" }}>Rain {rounded(today?.rainChance)}%</span>
        <span style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap" }}>· {rainAmount(today?.rainMm)}</span>
      </div>

      <div style={{ ...panelStyle, flex: "1 1 285px" }} title="Tomorrow's temperature range and precipitation forecast">
        <span aria-hidden="true" style={{ fontSize: 17, lineHeight: 1 }}>{tomorrowCondition.icon}</span>
        <span style={eyebrowStyle}>Tomorrow</span>
        <strong style={{ fontSize: 12, whiteSpace: "nowrap" }}>{rounded(tomorrow?.minC)}°–{rounded(tomorrow?.maxC)}°</strong>
        <span style={{ color: "#475569", fontSize: 12, whiteSpace: "nowrap" }}>Rain {rounded(tomorrow?.rainChance)}%</span>
        <span style={{ color: "#94a3b8", fontSize: 11, whiteSpace: "nowrap" }}>· {rainAmount(tomorrow?.rainMm)}</span>
      </div>
    </div>
  );
}
