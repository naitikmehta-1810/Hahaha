/**
 * Append PAYOUT_ENCRYPTION_KEY to backend/.env if missing.
 *   npx tsx scripts/ensure-payout-key.mts
 */
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "../.env");
if (!existsSync(envPath)) {
  console.error("No backend/.env found — copy .env.example first");
  process.exit(1);
}

const raw = readFileSync(envPath, "utf8");
if (/^PAYOUT_ENCRYPTION_KEY=.+/m.test(raw)) {
  console.log("PAYOUT_ENCRYPTION_KEY already set — no change");
  process.exit(0);
}

const key = randomBytes(32).toString("base64");
const line = `\n# Auto-generated for local payout_details encryption\nPAYOUT_ENCRYPTION_KEY=${key}\n`;
writeFileSync(envPath, raw.endsWith("\n") ? raw + line.trimStart() : raw + line, "utf8");
console.log("Appended PAYOUT_ENCRYPTION_KEY to backend/.env");
