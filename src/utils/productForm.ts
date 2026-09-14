/** Parse product form numeric fields. `JSON.stringify(NaN)` becomes null and looks "missing" to the API. */

export function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/**
 * Weight field is labeled kg. Accept plain numbers or values with a unit:
 * - "0.2", "0.2kg" → 0.2
 * - "200g", "200 g" → 0.2
 */
export function parseWeightKg(raw: string): number | null {
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

/** Strip optional cm/mm suffix; mm is converted to cm. */
export function parseDimensionCm(raw: string): number | null {
  const trimmed = raw.trim().toLowerCase().replace(/,/g, "");
  if (!trimmed) return null;

  const match = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*(cm|mm)?$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0) return null;

  if (match[2] === "mm") return value / 10;
  return value;
}

export function validatePhysicalShippingFields(input: {
  weight: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
}): { ok: true; weight: number; lengthCm: number; widthCm: number; heightCm: number } | { ok: false; message: string } {
  const weight = parseWeightKg(input.weight);
  const lengthCm = parseDimensionCm(input.lengthCm);
  const widthCm = parseDimensionCm(input.widthCm);
  const heightCm = parseDimensionCm(input.heightCm);

  if (weight == null || lengthCm == null || widthCm == null || heightCm == null) {
    return {
      ok: false,
      message:
        "Enter valid weight in kg (e.g. 0.2 or 200g) and length/width/height in cm for physical products.",
    };
  }

  return { ok: true, weight, lengthCm, widthCm, heightCm };
}
