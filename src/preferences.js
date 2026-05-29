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

export function loadPreferred(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const seen = new Set();
  const items = [];
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(t);
  }
  return items;
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

function productTokenSet(product) {
  return new Set(tokenize(product).filter((w) => w.length > 2).map(singularize));
}

/**
 * Match a Clove ingredient against the flat preferred list.
 *
 * A candidate must share the ingredient's HEAD NOUN (its last content word,
 * singularised) with the product — this prevents matches on generic words
 * ("baby", "powder") or brand tokens ("San Remo") alone. Among candidates,
 * the one overlapping the most content words wins.
 *
 * Returns { product, score, hits, head } or null.
 */
export function matchPreferred(ingredientName, preferredList) {
  const content = contentKeywords(ingredientName);
  if (!content.length) return null;
  const head = content[content.length - 1];

  let best = null;
  const ingredientLower = ingredientName.toLowerCase();
  for (const product of preferredList) {
    const toks = productTokenSet(product);
    if (!toks.has(head)) continue; // head noun must match

    let hits = 0;
    for (const w of content) if (toks.has(w)) hits++;
    let score = hits * 2;
    if (product.toLowerCase().includes(ingredientLower)) score += 5;

    if (!best || score > best.score || (score === best.score && product.length < best.product.length)) {
      best = { product, score, hits, head };
    }
  }
  return best;
}

/** A preferred match is usable whenever the head noun matched (non-null). */
export function isStrongMatch(match) {
  return !!match;
}
