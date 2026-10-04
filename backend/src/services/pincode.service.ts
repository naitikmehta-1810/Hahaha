import { pool } from "../config/db.js";
import { AppError } from "../utils/errors.js";

/** State names exactly as addresses and sellers.selling_state store them. */
const INDIA_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar",
  "Chandigarh", "Chhattisgarh", "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand", "Karnataka",
  "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya",
  "Mizoram", "Nagaland", "Odisha", "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

const squash = (value: string) =>
  value.toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");

const CANONICAL = new Map(INDIA_STATES.map((name) => [squash(name), name]));
// Older or alternate spellings India Post still returns for some offices.
const ALIASES: Record<string, string> = {
  orissa: "Odisha",
  pondicherry: "Puducherry",
  chattisgarh: "Chhattisgarh",
  newdelhi: "Delhi",
  nctofdelhi: "Delhi",
  dadraandnagarhaveli: "Dadra and Nagar Haveli and Daman and Diu",
  damananddiu: "Dadra and Nagar Haveli and Daman and Diu",
  andamanandnicobar: "Andaman and Nicobar Islands",
  jammuandkashmirut: "Jammu and Kashmir",
};

export function canonicalState(raw: string | null | undefined): string | null {
  const key = squash(String(raw ?? ""));
  if (!key) return null;
  return CANONICAL.get(key) ?? ALIASES[key] ?? null;
}

export function sameState(a: string | null | undefined, b: string | null | undefined) {
  const left = canonicalState(a) ?? String(a ?? "").trim().toLowerCase();
  const right = canonicalState(b) ?? String(b ?? "").trim().toLowerCase();
  return Boolean(left) && left === right;
}

export function normalizePincode(raw: unknown): string {
  const pincode = String(raw ?? "").replace(/\s/g, "");
  if (!/^[1-9]\d{5}$/.test(pincode)) {
    throw new AppError(400, "PINCODE_INVALID", "Enter a valid 6-digit PIN code.");
  }
  return pincode;
}

export type PincodeInfo = { pincode: string; state: string; district: string | null };

const memo = new Map<string, PincodeInfo>();
const MEMO_MAX = 5000;

function remember(info: PincodeInfo) {
  if (memo.size >= MEMO_MAX) {
    const oldest = memo.keys().next().value;
    if (oldest) memo.delete(oldest);
  }
  memo.set(info.pincode, info);
}

/**
 * Fallback when India Post is unreachable: 3-digit PIN prefixes that belong to
 * one state only. Prefixes shared by two states are left out on purpose, so a
 * miss means "unknown", never a wrong answer. Never written to the cache.
 */
const PREFIX_RANGES: Array<[number, number, string]> = [
  [110, 110, "Delhi"],
  [121, 136, "Haryana"],
  [140, 153, "Punjab"],
  [160, 160, "Chandigarh"],
  [161, 165, "Punjab"],
  [171, 177, "Himachal Pradesh"],
  [180, 193, "Jammu and Kashmir"],
  [194, 194, "Ladakh"],
  // 244 and 247 straddle Uttar Pradesh and Uttarakhand, so they are omitted.
  [201, 243, "Uttar Pradesh"],
  [245, 245, "Uttar Pradesh"],
  [246, 246, "Uttarakhand"],
  [248, 249, "Uttarakhand"],
  [250, 262, "Uttar Pradesh"],
  [263, 263, "Uttarakhand"],
  [270, 285, "Uttar Pradesh"],
  [301, 345, "Rajasthan"],
  [360, 395, "Gujarat"],
  [400, 402, "Maharashtra"],
  [403, 403, "Goa"],
  [404, 445, "Maharashtra"],
  [450, 488, "Madhya Pradesh"],
  [490, 497, "Chhattisgarh"],
  [500, 509, "Telangana"],
  [515, 535, "Andhra Pradesh"],
  [560, 591, "Karnataka"],
  [600, 604, "Tamil Nadu"],
  [610, 643, "Tamil Nadu"],
  [670, 681, "Kerala"],
  [683, 695, "Kerala"],
  [700, 736, "West Bengal"],
  [737, 737, "Sikkim"],
  [738, 743, "West Bengal"],
  [744, 744, "Andaman and Nicobar Islands"],
  [751, 770, "Odisha"],
  [781, 788, "Assam"],
  [790, 792, "Arunachal Pradesh"],
  [793, 794, "Meghalaya"],
  [795, 795, "Manipur"],
  [796, 796, "Mizoram"],
  [797, 798, "Nagaland"],
  [799, 799, "Tripura"],
  [800, 813, "Bihar"],
  [825, 835, "Jharkhand"],
  [841, 855, "Bihar"],
];

function stateFromPrefix(pincode: string): string | null {
  const prefix = Number(pincode.slice(0, 3));
  for (const [from, to, state] of PREFIX_RANGES) {
    if (prefix >= from && prefix <= to) return state;
  }
  return null;
}

async function lookupIndiaPost(pincode: string): Promise<PincodeInfo | "not_found" | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json().catch(() => null)) as Array<{
      Status?: string;
      PostOffice?: Array<{ State?: string; District?: string }> | null;
    }> | null;
    const entry = body?.[0];
    if (!entry) return null;
    if (entry.Status !== "Success" || !entry.PostOffice?.length) return "not_found";
    for (const office of entry.PostOffice) {
      const state = canonicalState(office.State);
      if (state) return { pincode, state, district: office.District?.trim() || null };
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * State for a PIN code: memory, then the pincodes table, then India Post (the
 * answer is stored). Null means the state could not be determined right now.
 * Throws PINCODE_NOT_FOUND when India Post says the PIN does not exist.
 */
export async function resolvePincode(raw: unknown): Promise<PincodeInfo | null> {
  const pincode = normalizePincode(raw);
  const hit = memo.get(pincode);
  if (hit) return hit;

  const cached = await pool.query<{ state: string; district: string | null }>(
    `select state, district from public.pincodes where pincode = $1`,
    [pincode]
  );
  if (cached.rows[0]) {
    const info = { pincode, ...cached.rows[0] };
    remember(info);
    return info;
  }

  const looked = await lookupIndiaPost(pincode);
  if (looked === "not_found") {
    throw new AppError(404, "PINCODE_NOT_FOUND", "We couldn't find that PIN code.");
  }
  if (!looked) {
    const state = stateFromPrefix(pincode);
    return state ? { pincode, state, district: null } : null;
  }
  await pool.query(
    `insert into public.pincodes (pincode, state, district)
     values ($1, $2, $3)
     on conflict (pincode) do nothing`,
    [looked.pincode, looked.state, looked.district]
  );
  remember(looked);
  return looked;
}
