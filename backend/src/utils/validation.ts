import { promises as dns } from "node:dns";
import { z } from "zod";

/**
 * Input rules shared by every route that accepts identity or contact data, so
 * signup, profile edits, addresses, admin tools and seller onboarding can never
 * disagree about what a valid email, phone, name or password is.
 */

/* ── Email ──────────────────────────────────────────────────────────────── */

/**
 * Practical RFC 5321 subset that real mailbox providers accept: dot-atom local
 * part (no leading, trailing or doubled dots), hostname labels of letters,
 * digits and inner hyphens, and an alphabetic TLD. Quoted local parts and IP
 * literals are valid on paper but are only ever used by abuse scripts.
 */
const EMAIL_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** RFC 2606 / 6761 names that can never receive mail. */
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost|local)$/;

/**
 * Throwaway inbox providers. Not exhaustive (new ones appear daily), but these
 * cover the bulk of disposable signups seen on Indian marketplaces.
 */
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "33mail.com",
  "anonaddy.me",
  "burnermail.io",
  "byom.de",
  "dispostable.com",
  "dropmail.me",
  "emailondeck.com",
  "fakeinbox.com",
  "fakemail.net",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "harakirimail.com",
  "inboxbear.com",
  "inboxkitten.com",
  "incognitomail.org",
  "jetable.org",
  "linshiyouxiang.net",
  "mail-temp.com",
  "mail.tm",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailinator.net",
  "mailnesia.com",
  "mailpoof.com",
  "mailsac.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "nada.email",
  "sharklasers.com",
  "spam4.me",
  "spambox.us",
  "spamgourmet.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempinbox.com",
  "tempmail.com",
  "tempmail.dev",
  "tempmail.net",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "tmail.ws",
  "tmpmail.net",
  "tmpmail.org",
  "trashmail.com",
  "trashmail.de",
  "trashmail.net",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "emailfake.com",
  "fakemailgenerator.com",
  "grr.la",
  "guerrillamail.email",
  "mailforspam.com",
  "spamdecoy.net",
  "tempmailaddress.com",
  "discard.email",
  "mvrht.net",
  "cuvox.de",
  "armyspy.com",
  "dayrep.com",
  "einrot.com",
  "fleckens.hu",
  "gustr.com",
  "jourrapide.com",
  "rhyta.com",
  "superrito.com",
  "teleworm.us",
]);

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function emailDomain(email: string) {
  return email.slice(email.lastIndexOf("@") + 1);
}

/** Shape-only check; no network. Use `assertDeliverableEmail` before creating an account. */
export const emailSchema = z
  .string({ required_error: "Email is required" })
  .trim()
  .min(3, "Enter a valid email address")
  .max(254, "Email address is too long")
  .transform(normalizeEmail)
  .refine((email) => {
    const at = email.lastIndexOf("@");
    return at > 0 && at <= 64 && EMAIL_PATTERN.test(email);
  }, "Enter a valid email address")
  .refine((email) => !RESERVED_DOMAIN.test(emailDomain(email)), "Use a real email address");

/** Login and lookups: same normalization, no reputation rules (old accounts must still sign in). */
export const loginEmailSchema = z
  .string({ required_error: "Email is required" })
  .trim()
  .min(3, "Enter a valid email address")
  .max(254, "Enter a valid email address")
  .transform(normalizeEmail)
  .refine((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "Enter a valid email address");

export function isDisposableEmailDomain(domain: string) {
  const parts = domain.split(".");
  // Subdomains of a disposable provider (x.mailinator.com) are disposable too.
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

type DomainVerdict = { ok: boolean; at: number };
const domainCache = new Map<string, DomainVerdict>();
const DOMAIN_CACHE_MAX = 5000;
const DOMAIN_OK_TTL_MS = 24 * 60 * 60 * 1000;
const DOMAIN_BAD_TTL_MS = 60 * 60 * 1000;
const DNS_TIMEOUT_MS = 3000;

function rememberDomain(domain: string, ok: boolean) {
  if (domainCache.size >= DOMAIN_CACHE_MAX && !domainCache.has(domain)) {
    const oldest = domainCache.keys().next().value;
    if (oldest) domainCache.delete(oldest);
  }
  domainCache.set(domain, { ok, at: Date.now() });
}

function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("DNS timeout"), { code: "ETIMEOUT" })), DNS_TIMEOUT_MS);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

/** Codes that prove the name has no mail route, as opposed to a flaky resolver. */
const DEFINITIVE_DNS_MISS = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

/**
 * Can this domain receive mail at all? MX records, or (per RFC 5321 §5.1) an
 * address record when there is no MX. A "null MX" (RFC 7505) means never.
 * Resolver failures and timeouts fail open: a DNS hiccup must not block signup.
 */
export async function domainAcceptsMail(domain: string): Promise<boolean> {
  const cached = domainCache.get(domain);
  if (cached && Date.now() - cached.at < (cached.ok ? DOMAIN_OK_TTL_MS : DOMAIN_BAD_TTL_MS)) {
    return cached.ok;
  }

  let ok: boolean;
  try {
    const records = await withTimeout(dns.resolveMx(domain));
    const usable = records.filter((record) => record.exchange && record.exchange !== ".");
    ok = usable.length > 0;
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    if (!DEFINITIVE_DNS_MISS.has(code)) return true;
    try {
      const addresses = await withTimeout(dns.resolve4(domain));
      ok = addresses.length > 0;
    } catch (fallbackError) {
      const fallbackCode = (fallbackError as { code?: string }).code ?? "";
      if (!DEFINITIVE_DNS_MISS.has(fallbackCode)) return true;
      ok = false;
    }
  }

  rememberDomain(domain, ok);
  return ok;
}

/**
 * Reputation checks for a new account's email: no throwaway inboxes and a
 * domain that can actually receive mail. Returns the reason it was refused,
 * or null when the address is acceptable.
 */
export async function undeliverableEmailReason(email: string): Promise<string | null> {
  const domain = emailDomain(email);
  if (isDisposableEmailDomain(domain)) {
    return "Disposable email addresses aren't accepted. Use your personal or work email.";
  }
  if (!(await domainAcceptsMail(domain))) {
    return "That email domain can't receive mail. Check the address for typos.";
  }
  return null;
}

/* ── Phone (India) ──────────────────────────────────────────────────────── */

/**
 * Indian mobile numbers, stored as the bare 10 digits. Accepts what people
 * type: "+91 98765 43210", "091-98765-43210", "09876543210", "9876543210".
 * Returns null when it isn't a valid Indian mobile number.
 */
export function normalizeIndianMobile(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(digits)) return null;
  digits = digits.replace(/^\+/, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 13 && digits.startsWith("091")) digits = digits.slice(3);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (!/^[6-9]\d{9}$/.test(digits)) return null;
  // Reject obvious placeholders such as 9999999999.
  if (/^(\d)\1{9}$/.test(digits)) return null;
  return digits;
}

export const indianMobileSchema = z
  .string({ required_error: "Phone number is required" })
  .trim()
  .max(20, "Enter a valid 10-digit mobile number")
  .transform((value, ctx) => {
    const phone = normalizeIndianMobile(value);
    if (!phone) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit Indian mobile number" });
      return z.NEVER;
    }
    return phone;
  });

/** Indian PIN codes are six digits and never start with 0. */
export const pincodeSchema = z
  .string({ required_error: "PIN code is required" })
  .trim()
  .transform((value) => value.replace(/\s/g, ""))
  .refine((value) => /^[1-9]\d{5}$/.test(value), "Enter a valid 6-digit PIN code");

/* ── Names and free text ────────────────────────────────────────────────── */

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/;
const LOOKS_LIKE_LINK = /(https?:\/\/|www\.|\.(com|net|org|in|io|xyz|ru|top)\b)/i;

/** A person's name: letters in any script, spaces, and . ' - between them. */
export const personNameSchema = z
  .string({ required_error: "Full name is required" })
  .trim()
  .transform((value) => value.replace(/\s+/g, " "))
  .refine((value) => value.length >= 2, "Enter your full name")
  .refine((value) => value.length <= 80, "Name is too long")
  .refine((value) => !CONTROL_CHARS.test(value), "Name contains characters that aren't allowed")
  .refine((value) => !LOOKS_LIKE_LINK.test(value), "Name can't contain a link")
  .refine(
    (value) => /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(value),
    "Use letters only in your name"
  );

/** Single-line text with control and bidi-override characters removed. */
export function cleanLine(value: string) {
  return value.replace(new RegExp(CONTROL_CHARS.source, "g"), "").replace(/\s+/g, " ").trim();
}

/* ── Passwords ──────────────────────────────────────────────────────────── */

/** bcrypt only reads the first 72 bytes; anything longer would silently be ignored. */
const PASSWORD_MAX_BYTES = 72;

const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "password123",
  "passw0rd",
  "qwerty123",
  "qwertyuiop",
  "iloveyou1",
  "abcd1234",
  "abc12345",
  "admin123",
  "welcome1",
  "welcome123",
  "11111111",
  "00000000",
  "87654321",
  "india123",
  "india@123",
  "stuffsy123",
  "letmein1",
  "sunshine1",
  "princess1",
  "football1",
  "baseball1",
  "monkey123",
  "dragon123",
  "master123",
  "test1234",
  "pass@123",
  "admin@123",
]);

/** New passwords (signup, reset, change). Login uses `loginPasswordSchema`. */
export const newPasswordSchema = z
  .string({ required_error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .refine(
    (value) => Buffer.byteLength(value, "utf8") <= PASSWORD_MAX_BYTES,
    "Password must be at most 72 characters"
  )
  .refine((value) => /\p{L}/u.test(value) && /\d/.test(value), "Use at least one letter and one number")
  .refine((value) => !/^(.)\1+$/.test(value), "Password is too easy to guess")
  .refine((value) => !COMMON_PASSWORDS.has(value.toLowerCase()), "That password is too common. Choose another.");

/** Never reveals policy on login; just bounds the input so hashing stays cheap. */
export const loginPasswordSchema = z
  .string({ required_error: "Password is required" })
  .min(1, "Password is required")
  .max(256, "Invalid email or password");

/** Refuses a password built from the account's own email or name. */
export function passwordResemblesIdentity(password: string, email: string, fullName?: string | null) {
  const lower = password.toLowerCase();
  const local = emailDomain(email) ? email.slice(0, email.lastIndexOf("@")).toLowerCase() : "";
  if (local.length >= 4 && lower.includes(local)) return true;
  const first = (fullName ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  return first.length >= 4 && lower.replace(/[^\p{L}]/gu, "") === first;
}

/* ── URLs ───────────────────────────────────────────────────────────────── */

/**
 * An https URL a browser can safely put in href or src. Blocks javascript:,
 * data: and other schemes that turn a stored value into script.
 */
export const httpsUrlSchema = z
  .string()
  .trim()
  .max(500, "Link is too long")
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && Boolean(url.hostname) && !url.username && !url.password;
    } catch {
      return false;
    }
  }, "Use a full https:// link");

/** Social profile: an https link, or a bare handle such as @stuffsy.in. */
export const socialHandleOrUrlSchema = z
  .string()
  .trim()
  .max(200, "Link is too long")
  .refine((value) => {
    if (!value) return true;
    if (/^@?[A-Za-z0-9._-]{1,60}$/.test(value)) return true;
    // "instagram.com/yourshop" without a scheme: a plain host and path, no script.
    if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/[A-Za-z0-9._~%/?=&@-]*)?$/i.test(value)) return true;
    return httpsUrlSchema.safeParse(value).success;
  }, "Use a handle like @yourshop or a full https:// link");

/* ── Misc ───────────────────────────────────────────────────────────────── */

export const uuidSchema = z.string().uuid();

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidSchema.safeParse(value).success;
}

/** `?page=` / `?pageSize=` with sane bounds; bad input falls back instead of erroring. */
export function pagination(query: Record<string, unknown>, defaults: { pageSize: number; maxPageSize: number }) {
  const rawPage = Number(query.page);
  const rawSize = Number(query.pageSize);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1000) : 1;
  const pageSize =
    Number.isInteger(rawSize) && rawSize > 0 ? Math.min(rawSize, defaults.maxPageSize) : defaults.pageSize;
  return { page, pageSize, offset: (page - 1) * pageSize };
}
