/**
 * Clove groceries extraction.
 *
 * Each item row looks like:
 *   <div tabindex="0" class="... flex-row items-start ...">
 *     <div ...><div class="size-[24px] ... border-kale-500 rounded-full"></div></div>  // checkbox
 *     <div class="flex-1 ...">
 *       <span class="text-body-lg line-clamp-3">
 *         <span>1 lb </span><span class="text-body-lg-bold">baby potatoes</span>
 *       </span>
 *     </div>
 *   </div>
 *
 * A checked item has `bg-kale-500` added to the circle's class (and a tick SVG).
 * Section titles are <h2> elements, so they're naturally excluded.
 */

/**
 * Units that can appear in a pasted amount prefix. Kept in sync with the
 * quantity estimator so "2 cloves garlic" or "1 x 14 ounce can coconut milk"
 * strip down to just the ingredient name.
 */
const PASTE_UNIT_WORDS = new Set([
  "tbsp", "tablespoon", "tablespoons", "tsp", "teaspoon", "teaspoons",
  "cup", "cups", "pinch", "pinches", "handful", "handfuls", "dash", "dashes",
  "clove", "cloves", "sprig", "sprigs", "knob", "knobs", "splash", "splashes",
  "ml", "millilitre", "millilitres", "l", "litre", "litres",
  "g", "gs", "gram", "grams", "kg", "lb", "lbs", "pound", "pounds",
  "oz", "ounce", "ounces",
  "can", "cans", "tin", "tins", "jar", "jars", "pkt", "packet", "packets",
  "bottle", "bottles", "box", "boxes", "tub", "tubs", "bag", "bags",
  "bunch", "bunches", "punnet", "punnets", "pack", "packs",
]);

const NUMBER_TOKEN_RE = /^(?:\d+(?:[.,]\d+)?|\d*[½⅓⅔¼¾⅕⅛]|\d+[⁄/]\d+)$/;

/**
 * Strip a leading amount from a pasted line to get the bare ingredient name.
 *
 * e.g. "1 lb baby potatoes" → "baby potatoes", "6 roma tomatoes" →
 * "roma tomatoes", "1 × 14 ounce can coconut milk" → "coconut milk".
 * Unit words are only stripped once a number has been seen, so a line like
 * "cloves" (no amount) is left untouched.
 */
export function ingredientNameFromLine(line) {
  const tokens = (line || "").trim().split(/\s+/).filter(Boolean);
  let i = 0;
  let sawNumber = false;
  while (i < tokens.length) {
    const tk = tokens[i];
    const lower = tk.toLowerCase();
    if (NUMBER_TOKEN_RE.test(tk)) {
      sawNumber = true;
      i++;
      continue;
    }
    if (sawNumber && (lower === "x" || lower === "×" || lower === "of")) {
      i++;
      continue;
    }
    if (sawNumber && PASTE_UNIT_WORDS.has(lower.replace(/[.,]$/, ""))) {
      i++;
      continue;
    }
    break;
  }
  const name = tokens.slice(i).join(" ").trim();
  return name || (line || "").trim();
}

/**
 * Parse a pasted Clove list (plain text, one ingredient per line) into the same
 * `{ full, name }` shape the browser scraper returns, so everything downstream
 * is identical. Blank lines and lines starting with `#` are ignored, and
 * duplicates (by full line) are de-duped.
 */
export function parsePastedIngredients(text) {
  const out = [];
  const seen = new Set();
  for (const raw of String(text || "").split(/\r?\n/)) {
    const full = raw.replace(/\s+/g, " ").replace(/^[•\-\u2022\s]+/, "").trim();
    if (!full || full.startsWith("#")) continue;
    const key = full.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ full, name: ingredientNameFromLine(full) });
  }
  return out;
}

export async function isCloveLoggedIn(page) {
  return page.evaluate(() => {
    const txt = document.body ? document.body.innerText : "";
    const hasItems = document.querySelectorAll('span[class*="text-body-lg-bold"]').length > 0;
    const hasLoggedInChrome = /By Category|By Recipe|Add ingredient/i.test(txt);
    const looksLikeLogin = /(log ?in|sign ?in|continue with)/i.test(txt) && !hasLoggedInChrome;
    return (hasItems || hasLoggedInChrome) && !looksLikeLogin;
  });
}

export async function extractIngredients(page, cloveUrl) {
  await page.goto(cloveUrl, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  // Scroll in steps until the item count stabilises (handles lazy rendering).
  let prevCount = -1;
  for (let i = 0; i < 30; i++) {
    const count = await page.evaluate(
      () => document.querySelectorAll('span[class*="text-body-lg-bold"]').length
    );
    if (count > 0 && count === prevCount) break;
    prevCount = count;
    await page.evaluate(() => window.scrollBy(0, 700));
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);

  const items = await page.evaluate(() => {
    const normalise = (s) =>
      (s || "").replace(/\s+/g, " ").replace(/^[•\-\u2022\s]+/, "").trim();
    const HEADER_RE = /^(cans? and jars?|cheese|fruit( and)? vegetables?|herbs?( and)? spices?|meat|pasta,?\s*rice( and)? beans?|condiments?( and)? sauces?|dairy|bakery|frozen|pantry|others?)$/i;

    const out = [];
    const seen = new Set();
    const rows = Array.from(
      document.querySelectorAll('[tabindex="0"][class*="flex-row"][class*="items-start"]')
    );

    for (const row of rows) {
      const circle = row.querySelector('[class*="rounded-full"]');
      const isChecked = circle && /bg-kale-500/.test(circle.className || "");
      if (isChecked) continue;

      const nameEl = row.querySelector('span[class*="text-body-lg-bold"]');
      if (!nameEl) continue;
      const container = nameEl.parentElement;
      const full = normalise(
        container && /text-body-lg(?![\w-])/.test(container.className || "")
          ? container.textContent || ""
          : nameEl.textContent || ""
      );
      const name = normalise(nameEl.textContent || "");
      if (!full || HEADER_RE.test(full)) continue;

      const key = full.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ full, name });
    }
    return out;
  });

  return items;
}
