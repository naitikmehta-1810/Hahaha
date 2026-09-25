export const DEFAULT_GST_PERCENT = 18;

export function gstPercentOf(percent: number | null | undefined) {
  if (percent == null || !Number.isFinite(percent)) return DEFAULT_GST_PERCENT;
  return Math.min(100, Math.max(0, percent));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** Same split as checkout: each line keeps its category rate after a share of the discount. */
export function computeGstAmount(
  lines: { price: number; qty: number; gstPercent?: number | null; available?: boolean }[],
  discountAmount = 0
) {
  const billable = lines.filter((line) => line.available !== false && line.qty > 0);
  const detailed = billable.map((line) => ({
    gross: line.price * line.qty,
    gstPercent: gstPercentOf(line.gstPercent),
  }));
  const subtotal = detailed.reduce((sum, line) => sum + line.gross, 0);
  if (subtotal <= 0) return 0;

  const discount = Math.min(Math.max(discountAmount, 0), subtotal);
  let allocated = 0;
  let tax = 0;

  detailed.forEach((line, index) => {
    const isLast = index === detailed.length - 1;
    const share = isLast ? discount - allocated : (discount * line.gross) / subtotal;
    allocated += share;
    const taxable = Math.max(line.gross - share, 0);
    tax += taxable * (line.gstPercent / 100);
  });

  return roundMoney(tax);
}

export function gstSummaryLabel(
  lines: { gstPercent?: number | null; available?: boolean }[]
) {
  const percents = new Set(
    lines.filter((line) => line.available !== false).map((line) => gstPercentOf(line.gstPercent))
  );
  if (percents.size === 1) {
    const [only] = [...percents];
    return `GST (${only}%)`;
  }
  return "GST";
}
