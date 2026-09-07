import { NextResponse } from "next/server";
import { getRequiredSessionUser } from "@/server/auth/session";
import { resolveActiveTenantForAuthUserId } from "@/server/bootstrap/activeTenant";
import { getCompanySettingsByTenantId } from "@/server/company";

export const dynamic = "force-dynamic";

type GeocodingResult = {
  latitude?: number;
  longitude?: number;
  name?: string;
  admin1?: string;
  country_code?: string;
  timezone?: string;
};

type GeocodingResponse = {
  results?: GeocodingResult[];
};

type ForecastResponse = {
  timezone?: string;
  current?: {
    temperature_2m?: number;
    apparent_temperature?: number;
    weather_code?: number;
  };
  daily?: {
    time?: string[];
    weather_code?: number[];
    temperature_2m_max?: number[];
    temperature_2m_min?: number[];
    precipitation_probability_max?: number[];
    precipitation_sum?: number[];
  };
};

const AU_STATE_RE = /\b(ACT|NSW|VIC|QLD|SA|WA|TAS|NT)\b/i;
const AU_POSTCODE_RE = /\b\d{4}\b/;

function inferLocality(address: string | null | undefined): string {
  const value = String(address ?? "").replace(/\r/g, "").trim();
  if (!value) return "Canberra";

  const segments = value
    .split(/[\n,]+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (!AU_STATE_RE.test(segment) && !AU_POSTCODE_RE.test(segment)) continue;
    const cleaned = segment
      .replace(AU_POSTCODE_RE, "")
      .replace(AU_STATE_RE, "")
      .replace(/\bAustralia\b/gi, "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned && !/^\d/.test(cleaned)) return cleaned;
  }

  const lastTextSegment = [...segments].reverse().find((segment) => /[A-Za-z]/.test(segment) && !/^\d/.test(segment));
  return lastTextSegment?.replace(/\bAustralia\b/gi, "").trim() || "Canberra";
}

async function geocode(place: string): Promise<GeocodingResult | null> {
  const params = new URLSearchParams({
    name: place,
    count: "5",
    language: "en",
    format: "json",
    countryCode: "AU",
  });
  const response = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params.toString()}`, {
    next: { revalidate: 86_400 },
  });
  if (!response.ok) return null;
  const body = await response.json() as GeocodingResponse;
  const results = body.results ?? [];
  return results.find((result) => String(result.country_code ?? "").toUpperCase() === "AU") ?? results[0] ?? null;
}

async function forecast(latitude: number, longitude: number): Promise<ForecastResponse | null> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,weather_code",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum",
    timezone: "auto",
    forecast_days: "2",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    next: { revalidate: 900 },
  });
  if (!response.ok) return null;
  return await response.json() as ForecastResponse;
}

function numberAt(values: number[] | undefined, index: number): number | null {
  const value = values?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export async function GET() {
  try {
    const user = await getRequiredSessionUser();
    const activeTenant = await resolveActiveTenantForAuthUserId(user.id);
    const settings = activeTenant ? await getCompanySettingsByTenantId(activeTenant.tenantId) : null;
    const requestedPlace = inferLocality(settings?.address);

    let location = await geocode(requestedPlace);
    if (!location && requestedPlace.toLowerCase() !== "canberra") location = await geocode("Canberra");
    if (!location || typeof location.latitude !== "number" || typeof location.longitude !== "number") {
      return NextResponse.json({ ok: false }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
    }

    const data = await forecast(location.latitude, location.longitude);
    if (!data?.daily?.time?.length) {
      return NextResponse.json({ ok: false }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
    }

    const daily = [0, 1].map((index) => ({
      date: data.daily?.time?.[index] ?? "",
      weatherCode: numberAt(data.daily?.weather_code, index),
      maxC: numberAt(data.daily?.temperature_2m_max, index),
      minC: numberAt(data.daily?.temperature_2m_min, index),
      rainChance: numberAt(data.daily?.precipitation_probability_max, index),
      rainMm: numberAt(data.daily?.precipitation_sum, index),
    }));

    return NextResponse.json({
      ok: true,
      location: [location.name, location.admin1].filter(Boolean).join(", "),
      timezone: data.timezone || location.timezone || "Australia/Sydney",
      current: {
        temperatureC: typeof data.current?.temperature_2m === "number" ? data.current.temperature_2m : null,
        apparentC: typeof data.current?.apparent_temperature === "number" ? data.current.apparent_temperature : null,
        weatherCode: typeof data.current?.weather_code === "number" ? data.current.weather_code : null,
      },
      daily,
    }, {
      headers: { "Cache-Control": "private, max-age=300" },
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
