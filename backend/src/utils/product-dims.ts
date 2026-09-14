/** Coerce product shipping fields; `JSON.stringify(NaN)` becomes null and looks missing. */

export function parseWeightKg(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim().toLowerCase().replace(/,/g, "");
  if (!trimmed) return null;

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(kg|g|gram|grams)?$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;

  const unit = match[2];
  if (unit === "g" || unit === "gram" || unit === "grams") {
    return value / 1000;
  }
  return value;
}

export function parseDimensionCm(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw >= 0 ? raw : null;
  }
  if (typeof raw !== "string") return null;

  const trimmed = raw.trim().toLowerCase().replace(/,/g, "");
  if (!trimmed) return null;

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(cm|mm)?$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;

  if (match[2] === "mm") return value / 10;
  return value;
}
