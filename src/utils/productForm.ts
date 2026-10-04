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

export type PhysicalShipping = {
  weight: number;
  /** Present only when volumetric shipping is on. */
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
};

/**
 * Weight is always required for physical products. Length, width and height
 * only matter when the seller opts in to volumetric (size-based) billing.
 */
export function validatePhysicalShippingFields(input: {
  weight: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  useVolumetric: boolean;
}): ({ ok: true } & PhysicalShipping) | { ok: false; message: string } {
  const weight = parseWeightKg(input.weight);
  if (weight == null || weight <= 0) {
    return { ok: false, message: "Enter the product weight in kg (e.g. 0.2 or 200g)." };
  }
  if (!input.useVolumetric) {
    return { ok: true, weight, lengthCm: null, widthCm: null, heightCm: null };
  }

  const lengthCm = parseDimensionCm(input.lengthCm);
  const widthCm = parseDimensionCm(input.widthCm);
  const heightCm = parseDimensionCm(input.heightCm);
  if (!lengthCm || !widthCm || !heightCm) {
    return {
      ok: false,
      message: "Enter length, width and height in cm to use volumetric shipping, or turn it off.",
    };
  }
  return { ok: true, weight, lengthCm, widthCm, heightCm };
}
