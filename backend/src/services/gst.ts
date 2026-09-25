import { env } from "../config/env.js";

/** Fraction 0–1. Env default is 0.18. */
export function defaultGstFraction() {
  return env.TAX_RATE;
}

export function defaultGstPercent() {
  return Math.round(env.TAX_RATE * 10000) / 100;
}

/** Null or invalid category rate falls back to the default (18%). */
export function gstFractionFromPercent(percent: number | string | null | undefined) {
  if (percent === null || percent === undefined || percent === "") {
    return defaultGstFraction();
  }
  const value = Number(percent);
  if (!Number.isFinite(value)) return defaultGstFraction();
  const clamped = Math.min(100, Math.max(0, value));
  return clamped / 100;
}

export function appliedGstPercent(percent: number | string | null | undefined) {
  return Math.round(gstFractionFromPercent(percent) * 10000) / 100;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/**
 * GST on each line after a proportional share of the order discount.
 * The order stores the blended rate so a mixed cart still has one tax_rate.
 */
export function taxForLines(
  lines: { gross: number; gstPercent: number | string | null | undefined }[],
  discountAmount: number
) {
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.gross, 0));
  if (subtotal <= 0 || lines.length === 0) {
    return { taxAmount: 0, taxRate: defaultGstFraction() };
  }

  const discount = Math.min(Math.max(discountAmount, 0), subtotal);
  let allocated = 0;
  let taxAmount = 0;

  lines.forEach((line, index) => {
    const isLast = index === lines.length - 1;
    const share = isLast
      ? roundMoney(discount - allocated)
      : roundMoney((discount * line.gross) / subtotal);
    allocated = roundMoney(allocated + share);
    const taxable = Math.max(roundMoney(line.gross - share), 0);
    const lineTax = roundMoney(taxable * gstFractionFromPercent(line.gstPercent));
    taxAmount = roundMoney(taxAmount + lineTax);
  });

  const taxableBase = roundMoney(subtotal - discount);
  const taxRate =
    taxableBase > 0 ? Math.round((taxAmount / taxableBase) * 10000) / 10000 : defaultGstFraction();

  return { taxAmount, taxRate };
}
