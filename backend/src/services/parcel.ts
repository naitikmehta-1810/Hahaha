/** One order or cart line as far as the parcel is concerned. */
export type ParcelLine = {
  quantity: number;
  unit_price: string | number;
  weight: string | null;
  length_cm: string | null;
  width_cm: string | null;
  height_cm: string | null;
  use_volumetric: boolean | null;
};

/**
 * Parcel sent to Shiprocket for one seller's items. Couriers bill
 * max(dead weight, L×B×H ÷ 5000), so box dimensions only count for products
 * whose seller opted in to volumetric billing; everything else ships in the
 * small default box (10×10×5 cm) and is billed on dead weight.
 */
export function buildParcel(rows: ParcelLine[]) {
  let weight = 0;
  let length = 10;
  let breadth = 10;
  let height = 5;
  let subTotal = 0;
  for (const row of rows) {
    let w = Number(row.weight ?? 0.5);
    if (!Number.isFinite(w) || w <= 0) w = 0.5;
    const rowL = Number(row.length_cm ?? 10) || 10;
    const rowB = Number(row.width_cm ?? 10) || 10;
    const rowH = Number(row.height_cm ?? 5) || 5;
    // Couriers bill max(dead weight, L×B×H ÷ 5000). Product dimensions only enter
    // the parcel when the seller opted in to volumetric billing; otherwise the
    // parcel keeps the small default box and is billed on dead weight alone.
    if (row.use_volumetric) {
      length = Math.max(length, rowL);
      breadth = Math.max(breadth, rowB);
      height += rowH * Number(row.quantity);
    }
    // Sellers sometimes type grams into the kg field (e.g. 50 instead of 0.05).
    // If dead weight dwarfs volumetric weight for a small box, treat as grams.
    const volKg = (rowL * rowB * rowH) / 5000;
    if (w >= 10 && volKg > 0 && w > volKg * 4) {
      const asKg = w / 1000;
      if (asKg >= 0.05 && asKg <= 20) {
        console.warn("[shiprocket] normalizing weight (likely grams entered as kg)", {
          raw: w,
          normalized: asKg,
        });
        w = asKg;
      }
    }
    weight += w * Number(row.quantity);
    subTotal += Number(row.unit_price) * Number(row.quantity);
  }
  weight = Math.min(30, Math.max(0.5, Math.round(weight * 1000) / 1000));
  return { weight, length, breadth, height, subTotal };
}
