import fs from "node:fs";

// Units / quantity words — never meaningful for identifying a product.
const UNIT_WORDS = new Set([
  "tbsp", "tsp", "cup", "cups", "oz", "ounce", "lb", "kg", "ml", "pkt",
  "can", "cans", "slice", "slices", "clove", "cloves", "pinch", "handful", "gram", "grams",
]);

// Generic descriptors — present in many products, so they shouldn't decide a
// match on their own (e.g. "baby", "powder", "fresh"). Used ONLY for the
// preferred-list head-noun logic, not for Woolworths result scoring.
const DESCRIPTOR_WORDS = new Set([
  "baby", "fresh", "organic", "free", "range", "grass", "fed", "australian",
  "full", "fat", "light", "plain", "natural", "classic", "extra", "virgin",
  "style", "whole", "ground", "powder", "leaves", "leaf", "bunch", "block",
  "shredded", "deli", "round", "salted", "unsalted", "frozen", "dried", "sliced",
  "washed", "white", "red", "green", "yellow", "brown", "large", "small",
  "medium", "mini", "premium", "gold", "value", "essential", "essentials",
]);

/**
 * Parse one non-comment preferred-items line into a structured entry.
 *
 * Plain lines are just the Woolworths product name, e.g.:
 *   Cobram Estate Classic Extra Virgin Olive Oil
 *
 * Optional trailing `| ...` segments add:
 *   - a comma-separated list of extra match keywords (aliases), e.g. misspellings
 *     or generic terms that should also route to this product, and/or
 *   - the flag `strict`, meaning: only ever add the *exact* product name below
 *     (never a substitute) — if it's not found in Woolworths search results,
 *     the item is reported as unavailable instead of falling back.
 *
 *   Nestle Plaistowe Cocoa Powder Premium 180g | cocoa, plastowe | strict
 */
function parsePreferredLine(line) {
  const parts = line.split("|").map((p) => p.trim()).filter(Boolean);
  const name = parts.shift() || "";
  let strict = false;
  const aliases = [];
  for (const part of parts) {
    if (/^strict$/i.test(part)) {
      strict = true;
      continue;
    }
    aliases.push(...part.split(",").map((a) => a.trim()).filter(Boolean));
  }
  return { name, aliases, strict };
}

export function loadPreferred(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const seen = new Set();
  const items = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const parsed = parsePreferredLine(t);
    if (!parsed.name) continue;
    const key = parsed.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(parsed);
  }
  return items;
}

/**
 * Append product names to the preferred-items file, skipping any that already
 * exist (case-insensitive) and de-duplicating the incoming list. Preserves the
 * existing file contents and ordering; new items are appended in order.
 *
 * Returns { added, skipped, total } where `added` is the list of names written.
 */
export function appendPreferred(filePath, names) {
  const original = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf8") : "";

  const existing = new Set(
    original
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => l.toLowerCase())
  );

  const seen = new Set();
  const added = [];
  for (const raw of names) {
    const name = (raw || "").replace(/\s+/g, " ").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (existing.has(key) || seen.has(key)) continue;
    seen.add(key);
    added.push(name);
  }

  if (added.length) {
    // Keep exactly one trailing newline, then append the new names as one
    // continuous list (no section header).
    const body = original.replace(/\s*$/, original ? "\n" : "") + added.join("\n") + "\n";
    fs.writeFileSync(filePath, body);
  }

  return { added, skipped: names.length - added.length, total: existing.size + added.length };
}

function tokenize(text) {
  return (text || "").toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
}

function singularize(w) {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && (w.endsWith("oes") || w.endsWith("ses") || w.endsWith("ches") || w.endsWith("shes"))) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Keywords for scoring Woolworths search results (units removed, descriptors kept). */
export function keywords(text) {
  return tokenize(text).filter((w) => w.length > 2 && !UNIT_WORDS.has(w));
}

/** Content keywords for preferred matching: drop units AND generic descriptors. */
function contentKeywords(text) {
  return tokenize(text)
    .filter((w) => w.length > 2 && !UNIT_WORDS.has(w) && !DESCRIPTOR_WORDS.has(w))
    .map(singularize);
}

function productTokenSet(item) {
  const text = [item.name, ...(item.aliases || [])].join(" ");
  return new Set(tokenize(text).filter((w) => w.length > 2).map(singularize));
}

function wordTokens(text) {
  return tokenize(text).filter((w) => w.length > 2).map(singularize);
}

/**
 * Match a Clove ingredient against the preferred list.
 *
 * A candidate is gated in one of two ways:
 *   - the ingredient's HEAD NOUN (its last content word, singularised)
 *     appears in the product's own name — this prevents matches on generic
 *     words ("baby", "powder") or brand tokens ("San Remo") alone; or
 *   - one of the product's ALIASES is fully contained in the ingredient
 *     (every word of the alias appears somewhere in the ingredient) — this
 *     lets a multi-word alias (e.g. "lime wedges") route that specific
 *     phrase without also catching unrelated ingredients that merely share
 *     its last word (e.g. "lemon wedges" must NOT match a "lime wedges"
 *     alias just because both end in "wedges").
 *
 * Among gated candidates, the one overlapping the most content words wins.
 *
 * Returns { product, score, hits, head, strict } or null.
 */
export function matchPreferred(ingredientName, preferredList) {
  const content = contentKeywords(ingredientName);
  if (!content.length) return null;
  const head = content[content.length - 1];
  const ingredientTokens = new Set(wordTokens(ingredientName));

  let best = null;
  const ingredientLower = ingredientName.toLowerCase();
  for (const item of preferredList) {
    const nameToks = new Set(wordTokens(item.name));

    let gated = nameToks.has(head);
    let aliasBonus = 0;
    if (!gated) {
      for (const alias of item.aliases || []) {
        const aliasToks = wordTokens(alias);
        if (aliasToks.length && aliasToks.every((w) => ingredientTokens.has(w))) {
          gated = true;
          aliasBonus = 5;
          break;
        }
      }
    }
    if (!gated) continue;

    const toks = productTokenSet(item);
    let hits = 0;
    for (const w of content) if (toks.has(w)) hits++;
    let score = hits * 2 + aliasBonus;
    if (item.name.toLowerCase().includes(ingredientLower)) score += 5;

    if (!best || score > best.score || (score === best.score && item.name.length < best.product.length)) {
      best = { product: item.name, score, hits, head, strict: !!item.strict };
    }
  }
  return best;
}

/** A preferred match is usable whenever the head noun matched (non-null). */
export function isStrongMatch(match) {
  return !!match;
}
