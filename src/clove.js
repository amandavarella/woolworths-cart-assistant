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
