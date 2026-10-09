/**
 * Client-side copies of the API's input rules (backend/src/utils/validation.ts),
 * so forms can point at the exact problem before submitting. The API stays
 * the authority: it re-checks everything, including things only it can know
 * (disposable providers, whether a domain receives mail).
 *
 * Each `*Problem` function returns a message to show, or null when the value is fine.
 */

const EMAIL_PATTERN =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|example|test|invalid|localhost|local)$/;

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function emailProblem(raw: string): string | null {
  const email = normalizeEmail(raw);
  if (!email) return "Email is required";
  const at = email.lastIndexOf("@");
  if (email.length > 254 || at <= 0 || at > 64 || !EMAIL_PATTERN.test(email)) {
    return "Enter a valid email address";
  }
  if (RESERVED_DOMAIN.test(email.slice(at + 1))) return "Use a real email address";
  return null;
}

/**
 * Indian mobile number as the bare 10 digits the API stores. Accepts
 * "+91 98765 43210", "098765 43210", "9876543210". Null when invalid.
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
  if (/^(\d)\1{9}$/.test(digits)) return null;
  return digits;
}

export function phoneProblem(raw: string): string | null {
  if (!raw.trim()) return "Phone number is required";
  return normalizeIndianMobile(raw) ? null : "Enter a valid 10-digit Indian mobile number";
}

export function normalizePincode(raw: string) {
  return raw.replace(/\s/g, "");
}

export function pincodeProblem(raw: string): string | null {
  const pin = normalizePincode(raw);
  if (!pin) return "PIN code is required";
  return /^[1-9]\d{5}$/.test(pin) ? null : "Enter a valid 6-digit PIN code";
}

export function personNameProblem(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  if (name.length < 2) return "Enter your full name";
  if (name.length > 80) return "Name is too long";
  if (/(https?:\/\/|www\.)/i.test(name)) return "Name can't contain a link";
  if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(name)) return "Use letters only in your name";
  return null;
}

const COMMON_PASSWORDS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "password123",
  "passw0rd",
  "qwerty123",
  "abcd1234",
  "abc12345",
  "admin123",
  "welcome1",
  "welcome123",
  "india123",
  "india@123",
  "stuffsy123",
  "test1234",
  "pass@123",
  "admin@123",
]);

/** Shown under new-password fields so the rules aren't a surprise. */
export const PASSWORD_HINT = "At least 8 characters, with a letter and a number.";

export function newPasswordProblem(password: string, identity?: { email?: string; fullName?: string }) {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (new TextEncoder().encode(password).length > 72) return "Password must be at most 72 characters";
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "Use at least one letter and one number";
  if (/^(.)\1+$/.test(password)) return "Password is too easy to guess";
  if (COMMON_PASSWORDS.has(password.toLowerCase())) return "That password is too common. Choose another.";
  const lower = password.toLowerCase();
  const local = identity?.email ? normalizeEmail(identity.email).split("@")[0] : "";
  if (local.length >= 4 && lower.includes(local)) return "Your password can't contain your email";
  const first = identity?.fullName?.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (first.length >= 4 && lower.replace(/[^\p{L}]/gu, "") === first) {
    return "Your password can't contain your name";
  }
  return null;
}

/** An https link safe to store and render (no javascript:, data:, …). */
export function httpsUrlProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname) return null;
  } catch {
    /* fall through */
  }
  return "Use a full https:// link";
}

/** "@shop", "instagram.com/shop" or an https link. */
export function socialLinkProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^@?[A-Za-z0-9._-]{1,60}$/.test(value)) return null;
  if (/^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/[A-Za-z0-9._~%/?=&@-]*)?$/i.test(value)) return null;
  if (!httpsUrlProblem(value)) return null;
  return "Use a handle like @yourshop or a full https:// link";
}

export function upiProblem(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  return /^[\w.-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/.test(value) ? null : "Enter a valid UPI ID (name@bank)";
}

export function ifscProblem(raw: string): string | null {
  const value = raw.trim().toUpperCase();
  if (!value) return null;
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(value) ? null : "Enter a valid IFSC code";
}

/** Most of one item a cart line can hold; matches the API's cap. */
export const MAX_LINE_QUANTITY = 99;
