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
 * Preparation states that are mutually exclusive: a product in one state is
 * never an acceptable stand-in for an ingredient asking for another, however
 * well the rest of the name matches (raw prawns cannot be filled with cooked
 * ones). Word boundaries keep the negated forms apart, so /\bcooked\b/ does
 * not match "uncooked" and /\bpeeled\b/ does not match "unpeeled".
 */
const STATE_GROUPS = [
  {
    group: "doneness",
    states: {
      raw: /\b(?:raw|uncooked)\b/,
      cooked: /\b(?:cooked|precooked|pre-cooked)\b/,
    },
  },
  {
    group: "shell",
    states: {
      peeled: /\b(?:peeled|shelled)\b/,
      unpeeled: /\b(?:unpeeled|unshelled)\b/,
    },
  },
  // Which animal (or none) a product is made from. Brand preferences must not
  // override this: a favourite brand's beef stock is not a substitute for
  // chicken stock. Real meats are listed before "vegetable" so that an
  // ingredient naming both resolves to the meat.
  {
    group: "protein",
    states: {
      beef: /\b(?:beef|veal)\b/,
      chicken: /\bchicken\b/,
      lamb: /\blamb\b/,
      pork: /\b(?:pork|ham|bacon|prosciutto)\b/,
      turkey: /\bturkey\b/,
      fish: /\b(?:fish|seafood)\b/,
      vegetable: /\b(?:vegetable|vegetables|veggie)\b/,
    },
  },
];

/**
 * Preparation details that aren't mutually exclusive but should steer the
 * choice when they're asked for: a product that also says "deveined" beats one
 * that is silent about it, without the silent one being disqualified.
 */
const ATTRIBUTE_PATTERNS = [
  /\bdeveined\b/,
  /\bbutterflied\b/,
  /\bmarinated\b/,
  /\bsmoked\b/,
  /\btail off\b/,
  /\btail on\b/,
  /\bskin(?:less| off)\b/,
  /\bbone(?:less| out)\b/,
];

const normaliseText = (text) => (text || "").toLowerCase().replace(/\s+/g, " ");

/**
 * The preparation states and attributes asked for, read from `texts` in
 * priority order: the first text to name a state claims that group, so an
 * ingredient's own wording ("raw prawns") outranks the preferred product's.
 * Attributes are collected from every text.
 */
export function preparationProfile(...texts) {
  const states = new Map();
  const attributes = new Set();
  for (const text of texts) {
    const t = normaliseText(text);
    if (!t) continue;
    for (const { group, states: options } of STATE_GROUPS) {
      if (states.has(group)) continue;
      for (const [state, re] of Object.entries(options)) {
        if (re.test(t)) {
          states.set(group, state);
          break;
        }
      }
    }
    for (const re of ATTRIBUTE_PATTERNS) if (re.test(t)) attributes.add(re);
  }
  return { states, attributes };
}

/** Whether `productName` is in a preparation state the profile rules out. */
export function conflictsWithProfile(profile, productName) {
  if (!profile || !profile.states.size) return false;
  const t = normaliseText(productName);
  for (const { group, states: options } of STATE_GROUPS) {
    const wanted = profile.states.get(group);
    if (!wanted) continue;
    // A product naming the wanted state as well as another one still satisfies
    // the ingredient: "Beef & Lamb Meatballs" is a legitimate beef product.
    if (options[wanted].test(t)) continue;
    for (const [state, re] of Object.entries(options)) {
      if (state !== wanted && re.test(t)) return true;
    }
  }
  return false;
}

/** How many of the profile's wanted states and attributes `productName` names. */
export function profileAffinity(profile, productName) {
  if (!profile) return 0;
  const t = normaliseText(productName);
  let n = 0;
  for (const { group, states: options } of STATE_GROUPS) {
    const wanted = profile.states.get(group);
    if (wanted && options[wanted].test(t)) n++;
  }
  for (const re of profile.attributes) if (re.test(t)) n++;
  return n;
}

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

/**
 * Load the ignore list — one entry per line, `#` comments allowed. Two kinds of
 * entry are supported:
 *   - a plain item name, matched against the ingredient, and
 *   - `category: <name>`, matched against the source category an item is filed
 *     under (AnyList categories such as "Officeworks"), so a whole non-grocery
 *     aisle is skipped including items added to it later.
 *
 * Returns `{ names, categories }`, each an array of `{ raw, tokens }` where
 * `tokens` are the singularised content words used for matching.
 */
export function loadIgnore(filePath) {
  const names = [];
  const categories = [];
  if (!filePath || !fs.existsSync(filePath)) return { names, categories };
  const raw = fs.readFileSync(filePath, "utf8");
  const seen = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const categoryMatch = /^category\s*:\s*(.+)$/i.exec(t);
    const value = categoryMatch ? categoryMatch[1].trim() : t;
    const tokens = tokenize(value).map(singularize);
    if (!tokens.length) continue;
    (categoryMatch ? categories : names).push({ raw: value, tokens });
  }
  return { names, categories };
}

/** The first entry whose every word appears in `text`, or null. */
function matchIgnoreEntry(text, entries) {
  if (!entries || !entries.length) return null;
  const toks = new Set(tokenize(text).map(singularize));
  if (!toks.size) return null;
  return entries.find((entry) => entry.tokens.every((w) => toks.has(w))) || null;
}

/**
 * Why an item should be ignored, or null when it shouldn't. Accepts either a
 * bare ingredient name or an item object (`{ name, category }`).
 *
 * Both names and categories match when every word of the ignore entry is
 * present (singularised, whole-word), so "Cassava" also drops "cassava flour"
 * and a `category: chemist` entry also drops a "chemist-pharmacy" category,
 * without matching unrelated items that merely share a substring.
 *
 * Returns `{ kind: "category"|"name", entry, category? }`.
 */
export function ignoreReason(item, ignore) {
  const { name, category } = typeof item === "string" ? { name: item } : item || {};
  if (!ignore) return null;

  const byCategory = matchIgnoreEntry(category, ignore.categories);
  if (byCategory) return { kind: "category", entry: byCategory.raw, category };

  const byName = matchIgnoreEntry(name, ignore.names);
  if (byName) return { kind: "name", entry: byName.raw };

  return null;
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

const COLOR_WORDS = new Set(["white", "red", "green", "yellow", "brown", "black", "purple", "orange"]);

/** The first colour word found in a token collection (Set or array), or null. */
function colorOf(tokens) {
  for (const t of tokens) if (COLOR_WORDS.has(t)) return t;
  return null;
}

/**
 * Whether `color` sits immediately next to an occurrence of `head` in the
 * ordered `tokens` array — i.e. the colour actually describes that noun,
 * rather than being an unrelated word elsewhere in a long product name (e.g.
 * "Red" in "... Capsicum Corn Red Kidney Beans ..." does not describe the
 * capsicum).
 */
function colorAdjacentTo(tokens, head, color) {
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] !== head) continue;
    if (tokens[i - 1] === color || tokens[i + 1] === color) return true;
  }
  return false;
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
 * A candidate naming a conflicting PREPARATION STATE is rejected outright,
 * whatever it scores: "raw prawns" never resolves to a cooked product.
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
  const ingredientColor = colorOf(ingredientTokens);
  const prep = preparationProfile(ingredientName);

  let best = null;
  const ingredientLower = ingredientName.toLowerCase();
  for (const item of preferredList) {
    const nameTokList = wordTokens(item.name);
    const nameToks = new Set(nameTokList);

    // A colour named in the ingredient (e.g. "red capsicum") must only match a
    // preferred product where that same colour word sits right next to the
    // head noun (e.g. "Capsicum Red"), never a differently-coloured,
    // colour-unspecified, or merely-coincidental one (e.g. "Red" in "...
    // Capsicum Corn Red Kidney Beans..." doesn't describe the capsicum). An
    // ingredient with no colour still falls through to the default preferred
    // product as before.
    if (ingredientColor && !colorAdjacentTo(nameTokList, head, ingredientColor)) continue;

    if (conflictsWithProfile(prep, item.name)) continue;

    let gated = nameToks.has(head);
    // Aliases can gate an otherwise-unmatched product AND, when they fully
    // match, add a bonus even for products already gated by name — this lets
    // an ambiguous bare word (e.g. "lemon", "milk") be steered to the right
    // product among several same-scoring candidates by declaring it as an
    // alias on the one you actually want.
    let aliasBonus = 0;
    for (const alias of item.aliases || []) {
      const aliasToks = wordTokens(alias);
      if (aliasToks.length && aliasToks.every((w) => ingredientTokens.has(w))) {
        gated = true;
        aliasBonus = Math.max(aliasBonus, 5);
      }
    }
    if (!gated) continue;

    const toks = productTokenSet(item);
    let hits = 0;
    for (const w of content) if (toks.has(w)) hits++;
    let score = hits * 2 + aliasBonus + profileAffinity(prep, item.name) * 3;
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
