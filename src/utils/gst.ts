export const DEFAULT_GST_PERCENT = 18;

export function gstPercentOf(percent: number | null | undefined) {
  if (percent == null || !Number.isFinite(percent)) return DEFAULT_GST_PERCENT;
  return Math.min(100, Math.max(0, percent));
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

type TaxLine = { price: number; qty: number; gstPercent?: number | null; available?: boolean };

/**
 * GST charged at checkout. Mirrors the backend's taxForLines step for step,
 * rounding included (each line's discount share and tax are rounded), so the
 * figures here always equal what the order is charged.
 */
export function computeGstAmount(lines: TaxLine[], discountAmount = 0) {
  const billable = lines.filter((line) => line.available !== false && line.qty > 0);
  const detailed = billable.map((line) => ({
    gross: line.price * line.qty,
    gstPercent: gstPercentOf(line.gstPercent),
  }));
  const subtotal = roundMoney(detailed.reduce((sum, line) => sum + line.gross, 0));
  if (subtotal <= 0) return 0;

  const discount = Math.min(Math.max(discountAmount, 0), subtotal);
  let allocated = 0;
  let tax = 0;

  detailed.forEach((line, index) => {
    const isLast = index === detailed.length - 1;
    const share = isLast
      ? roundMoney(discount - allocated)
      : roundMoney((discount * line.gross) / subtotal);
    allocated = roundMoney(allocated + share);
    const taxable = Math.max(roundMoney(line.gross - share), 0);
    tax = roundMoney(tax + roundMoney(taxable * (line.gstPercent / 100)));
  });

  return tax;
}

/** An amount with its GST, rounded the way checkout rounds the tax. */
export function inclusiveLineTotal(gross: number, gstPercent?: number | null) {
  return roundMoney(gross + roundMoney(gross * (gstPercentOf(gstPercent) / 100)));
}

/** A product's price as buyers see it: GST included. */
export function priceWithGst(price: number, gstPercent?: number | null) {
  return inclusiveLineTotal(price, gstPercent);
}

/**
 * Cart/checkout totals presented with GST included. The rows add up exactly to
 * the total charged: items (incl. GST) − discount + shipping = total, and
 * `gstIncluded` is the GST contained in it.
 */
export function totalsInclGst(lines: TaxLine[], discountAmount: number, shippingAmount: number) {
  const billable = lines.filter((line) => line.available !== false && line.qty > 0);
  const subtotal = roundMoney(billable.reduce((sum, line) => sum + line.price * line.qty, 0));
  const discount = Math.min(Math.max(discountAmount, 0), subtotal);
  const gstIncluded = computeGstAmount(billable, discount);
  // Subtotal plus undiscounted GST, computed exactly as checkout computes tax,
  // so items − discount + shipping always equals the amount charged.
  const itemsInclGst = roundMoney(subtotal + computeGstAmount(billable, 0));
  const goodsAfterDiscount = roundMoney(subtotal - discount + gstIncluded);
  return {
    itemsInclGst,
    discountInclGst: discount > 0 ? roundMoney(itemsInclGst - goodsAfterDiscount) : 0,
    gstIncluded,
    total: roundMoney(goodsAfterDiscount + shippingAmount),
  };
}

/** "₹1,299" for whole rupees, "₹411.82" otherwise (never "₹411.8"). */
export function formatInr(amount: number) {
  const whole = Math.abs(amount - Math.round(amount)) < 0.005;
  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

export function gstSummaryLabel(lines: { gstPercent?: number | null; available?: boolean }[]) {
  const percents = new Set(
    lines.filter((line) => line.available !== false).map((line) => gstPercentOf(line.gstPercent))
  );
  if (percents.size === 1) {
    const [only] = [...percents];
    return `GST (${only}%)`;
  }
  return "GST";
}

/**
 * A placed order's totals presented with GST included, from the amounts it was
 * charged. Rows add up to totalAmount; lines without a stored rate use 18%.
 */
export function orderTotalsInclGst(order: {
  subtotal: number;
  discountAmount?: number;
  taxAmount: number;
  totalAmount: number;
  items: Array<{ lineTotal: number; gstPercent?: number | null }>;
}) {
  const discount = Math.max(order.discountAmount ?? 0, 0);
  const undiscountedGst = computeGstAmount(
    order.items.map((item) => ({ price: item.lineTotal, qty: 1, gstPercent: item.gstPercent })),
    0
  );
  const itemsInclGst = roundMoney(order.subtotal + undiscountedGst);
  const goodsAfterDiscount = roundMoney(order.subtotal - discount + order.taxAmount);
  return {
    itemsInclGst,
    discountInclGst: discount > 0 ? roundMoney(itemsInclGst - goodsAfterDiscount) : 0,
    gstIncluded: order.taxAmount,
    total: order.totalAmount,
  };
}
