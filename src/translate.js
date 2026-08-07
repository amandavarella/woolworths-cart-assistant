import translate from "google-translate-api-x";

/**
 * Automatic translation/localization of ingredient names to Australian
 * English, in two steps:
 *
 *   1. Curated glossary (Portuguese / US English / known mistranslations →
 *      Australian English), applied first with no network — e.g.
 *      "cheiro-verde" → "parsley", "butternut squash" → "butternut pumpkin",
 *      "cilantro" → "coriander".
 *   2. Any remaining non-English text → English via Google Translate's free,
 *      unofficial batch endpoint (`google-translate-api-x`, no API key), with
 *      auto language detection; the glossary then runs again on the result.
 *
 * Both steps run before an ingredient ever reaches preferred-item matching
 * or Woolworths search, since a foreign or non-Australian term would
 * otherwise be searched for literally and match unrelated products.
 */

// A trailing container/packaging word left over from a literal translation
// (e.g. Portuguese "vidro leite de coco" → "coconut milk glass") isn't part
// of the product identity and would otherwise be mistaken for the
// ingredient's head noun downstream. Stripped only when there's at least one
// other word left, so a bare "jar" (with no other word) is never emptied out.
const TRAILING_CONTAINER_WORDS = new Set([
  "jar", "jars", "glass", "glasses", "tin", "tins", "can", "cans",
  "bottle", "bottles", "box", "boxes", "tub", "tubs", "sachet", "sachets",
]);

// Portuguese, American, and known bad machine-translation grocery terms
// mapped to the Australian English Woolworths actually lists products under.
// Matched whole-phrase, case-insensitively; longer phrases are checked before
// their shorter sub-words (e.g. "green onion" before a lone "onion") — see
// the sort below, so entries can be added in any order. Portuguese entries
// also cover common machine-translation misfires (e.g. "cheiro-verde" →
// "green scent") so a curated hit wins over a flaky Google Translate result.
const US_TO_AU_TERMS = [
  // Portuguese → Australian English (and common mistranslations of same)
  ["abóbora de pescoço", "butternut pumpkin"],
  ["abobora de pescoco", "butternut pumpkin"],
  ["cheiro-verde", "parsley"],
  ["cheiro verde", "parsley"],
  ["green scent", "parsley"],
  ["neck pumpkin", "butternut pumpkin"],
  // US English → Australian English
  ["butternut squash", "butternut pumpkin"],
  ["butternut squashes", "butternut pumpkins"],
  ["cilantro", "coriander"],
  ["arugula", "rocket"],
  ["scallions", "spring onions"],
  ["scallion", "spring onion"],
  ["green onions", "spring onions"],
  ["green onion", "spring onion"],
  ["bell peppers", "capsicums"],
  ["bell pepper", "capsicum"],
  ["red peppers", "red capsicums"],
  ["red pepper", "red capsicum"],
  ["yellow peppers", "yellow capsicums"],
  ["yellow pepper", "yellow capsicum"],
  ["green peppers", "green capsicums"],
  ["green pepper", "green capsicum"],
  ["orange peppers", "orange capsicums"],
  ["orange pepper", "orange capsicum"],
  ["garbanzo beans", "chickpeas"],
  ["garbanzo bean", "chickpea"],
  ["rutabaga", "swede"],
  ["romaine lettuce", "cos lettuce"],
  ["confectioners sugar", "icing sugar"],
  ["confectioner's sugar", "icing sugar"],
  ["powdered sugar", "icing sugar"],
  ["all purpose flour", "plain flour"],
  ["all-purpose flour", "plain flour"],
  ["whole wheat flour", "wholemeal flour"],
  ["whole wheat bread", "wholemeal bread"],
  ["heavy cream", "thickened cream"],
  ["half and half", "pouring cream"],
  ["cornstarch", "cornflour"],
  ["ground beef", "beef mince"],
  ["ground pork", "pork mince"],
  ["ground turkey", "turkey mince"],
  ["ground chicken", "chicken mince"],
  ["ground lamb", "lamb mince"],
  ["shrimp", "prawns"],
  ["canadian bacon", "bacon"],
  ["molasses", "treacle"],
  ["cookies", "biscuits"],
  ["cookie", "biscuit"],
  ["fries", "chips"],
  ["candy", "lollies"],
  ["jell-o", "jelly"],
  ["jello", "jelly"],
  ["eggplant parmesan", "eggplant parmigiana"],
  ["diapers", "nappies"],
  ["diaper", "nappy"],
].sort((a, b) => b[0].length - a[0].length);

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Apply the curated PT/US/generic → Australian English glossary to `text`,
 * preserving the case of each match (so "Cilantro" → "Coriander", "cilantro"
 * → "coriander"). Safe to call on already-Australian text — it only ever
 * touches whole-word/phrase matches from the glossary above.
 *
 * Hyphenated Portuguese terms (e.g. "cheiro-verde") are matched with word
 * boundaries that treat `-` as a word character, so the full phrase hits.
 */
export function toAustralianEnglish(text) {
  let result = text || "";
  for (const [from, to] of US_TO_AU_TERMS) {
    // Allow hyphens inside the phrase so "cheiro-verde" matches as one term.
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(from)}(?![\\p{L}\\p{N}])`, "giu");
    result = result.replace(re, (match) =>
      match[0] === match[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to
    );
  }
  return result;
}

/** Remove stray zero-width/invisible characters Google Translate sometimes inserts. */
function cleanTranslatedText(text) {
  return (text || "").replace(/[\u200B-\u200F\uFEFF]/g, "").replace(/\s+/g, " ").trim();
}

function stripTrailingContainerWord(text) {
  const words = text.split(" ");
  if (words.length <= 1) return text;
  const last = words[words.length - 1].toLowerCase();
  if (!TRAILING_CONTAINER_WORDS.has(last)) return text;
  return words.slice(0, -1).join(" ");
}

function buildLocalizedItem(it, finalText, reason, log) {
  if (!finalText || finalText.toLowerCase() === it.name.toLowerCase()) return it;
  const full = it.full.endsWith(it.name)
    ? it.full.slice(0, it.full.length - it.name.length) + finalText
    : it.full;
  log(`  • "${it.full}" (${reason}) → "${finalText}"`);
  return {
    ...it,
    name: finalText,
    full,
    translated: true,
    originalName: it.name,
    originalFull: it.full,
  };
}

/**
 * Translate/localize every `name` in `items` to Australian English, in one
 * batched translation request (skipped entirely if every item is already
 * English — the AU-English glossary still runs locally in that case).
 * Returns a new array (input is never mutated); an unchanged item is
 * returned as-is.
 *
 * Each changed item gains `translated: true`, `originalName`, and
 * `originalFull` so the source text is never lost — reports and the
 * hand-off JSON can always show what was actually pasted.
 *
 * Fails safe: any error from the translation service (offline,
 * rate-limited, endpoint change, etc.) is caught and logged; the Australian
 * English glossary (no network needed) still applies on its own, so a flaky
 * translation call never breaks the pipeline and never loses the
 * US-English → AU-English half of the job.
 */
export async function translateNonEnglishItems(items, { to = "en", log = () => {} } = {}) {
  if (!items || !items.length) return items || [];

  // Curated glossary first: known Portuguese / US / mistranslation phrases
  // become Australian English without needing the network. Anything the
  // glossary already rewrote skips the machine-translation pass below.
  const needsMachine = [];
  const early = items.map((it) => {
    const glossed = toAustralianEnglish(it.name);
    if (glossed.toLowerCase() !== (it.name || "").toLowerCase()) {
      return buildLocalizedItem(it, glossed, "glossary (PT/US → AU English)", log);
    }
    needsMachine.push(it);
    return null;
  });

  let results;
  try {
    results = needsMachine.length
      ? await translate(
          needsMachine.map((it) => it.name),
          { from: "auto", to }
        )
      : [];
  } catch (err) {
    log(`  (translation check skipped: ${err.message})`);
    return items.map((it, i) => {
      if (early[i]) return early[i];
      return buildLocalizedItem(it, toAustralianEnglish(it.name), "US/generic English → AU English", log);
    });
  }

  let machineIdx = 0;
  return items.map((it, i) => {
    if (early[i]) return early[i];

    const res = Array.isArray(results) ? results[machineIdx++] : results;
    const sourceLang = res && res.from && res.from.language ? res.from.language.iso : null;

    let baseText = it.name;
    let reason = "US/generic English → AU English";
    if (res && res.text && sourceLang && sourceLang !== to) {
      const cleaned = stripTrailingContainerWord(cleanTranslatedText(res.text));
      if (cleaned) {
        baseText = cleaned;
        reason = `${sourceLang} → English → AU English`;
      }
    }

    // Glossary again on the machine result, so US terms and known bad
    // translations (e.g. "green scent", "neck pumpkin") still get corrected.
    return buildLocalizedItem(it, toAustralianEnglish(baseText), reason, log);
  });
}
