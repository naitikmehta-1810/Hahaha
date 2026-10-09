/**
 * Turns what a buyer typed into something the catalog query can use.
 *
 * Pure functions only (no database), so the rules are easy to test:
 *   "Handmade jhumkas under ₹500"
 *     → tokens ["handmade", "jhumkas"], priceMax 500
 *     → tsquery  (handmade) & (jhumkas | jhumka | earring | earrings):*
 *
 * Steps: normalize text, pull out price phrases, drop stopwords, correct
 * typos against the catalog vocabulary, expand synonyms, build a tsquery.
 */

export type ParsedSearch = {
  /** What the buyer typed, trimmed. */
  raw: string;
  /** Lowercased words that carry meaning, in order (after typo correction). */
  tokens: string[];
  /** Same, before correction; differs only when a typo was fixed. */
  originalTokens: string[];
  /** "under 500" / "below ₹1,000" → 500 / 1000. */
  priceMax: number | null;
  /** "above 500" / "over ₹2000" → 500 / 2000. */
  priceMin: number | null;
  /** The query as normalized text (no price phrase), for exact/phrase boosts and logging. */
  text: string;
  /** Set when a typo was corrected: what the results are actually for. */
  correctedText: string | null;
};

/**
 * Words that never narrow a product search. Postgres drops English stopwords
 * itself; these are shopping filler ("buy", "online") plus a few Hinglish ones.
 */
const STOPWORDS = new Set([
  "a", "an", "and", "the", "for", "of", "in", "on", "with", "to", "by", "at", "or", "from",
  "buy", "shop", "online", "best", "new", "latest", "cheap", "order", "sale", "item", "items",
  "product", "products", "price", "rs", "inr", "ke", "ki", "ka", "liye", "wala", "wali",
]);

/**
 * Same thing, different words. Kept to terms buyers of handmade and Indian
 * goods actually use; each entry expands both ways.
 */
const SYNONYM_GROUPS: string[][] = [
  ["tshirt", "tee", "t-shirt"],
  ["earring", "earrings", "jhumka", "jhumkas", "jhumki"],
  ["necklace", "pendant", "chain"],
  ["bangle", "bangles", "kada", "bracelet"],
  ["mug", "cup"],
  ["sofa", "couch"],
  ["bag", "tote", "handbag"],
  ["purse", "wallet", "clutch"],
  ["lamp", "lantern"],
  ["diya", "diyas", "deepak"],
  ["saree", "sari"],
  ["kurta", "kurti"],
  ["dupatta", "stole", "scarf"],
  ["planter", "pot"],
  ["painting", "artwork", "canvas"],
  ["frame", "frames"],
  ["gift", "gifts", "present"],
  ["decor", "decoration", "decorative"],
  ["wall", "hanging"],
  ["candle", "candles"],
  ["soap", "soaps"],
  ["rakhi", "rakhis"],
  ["notebook", "journal", "diary"],
  ["rug", "carpet", "dhurrie"],
  ["cushion", "pillow"],
  ["toy", "toys"],
  ["keychain", "keyring"],
];

const SYNONYMS = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    SYNONYMS.set(word, group.filter((other) => other !== word));
  }
}

export function synonymsFor(token: string) {
  return SYNONYMS.get(token) ?? [];
}

const PRICE_MAX = /\b(?:under|below|less than|upto|up to|within|max|maximum|<)\s*(?:rs\.?|inr|₹)?\s*([\d,]{2,9})\b/i;
const PRICE_MIN = /\b(?:above|over|more than|min|minimum|from|>)\s*(?:rs\.?|inr|₹)?\s*([\d,]{2,9})\b/i;
const PRICE_RANGE = /(?:rs\.?|inr|₹)?\s*([\d,]{2,9})\s*(?:-|to)\s*(?:rs\.?|inr|₹)?\s*([\d,]{2,9})\b/i;

function toAmount(raw: string) {
  const value = Number(raw.replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 && value < 100_000_000 ? value : null;
}

/** Lowercase, unify quotes/dashes, keep letters (any script), digits and spaces. */
export function normalizeQuery(raw: string) {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^\p{L}\p{N}₹,\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/** Splits into words; "t-shirt" stays one word so it can match its synonyms. */
function tokenize(text: string) {
  return text
    .split(/[\s,]+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length > 0 && word.length <= 40 && !/^\d+$/.test(word));
}

export function parseSearch(raw: string, correct: (token: string) => string | null = () => null): ParsedSearch {
  let text = normalizeQuery(raw);
  let priceMin: number | null = null;
  let priceMax: number | null = null;

  const range = text.match(PRICE_RANGE);
  if (range) {
    const a = toAmount(range[1]);
    const b = toAmount(range[2]);
    if (a && b) {
      priceMin = Math.min(a, b);
      priceMax = Math.max(a, b);
      text = text.replace(range[0], " ");
    }
  }
  const max = text.match(PRICE_MAX);
  if (max && priceMax === null) {
    priceMax = toAmount(max[1]);
    if (priceMax) text = text.replace(max[0], " ");
  }
  const min = text.match(PRICE_MIN);
  if (min && priceMin === null) {
    priceMin = toAmount(min[1]);
    if (priceMin) text = text.replace(min[0], " ");
  }
  text = text.replace(/₹/g, " ").replace(/\s+/g, " ").trim();

  const meaningful = tokenize(text).filter((token) => !STOPWORDS.has(token));
  // A query made only of filler ("best gifts online" minus everything) keeps its words.
  const originalTokens = (meaningful.length > 0 ? meaningful : tokenize(text)).slice(0, 8);
  const tokens = originalTokens.map((token) => correct(token) ?? token);
  const corrected = tokens.some((token, i) => token !== originalTokens[i]);

  return {
    raw: raw.trim(),
    tokens,
    originalTokens,
    priceMin,
    priceMax,
    text,
    correctedText: corrected ? tokens.join(" ") : null,
  };
}

/** Only characters that are safe inside to_tsquery; everything else splits the word. */
function lexemeParts(word: string) {
  return word
    .split(/[^\p{L}\p{N}]+/u)
    .filter((part) => part.length > 0);
}

/**
 * tsquery text for to_tsquery('english', …). Every token must match (one of
 * its synonyms counts); the last token also matches as a prefix so results
 * appear while the buyer is still typing ("cand" → candle, candles).
 *
 * mode "any" is the relaxed fallback: a product matching any token is
 * returned, ranked by how many it matches.
 */
export function buildTsQuery(tokens: string[], mode: "all" | "any" = "all"): string | null {
  const groups: string[] = [];
  tokens.forEach((token, index) => {
    const isLast = index === tokens.length - 1;
    const variants = [token, ...synonymsFor(token)];
    const alternatives = variants
      .map((variant) => {
        const parts = lexemeParts(variant);
        if (parts.length === 0) return null;
        // Prefix-match only the word being typed, and only once it says something.
        const prefix = isLast && variant === token && parts[parts.length - 1].length >= 2;
        return parts.map((part, i) => (prefix && i === parts.length - 1 ? `${part}:*` : part)).join(" <-> ");
      })
      .filter((alternative): alternative is string => Boolean(alternative));
    if (alternatives.length > 0) groups.push(`(${[...new Set(alternatives)].join(" | ")})`);
  });
  if (groups.length === 0) return null;
  return groups.join(mode === "all" ? " & " : " | ");
}

/* ── Typo correction ───────────────────────────────────────────────────── */

/** Optimal string alignment distance (Levenshtein + adjacent swaps), capped. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const rows = a.length + 1;
  const cols = b.length + 1;
  let prevPrev = new Array<number>(cols).fill(0);
  let prev = Array.from({ length: cols }, (_, j) => j);
  for (let i = 1; i < rows; i += 1) {
    const current = new Array<number>(cols);
    current[0] = i;
    let rowMin = current[0];
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, current[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        value = Math.min(value, prevPrev[j - 2] + 1);
      }
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = current;
  }
  return prev[cols - 1];
}

export type Vocabulary = {
  /** word → number of products containing it */
  frequency: Map<string, number>;
  /** words grouped by length, for cheap candidate lookup */
  byLength: Map<number, string[]>;
};

export function buildVocabulary(words: Array<{ word: string; count: number }>): Vocabulary {
  const frequency = new Map<string, number>();
  const byLength = new Map<number, string[]>();
  for (const { word, count } of words) {
    if (!/^\p{L}[\p{L}\p{N}-]*$/u.test(word) || word.length < 2) continue;
    frequency.set(word, count);
    const bucket = byLength.get(word.length) ?? [];
    bucket.push(word);
    byLength.set(word.length, bucket);
  }
  return { frequency, byLength };
}

/**
 * The closest catalog word to `token`, or null when `token` is fine as it is
 * (a known word, a synonym, a prefix of a known word, or nothing close).
 * Short words allow one edit, longer words two; ties go to the more common word.
 */
export function correctToken(token: string, vocabulary: Vocabulary): string | null {
  if (token.length < 4 || vocabulary.frequency.size === 0) return null;
  if (vocabulary.frequency.has(token) || SYNONYMS.has(token)) return null;
  // Plurals and stems are handled by Postgres; don't "correct" them.
  if (vocabulary.frequency.has(token.replace(/(es|s)$/, ""))) return null;
  for (const [length, words] of vocabulary.byLength) {
    if (length > token.length && words.some((word) => word.startsWith(token))) return null;
  }

  const maxEdits = token.length <= 5 ? 1 : 2;
  let best: string | null = null;
  let bestDistance = maxEdits + 1;
  let bestCount = 0;
  for (let length = token.length - maxEdits; length <= token.length + maxEdits; length += 1) {
    for (const word of vocabulary.byLength.get(length) ?? []) {
      // Typos rarely change the first letter; skipping those saves most work.
      if (word[0] !== token[0] && word[1] !== token[1]) continue;
      const distance = editDistance(token, word, maxEdits);
      const count = vocabulary.frequency.get(word) ?? 0;
      if (distance < bestDistance || (distance === bestDistance && count > bestCount)) {
        best = word;
        bestDistance = distance;
        bestCount = count;
      }
    }
  }
  return bestDistance <= maxEdits ? best : null;
}
