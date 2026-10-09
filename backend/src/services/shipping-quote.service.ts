import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/errors.js";
import { cached } from "./catalog-cache.js";
import { goodsValueInclGst } from "./gst.js";
import { buildParcel } from "./parcel.js";
import { getServiceableCouriers, type ServiceableCourier } from "./shiprocket.client.js";

/**
 * Delivery charges and dates from live Shiprocket courier rates.
 *
 * Each seller ships its own parcel from its own pickup PIN code, so a cart is
 * quoted per seller and the parcels are added up. The courier picked here is
 * stored on the order and booked later (see bookShiprocketAwb), so what the
 * buyer paid for is what gets booked.
 */

/** Shiprocket answers in ~1s; a checkout should never wait much longer than this. */
const QUOTE_TIMEOUT_MS = 8_000;
const UNSERVICEABLE_CACHE_SECONDS = 30 * 60;
const CACHE_PREFIX = "stuffsy:shipquote:v1:";
/** Transit days assumed for fallback rates (the old "5–7 / 2–3 days" copy). */
const FALLBACK_TRANSIT_DAYS = { standard: 5, express: 3 } as const;

export type QuoteLine = {
  variantId: string;
  sellerId: string;
  shopName: string | null;
  pickupPincode: string | null;
  quantity: number;
  unitPrice: number;
  gstPercent: string | number | null;
  isDigital: boolean;
  weight: string | null;
  lengthCm: string | null;
  widthCm: string | null;
  heightCm: string | null;
  useVolumetric: boolean | null;
  processingDays: number | null;
  processingDaysMax: number | null;
};

export type CourierChoice = {
  courierCompanyId: number | null;
  courierName: string | null;
  /** What the courier charges the marketplace for this parcel. */
  cost: number;
  /** Cost plus markup and handling: what the buyer pays when delivery isn't free. */
  charge: number;
  transitDays: number;
  source: "shiprocket" | "fallback";
};

export type SellerShippingQuote = {
  sellerId: string;
  shopName: string | null;
  weightKg: number;
  processingDaysMin: number;
  processingDaysMax: number;
  standard: CourierChoice;
  express: CourierChoice | null;
};

export type DeliveryOptionQuote = {
  /** Charged to the buyer. */
  amount: number;
  /** Paid to couriers; differs from amount when delivery is free or marked up. */
  cost: number;
  /** What free delivery saved the buyer (0 when not free). */
  savedAmount: number;
  minDays: number;
  maxDays: number;
  etaFrom: string;
  etaTo: string;
};

export type ShippingQuote = {
  deliveryPincode: string;
  cod: boolean;
  hasPhysical: boolean;
  freeShippingThreshold: number;
  /** Standard delivery is free because the goods value reached the threshold. */
  freeShippingApplied: boolean;
  /** At least one parcel was priced from fallback rates, not a live rate. */
  estimated: boolean;
  /** Null when nothing ships (all-digital cart). */
  standard: DeliveryOptionQuote | null;
  /** Null when nothing ships or no courier is faster than standard. */
  express: DeliveryOptionQuote | null;
  sellers: SellerShippingQuote[];
};

type CourierRate = { id: number; name: string; rate: number; days: number };

type CachedRates =
  | { serviceable: true; recommendedId: number | null; couriers: CourierRate[] }
  | { serviceable: false };

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function addDays(from: Date, days: number) {
  const next = new Date(from);
  next.setDate(next.getDate() + days);
  return next;
}

/** Courier cost to buyer charge: markup and handling, rounded up to a whole rupee. */
export function chargeFor(cost: number) {
  const marked = cost * (1 + env.SHIPPING_RATE_MARKUP_PERCENT / 100) + env.SHIPPING_HANDLING_FEE;
  return Math.ceil(marked);
}

function transitDays(courier: ServiceableCourier): number | null {
  const days = Number.parseInt(String(courier.estimated_delivery_days ?? ""), 10);
  if (Number.isFinite(days) && days > 0) return days;
  if (courier.etd) {
    const at = Date.parse(courier.etd);
    if (Number.isFinite(at)) {
      const diff = Math.ceil((at - Date.now()) / 86_400_000);
      if (diff > 0) return diff;
    }
  }
  return null;
}

function normalizeCouriers(list: ServiceableCourier[]): CourierRate[] {
  const out: CourierRate[] = [];
  for (const courier of list) {
    const rate = Number(courier.rate);
    if (Number(courier.blocked) === 1 || !Number.isFinite(rate) || rate <= 0) continue;
    if (!courier.courier_company_id) continue;
    out.push({
      id: Number(courier.courier_company_id),
      name: String(courier.courier_name ?? "Courier"),
      rate: roundMoney(rate),
      days: transitDays(courier) ?? FALLBACK_TRANSIT_DAYS.standard,
    });
  }
  return out;
}

/** Shiprocket's way of saying no courier covers this route. */
function isUnserviceableError(error: unknown) {
  return (
    error instanceof AppError &&
    error.code === "SHIPROCKET_API_ERROR" &&
    /not serviceable|non[- ]?serviceable|no courier|not available/i.test(error.message)
  );
}

async function liveRates(opts: {
  pickupPincode: string;
  deliveryPincode: string;
  weight: number;
  length: number;
  breadth: number;
  height: number;
  declaredValue: number;
  cod: boolean;
}): Promise<CachedRates> {
  // Rates barely move with declared value (only insurance), so bucket it to share cache entries.
  const declaredBucket = Math.max(500, Math.ceil(opts.declaredValue / 500) * 500);
  const key =
    CACHE_PREFIX +
    createHash("sha1")
      .update(
        [
          opts.pickupPincode,
          opts.deliveryPincode,
          opts.weight.toFixed(3),
          opts.length,
          opts.breadth,
          Math.ceil(opts.height),
          declaredBucket,
          opts.cod ? 1 : 0,
        ].join("|")
      )
      .digest("hex");

  // Coalesced: a burst of checkouts for the same route makes one Shiprocket call.
  return cached<CachedRates>(key, env.SHIPPING_QUOTE_CACHE_SECONDS, () => fetchRates(opts, declaredBucket), {
    versioned: false,
    ttlFor: (rates) => (rates.serviceable ? env.SHIPPING_QUOTE_CACHE_SECONDS : UNSERVICEABLE_CACHE_SECONDS),
  });
}

async function fetchRates(
  opts: {
    pickupPincode: string;
    deliveryPincode: string;
    weight: number;
    length: number;
    breadth: number;
    height: number;
    cod: boolean;
  },
  declaredBucket: number
): Promise<CachedRates> {
  let result: CachedRates;
  try {
    const response = await getServiceableCouriers({
      pickupPostcode: opts.pickupPincode,
      deliveryPostcode: opts.deliveryPincode,
      weight: opts.weight,
      cod: opts.cod,
      length: opts.length,
      breadth: opts.breadth,
      height: opts.height,
      declaredValue: declaredBucket,
      timeoutMs: QUOTE_TIMEOUT_MS,
    });
    const couriers = normalizeCouriers(response.data?.available_courier_companies ?? []);
    result =
      couriers.length > 0
        ? {
            serviceable: true,
            recommendedId: response.data?.recommended_courier_company_id ?? null,
            couriers,
          }
        : { serviceable: false };
  } catch (error) {
    if (!isUnserviceableError(error)) throw error;
    result = { serviceable: false };
  }
  return result;
}

/**
 * Standard is the courier Shiprocket recommends for the route (the same one a
 * booking without a stored choice would get), else the cheapest. Express is the
 * fastest courier that beats standard, cheapest among equals.
 */
function pickCouriers(rates: Extract<CachedRates, { serviceable: true }>) {
  const byPrice = [...rates.couriers].sort((a, b) => a.rate - b.rate || a.days - b.days);
  const standard =
    (rates.recommendedId != null && rates.couriers.find((c) => c.id === rates.recommendedId)) ||
    byPrice[0];
  const express =
    [...rates.couriers]
      .filter((c) => c.days < standard.days)
      .sort((a, b) => a.days - b.days || a.rate - b.rate)[0] ?? null;
  return { standard, express };
}

function liveChoice(courier: CourierRate): CourierChoice {
  return {
    courierCompanyId: courier.id,
    courierName: courier.name,
    cost: courier.rate,
    charge: chargeFor(courier.rate),
    transitDays: courier.days,
    source: "shiprocket",
  };
}

/** Deliberately on the high side of courier rates, so an outage never sells at a loss. */
function fallbackChoices(weight: number) {
  const standardRate = Math.max(1, Math.ceil(weight / 0.5)) * env.STANDARD_SHIPPING_AMOUNT;
  const expressRate = Math.max(env.EXPRESS_SHIPPING_AMOUNT, standardRate * 2);
  const choice = (rate: number, days: number): CourierChoice => ({
    courierCompanyId: null,
    courierName: null,
    cost: rate,
    charge: Math.ceil(rate),
    transitDays: days,
    source: "fallback",
  });
  return {
    standard: choice(standardRate, FALLBACK_TRANSIT_DAYS.standard),
    express: choice(expressRate, FALLBACK_TRANSIT_DAYS.express),
  };
}

async function quoteSeller(
  lines: QuoteLine[],
  deliveryPincode: string,
  cod: boolean
): Promise<SellerShippingQuote> {
  const first = lines[0];
  const parcel = buildParcel(
    lines.map((line) => ({
      quantity: line.quantity,
      unit_price: line.unitPrice,
      weight: line.weight,
      length_cm: line.lengthCm,
      width_cm: line.widthCm,
      height_cm: line.heightCm,
      use_volumetric: line.useVolumetric,
    }))
  );
  const processingDaysMin = Math.max(...lines.map((line) => Number(line.processingDays ?? 2)));
  const processingDaysMax = Math.max(
    processingDaysMin,
    ...lines.map((line) =>
      line.processingDaysMax != null
        ? Math.max(Number(line.processingDaysMax), Number(line.processingDays ?? 2))
        : Number(line.processingDays ?? 2) + 1
    )
  );
  const base = {
    sellerId: first.sellerId,
    shopName: first.shopName,
    weightKg: parcel.weight,
    processingDaysMin,
    processingDaysMax,
  };

  const pickupPincode = String(first.pickupPincode ?? "").trim();
  const canQuoteLive = env.SHIPPING_MODE === "shiprocket" && /^\d{6}$/.test(pickupPincode);
  if (env.SHIPPING_MODE === "shiprocket" && !canQuoteLive) {
    console.warn("[shipping-quote] seller has no pickup PIN code; using fallback rate", {
      sellerId: first.sellerId,
    });
  }

  if (canQuoteLive) {
    try {
      const rates = await liveRates({
        pickupPincode,
        deliveryPincode,
        weight: parcel.weight,
        length: parcel.length,
        breadth: parcel.breadth,
        height: Math.min(100, parcel.height),
        declaredValue: parcel.subTotal,
        cod,
      });
      if (!rates.serviceable) {
        const shop = first.shopName ? `${first.shopName} doesn't` : "This seller doesn't";
        throw new AppError(
          400,
          "PINCODE_NOT_SERVICEABLE",
          `${shop} have a courier that delivers to PIN code ${deliveryPincode}${cod ? " with Cash on Delivery" : ""}. Try another address${cod ? " or pay online" : ""}.`,
          { sellerId: first.sellerId, deliveryPincode, cod }
        );
      }
      const picked = pickCouriers(rates);
      return {
        ...base,
        standard: liveChoice(picked.standard),
        express: picked.express ? liveChoice(picked.express) : null,
      };
    } catch (error) {
      if (error instanceof AppError && error.code === "PINCODE_NOT_SERVICEABLE") throw error;
      console.warn("[shipping-quote] live rate failed; using fallback rate", {
        sellerId: first.sellerId,
        deliveryPincode,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { ...base, ...fallbackChoices(parcel.weight) };
}

function summarize(
  sellers: SellerShippingQuote[],
  pick: (seller: SellerShippingQuote) => CourierChoice,
  now: Date
) {
  const cost = roundMoney(sellers.reduce((sum, seller) => sum + pick(seller).cost, 0));
  const charge = sellers.reduce((sum, seller) => sum + pick(seller).charge, 0);
  // Parcels travel in parallel, so the order arrives when the slowest one does.
  const minDays = Math.max(...sellers.map((s) => s.processingDaysMin + pick(s).transitDays));
  const maxDays = Math.max(...sellers.map((s) => s.processingDaysMax + pick(s).transitDays));
  return {
    cost,
    charge,
    minDays,
    maxDays,
    etaFrom: addDays(now, minDays).toISOString(),
    etaTo: addDays(now, maxDays).toISOString(),
  };
}

/**
 * Quote delivery for a set of lines to one PIN code. Throws
 * PINCODE_NOT_SERVICEABLE when Shiprocket has no courier for a seller's route;
 * any other Shiprocket failure falls back to conservative flat rates.
 */
export async function quoteShipping(input: {
  lines: QuoteLine[];
  deliveryPincode: string;
  cod: boolean;
}): Promise<ShippingQuote> {
  const { lines, deliveryPincode, cod } = input;
  const physical = lines.filter((line) => !line.isDigital);
  const goodsInclGst = goodsValueInclGst(
    lines.map((line) => ({ gross: line.unitPrice * line.quantity, gstPercent: line.gstPercent }))
  );
  const freeShippingApplied = goodsInclGst >= env.FREE_SHIPPING_THRESHOLD;
  const empty: ShippingQuote = {
    deliveryPincode,
    cod,
    hasPhysical: false,
    freeShippingThreshold: env.FREE_SHIPPING_THRESHOLD,
    freeShippingApplied: false,
    estimated: false,
    standard: null,
    express: null,
    sellers: [],
  };
  if (physical.length === 0) return empty;

  const bySeller = new Map<string, QuoteLine[]>();
  for (const line of physical) {
    const group = bySeller.get(line.sellerId) ?? [];
    group.push(line);
    bySeller.set(line.sellerId, group);
  }
  const sellers = await Promise.all(
    [...bySeller.values()].map((group) => quoteSeller(group, deliveryPincode, cod))
  );

  const now = new Date();
  const standard = summarize(sellers, (s) => s.standard, now);
  const hasExpress = sellers.some((s) => s.express);
  const express = hasExpress ? summarize(sellers, (s) => s.express ?? s.standard, now) : null;

  return {
    deliveryPincode,
    cod,
    hasPhysical: true,
    freeShippingThreshold: env.FREE_SHIPPING_THRESHOLD,
    freeShippingApplied,
    estimated: sellers.some(
      (s) => s.standard.source === "fallback" || s.express?.source === "fallback"
    ),
    standard: {
      amount: freeShippingApplied ? 0 : standard.charge,
      cost: standard.cost,
      savedAmount: freeShippingApplied ? standard.charge : 0,
      minDays: standard.minDays,
      maxDays: standard.maxDays,
      etaFrom: standard.etaFrom,
      etaTo: standard.etaTo,
    },
    // Express is only offered when it actually gets the whole order there sooner.
    express:
      express && express.maxDays < standard.maxDays
        ? {
            amount: express.charge,
            cost: express.cost,
            savedAmount: 0,
            minDays: express.minDays,
            maxDays: express.maxDays,
            etaFrom: express.etaFrom,
            etaTo: express.etaTo,
          }
        : null,
    sellers,
  };
}

const QUOTE_LINE_COLUMNS = `
  pv.id as variant_id,
  p.seller_id,
  s.shop_name,
  nullif(trim(s.pickup_address->>'pincode'), '') as pickup_pincode,
  pv.price::text as price,
  coalesce(subc.gst_rate, cat.gst_rate)::text as gst_rate,
  p.product_type = 'digital' as is_digital,
  p.weight::text as weight,
  p.length_cm::text as length_cm,
  p.width_cm::text as width_cm,
  p.height_cm::text as height_cm,
  p.use_volumetric,
  p.processing_days,
  p.processing_days_max`;

type QuoteLineRow = {
  variant_id: string;
  seller_id: string;
  shop_name: string | null;
  pickup_pincode: string | null;
  price: string;
  gst_rate: string | null;
  is_digital: boolean;
  weight: string | null;
  length_cm: string | null;
  width_cm: string | null;
  height_cm: string | null;
  use_volumetric: boolean | null;
  processing_days: number | null;
  processing_days_max: number | null;
  quantity: number;
};

function toQuoteLine(row: QuoteLineRow): QuoteLine {
  return {
    variantId: row.variant_id,
    sellerId: row.seller_id,
    shopName: row.shop_name,
    pickupPincode: row.pickup_pincode,
    quantity: Number(row.quantity),
    unitPrice: Number(row.price),
    gstPercent: row.gst_rate,
    isDigital: row.is_digital,
    weight: row.weight,
    lengthCm: row.length_cm,
    widthCm: row.width_cm,
    heightCm: row.height_cm,
    useVolumetric: row.use_volumetric,
    processingDays: row.processing_days,
    processingDaysMax: row.processing_days_max,
  };
}

/**
 * Every live line in a cart, as checkout will see it. Unsellable lines are kept
 * out so the quote matches what the buyer can actually order; placeOrder rejects
 * a cart that still holds them.
 */
export async function loadCartQuoteLines(cartId: string, client?: PoolClient) {
  const result = await (client ?? pool).query<QuoteLineRow>(
    `select ${QUOTE_LINE_COLUMNS}, ci.quantity
     from public.cart_items ci
     join public.product_variants pv on pv.id = ci.variant_id
     join public.products p on p.id = pv.product_id
     join public.sellers s on s.id = p.seller_id
     left join public.categories subc on subc.id = p.subcategory_id
     left join public.categories cat on cat.id = p.category_id
     where ci.cart_id = $1
       and ci.deleted_at is null
       and pv.is_active and pv.deleted_at is null
       and p.status = 'active' and p.deleted_at is null
       and s.status = 'active' and not s.is_vacation_mode
     order by ci.created_at asc`,
    [cartId]
  );
  return result.rows.map(toQuoteLine);
}

/** Identifies what was quoted, so checkout can tell the cart changed since. */
export function quoteFingerprint(lines: Array<{ variantId: string; quantity: number }>) {
  return lines
    .map((line) => `${line.variantId}:${line.quantity}`)
    .sort()
    .join(",");
}

/** One unit of a product to a PIN code, for the product page. Never throws. */
export async function quoteProductDelivery(productSlug: string, deliveryPincode: string) {
  const result = await pool.query<QuoteLineRow>(
    `select ${QUOTE_LINE_COLUMNS}, 1 as quantity
     from public.products p
     join public.sellers s on s.id = p.seller_id
     join lateral (
       select v.id, v.price from public.product_variants v
       where v.product_id = p.id and v.deleted_at is null
       order by v.is_active desc, v.created_at asc
       limit 1
     ) pv on true
     left join public.categories subc on subc.id = p.subcategory_id
     left join public.categories cat on cat.id = p.category_id
     where (p.slug = $1 or p.id::text = $1) and p.deleted_at is null
     limit 1`,
    [productSlug]
  );
  const row = result.rows[0];
  if (!row || row.is_digital) return null;
  try {
    const quote = await quoteShipping({
      lines: [toQuoteLine(row)],
      deliveryPincode,
      cod: false,
    });
    const standard = quote.standard;
    if (!standard) return null;
    return {
      serviceable: true as const,
      minDays: standard.minDays,
      maxDays: standard.maxDays,
      etaFrom: standard.etaFrom,
      etaTo: standard.etaTo,
    };
  } catch (error) {
    if (error instanceof AppError && error.code === "PINCODE_NOT_SERVICEABLE") {
      return { serviceable: false as const };
    }
    console.warn("[shipping-quote] product delivery estimate failed", error);
    return null;
  }
}
