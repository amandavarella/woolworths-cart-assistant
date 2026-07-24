import translate from "google-translate-api-x";

/**
 * Automatic translation of non-English ingredient names to English.
 *
 * The Woolworths catalogue and this project's preferred-item matching are
 * both English-only, so an ingredient pasted in another language (e.g.
 * Portuguese) would otherwise be searched for literally and return unrelated
 * products. This runs the whole list through Google Translate's free,
 * unofficial batch endpoint (via `google-translate-api-x`, no API key) with
 * auto language detection, so English items pass through untouched and only
 * genuinely foreign ones are translated — in a single network round-trip for
 * the whole list.
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

/**
 * Translate every non-English `name` in `items` to English, in one batched
 * request. Returns a new array (input is never mutated); items that are
 * already English, or that fail to translate, are returned unchanged.
 *
 * Each translated item gains `translated: true`, `originalName`, and
 * `originalFull` so the source text is never lost — reports and the
 * hand-off JSON can always show what was actually pasted.
 *
 * Fails safe: any error from the translation service (offline, rate-limited,
 * endpoint change, etc.) is caught, logged, and the original items are
 * returned as-is so a flaky translation call never breaks the pipeline.
 */
export async function translateNonEnglishItems(items, { to = "en", log = () => {} } = {}) {
  if (!items || !items.length) return items || [];

  let results;
  try {
    results = await translate(
      items.map((it) => it.name),
      { from: "auto", to }
    );
  } catch (err) {
    log(`  (translation check skipped: ${err.message})`);
    return items;
  }

  return items.map((it, i) => {
    const res = Array.isArray(results) ? results[i] : results;
    const sourceLang = res && res.from && res.from.language ? res.from.language.iso : null;
    if (!res || !res.text || !sourceLang || sourceLang === to) return it;

    let translatedName = stripTrailingContainerWord(cleanTranslatedText(res.text));
    if (!translatedName || translatedName.toLowerCase() === it.name.toLowerCase()) return it;

    const full = it.full.endsWith(it.name)
      ? it.full.slice(0, it.full.length - it.name.length) + translatedName
      : it.full;

    log(`  • "${it.full}" (${sourceLang}) → translated to "${translatedName}"`);
    return {
      ...it,
      name: translatedName,
      full,
      translated: true,
      originalName: it.name,
      originalFull: it.full,
    };
  });
}
