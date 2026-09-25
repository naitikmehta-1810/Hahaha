import { AppError } from "../utils/errors.js";

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** GST state code → name used on addresses and selling_state. */
const GST_STATE_BY_CODE: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** Official GSTIN check digit over the first 14 characters. */
export function gstinCheckDigit(first14: string): string {
  const mod = 36;
  let factor = 2;
  let sum = 0;
  for (let i = first14.length - 1; i >= 0; i -= 1) {
    const codePoint = CHARSET.indexOf(first14[i] ?? "");
    if (codePoint < 0) return "";
    let addend = factor * codePoint;
    factor = factor === 2 ? 1 : 2;
    addend = Math.floor(addend / mod) + (addend % mod);
    sum += addend;
  }
  return CHARSET[(mod - (sum % mod)) % mod] ?? "";
}

export function assertGstinFormat(raw: string): string {
  const gstin = raw.trim().toUpperCase();
  if (!GSTIN_RE.test(gstin)) {
    throw new AppError(
      400,
      "INVALID_GSTIN",
      "GSTIN must be 15 characters (state code, PAN, entity, Z, and checksum)."
    );
  }
  if (gstinCheckDigit(gstin.slice(0, 14)) !== gstin[14]) {
    throw new AppError(400, "INVALID_GSTIN", "GSTIN checksum does not match.");
  }
  if (!GST_STATE_BY_CODE[gstin.slice(0, 2)]) {
    throw new AppError(400, "INVALID_GSTIN", "GSTIN state code is not recognized.");
  }
  return gstin;
}

export const INDIA_STATE_NAMES = new Set(Object.values(GST_STATE_BY_CODE));

export type VerifiedGstin = {
  gstin: string;
  legalName: string;
  status: string;
  state: string;
  city: string | null;
};

type GstRecord = {
  gstin?: string;
  lgnm?: string;
  tradeNam?: string;
  sts?: string;
  pradr?: { addr?: { stcd?: string; dst?: string; loc?: string; city?: string } };
};

function pickRecord(payload: unknown): GstRecord | null {
  if (!payload || typeof payload !== "object") return null;
  const body = payload as Record<string, unknown>;
  const data = body.data ?? body.result ?? body.taxpayerInfo;
  if (Array.isArray(data) && data[0] && typeof data[0] === "object") {
    return data[0] as GstRecord;
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as GstRecord;
  }
  if (typeof body.lgnm === "string" || typeof body.tradeNam === "string") {
    return body as GstRecord;
  }
  return null;
}

async function lookupGstin(gstin: string): Promise<GstRecord | null> {
  const url =
    process.env.GSTIN_LOOKUP_URL?.trim() ||
    `https://blog-backend.mastersindia.co/api/v1/custom/search/gstin/?keyword_search_query=${encodeURIComponent(gstin)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    const json = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      throw new AppError(
        502,
        "GST_LOOKUP_FAILED",
        "GST verification service did not respond. Try again in a minute."
      );
    }
    return pickRecord(json);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      502,
      "GST_LOOKUP_FAILED",
      "Could not reach the GST verification service. Try again in a minute."
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Checksum plus a live GSTIN lookup. Active registrations only. */
export async function verifyGstin(raw: string): Promise<VerifiedGstin> {
  const gstin = assertGstinFormat(raw);
  const record = await lookupGstin(gstin);
  const status = String(record?.sts ?? "").trim();
  const legalName = String(record?.lgnm ?? record?.tradeNam ?? "").trim();
  const returnedGstin = String(record?.gstin ?? gstin).trim().toUpperCase();

  if (!record || !legalName || returnedGstin !== gstin) {
    throw new AppError(
      400,
      "GSTIN_NOT_FOUND",
      "This GSTIN could not be verified against GST records."
    );
  }
  if (status && !/active/i.test(status)) {
    throw new AppError(
      400,
      "GSTIN_INACTIVE",
      `This GSTIN is not active (${status}).`
    );
  }

  const addr = record.pradr?.addr;
  return {
    gstin,
    legalName,
    status: status || "Active",
    state: GST_STATE_BY_CODE[gstin.slice(0, 2)] ?? addr?.stcd ?? "",
    city: addr?.dst || addr?.loc || addr?.city || null,
  };
}
