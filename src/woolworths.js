import { keywords } from "./preferences.js";

// Product-name fragments that indicate a non-food item — used to avoid adding
// kitchenware, clothing, toys, cosmetics, cleaning products, etc.
const NONFOOD_WORDS = [
  "dishrack", "dish rack", "autospout", "water bottle", "bottle cap", "storage box",
  "cookware", "bakeware", "utensil", "cutlery", "frying pan", "saucepan", "pot set",
  "electric", "appliance", "scented", "fragrance", "candle", "detergent", "dishwashing",
  "laundry", "shampoo", "conditioner", "body wash", "soap bar", "deodorant", "toilet paper",
  "tissue", "nappy", "diaper", "insect", "mosquito", "sunscreen", "body lotion",
  "vitamin", "supplement", "medicine", "bandage", "first aid", "stationery", "notebook",
  "battery", "charger", "earphone", "puzzle", "costume", "inflatable", "clothing",
  "shirt", "sock", "towel", "bedding", "pillow", "pillowcase", "hat ", "mop", "broom",
  "vacuum", "air freshener", "cat food", "dog food", "pet ", "cat toy", "dog toy",
  "fertiliser", "garden", "tool kit", "mouthwash", "toothpaste", "toothbrush",
  "razor", "shaving", "liner", "hair", "nail", "lipstick", "eye ink",
];

const SEARCH = (base, term) =>
  `${base}/shop/search/products?searchTerm=${encodeURIComponent(term)}`;

export async function isWoolworthsLoggedIn(page) {
  return page.evaluate(async () => {
    try {
      const r = await fetch("/apis/ui/PersonalisedSettings/Details", {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (r.ok) {
        const j = await r.json();
        if (j && (j.IsLoggedIn === true || j.FirstName || j.GivenName)) return true;
      }
    } catch {}
    const txt = document.body ? document.body.innerText : "";
    if (/my account/i.test(txt) && /hi,?\s+\w/i.test(txt)) return true;
    return false;
  });
}

// In-page helper: collect every "Add to cart" button (piercing shadow DOM)
// together with its product name.
const COLLECT_FN = `
function __collectAddButtons() {
  const seen = new Set();
  const out = [];
  (function walk(root, d) {
    if (d > 16) return;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot, d + 1); }
      if (el.tagName === 'BUTTON') {
        const aria = el.getAttribute('aria-label') || '';
        const txt = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (/^add to cart$/i.test(txt) && /^add /i.test(aria)) {
          const name = aria.replace(/^Add\\s+/i, '').replace(/\\s+to cart\\s*$/i, '').replace(/\\s+/g, ' ').trim();
          out.push(name);
        }
      }
    }
  })(document, 0);
  return out;
}`;

async function waitForResults(page, timeoutMs = 11000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const n = await page.evaluate(`(() => { ${COLLECT_FN}; return __collectAddButtons().length; })()`);
    if (n > 0) return n;
    await page.waitForTimeout(450);
  }
  return 0;
}

function chooseProduct(products, kws, exactName) {
  const ex = (exactName || "").toLowerCase();
  let bestPassing = null; // food-safe, score >= 0
  let bestAny = null; // highest keyword overlap regardless (best-effort fallback)

  for (const name of products) {
    const pl = name.toLowerCase();
    let hits = 0;
    for (const kw of kws) if (pl.includes(kw)) hits++;
    const isNonFood = NONFOOD_WORDS.some((w) => pl.includes(w));
    let score = hits * 2;
    if (ex && pl.includes(ex)) score += 5;

    if (!bestAny || hits > bestAny.hits) bestAny = { name, hits, score };
    if (!isNonFood) {
      if (!bestPassing || score > bestPassing.score) bestPassing = { name, hits, score };
    }
  }

  if (bestPassing && bestPassing.score >= 0) {
    return { ...bestPassing, confidence: bestPassing.score >= 2 ? "good" : "low" };
  }
  // Nothing passed the food filter — best-effort pick, flagged.
  const fallback = bestAny || { name: products[0], hits: 0, score: 0 };
  return { ...fallback, confidence: "very-low" };
}

/**
 * Search Woolworths for `term`, choose the best product, and click Add to cart
 * (adds a single unit). Never silently skips: if results exist it adds the best
 * available match. Quantity is raised separately via setQuantity().
 */
export async function addToCart(page, { base, term, ingredientName, exactName }) {
  await page.goto(SEARCH(base, term), { waitUntil: "domcontentloaded" });
  const count = await waitForResults(page);
  if (!count) return { status: "NO_RESULTS", term };

  const products = await page.evaluate(`(() => { ${COLLECT_FN}; return __collectAddButtons(); })()`);
  const kws = keywords(exactName || ingredientName || term);
  const choice = chooseProduct(products, kws, exactName);

  // Click the chosen product's Add button (match by exact product name).
  const clicked = await page.evaluate((target) => {
    const seen = new Set();
    let done = false;
    (function walk(root, d) {
      if (d > 16 || done) return;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot, d + 1); }
        if (done) return;
        if (el.tagName === "BUTTON") {
          const aria = el.getAttribute("aria-label") || "";
          const txt = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (/^add to cart$/i.test(txt) && /^add /i.test(aria)) {
            const name = aria.replace(/^Add\s+/i, "").replace(/\s+to cart\s*$/i, "").replace(/\s+/g, " ").trim();
            if (name === target) { el.click(); done = true; return; }
          }
        }
      }
    })(document, 0);
    return done;
  }, choice.name);

  if (!clicked) return { status: "ADD_FAILED", term, product: choice.name };

  await page.waitForTimeout(1200);

  return {
    status: "ADDED",
    term,
    product: choice.name,
    score: choice.score,
    confidence: choice.confidence,
    candidates: products.length,
  };
}

/**
 * Set the quantity of an already-added product by writing to its tile's
 * "Quantity" input (Woolworths renders a number input, not +/- buttons we can
 * reliably target). Returns the quantity actually reached.
 */
export async function setQuantity(page, productName, target, maxQty = 12) {
  const want = Math.max(1, Math.min(maxQty, Math.round(target)));
  if (want <= 1) return 1;

  const reached = await page.evaluate(
    ({ productName, want }) => {
      const seen = new Set();
      let result = null;
      (function walk(root, d) {
        if (d > 18 || result != null) return;
        for (const el of root.querySelectorAll("*")) {
          if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot, d + 1); }
          if (result != null) return;
          if (el.tagName === "INPUT" && /quantity/i.test(el.getAttribute("aria-label") || "")) {
            // Confirm this input belongs to the target product's tile.
            let p = el;
            let belongs = false;
            for (let k = 0; k < 12 && p; k++) {
              if ((p.textContent || "").includes(productName)) { belongs = true; break; }
              p = p.parentElement || (p.getRootNode && p.getRootNode().host) || null;
            }
            if (!belongs) continue;

            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            setter.call(el, String(want));
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
            el.blur && el.blur();
            result = el.value;
            return;
          }
        }
      })(document, 0);
      return result;
    },
    { productName, want }
  );

  await page.waitForTimeout(1200);
  return reached ? Number(reached) || 1 : 1;
}

// In-page helper: collect product names from list tiles by reading each
// "Add to cart" button's aria-label (piercing shadow DOM) and stripping the
// "Add " prefix / " to cart" suffix.
const COLLECT_NAMES_FN = `
function __collectProductNames() {
  const out = [];
  const seen = new Set();
  (function walk(root, d) {
    if (d > 16) return;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot, d + 1); }
      if (el.tagName === 'BUTTON') {
        const aria = el.getAttribute('aria-label') || '';
        const txt = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (/^add to cart$/i.test(txt) && /^add /i.test(aria)) {
          const name = aria
            .replace(/^Add\\s+/i, '')
            .replace(/\\s+to cart\\.?\\s*$/i, '')
            .replace(/\\s+/g, ' ')
            .trim();
          if (name) out.push(name);
        }
      }
    }
  })(document, 0);
  return out;
}`;

async function waitForNamedResults(page, timeoutMs = 12000) {
  const start = Date.now();
  let last = 0;
  while (Date.now() - start < timeoutMs) {
    const n = await page.evaluate(`(() => { ${COLLECT_NAMES_FN}; return __collectProductNames().length; })()`);
    if (n > 0 && n === last) return n; // count stabilised
    last = n;
    await page.waitForTimeout(500);
  }
  return last;
}

/**
 * Read every product on the Woolworths "My Lists → past shops" list across all
 * pages. `listPath` defaults to the "everything" list. Returns a de-duplicated
 * (case-insensitive, order-preserving) array of product names.
 *
 * Note: only purchasable tiles (those with an "Add to cart" button) are
 * captured; unavailable / out-of-stock items are skipped because they have no
 * add button and aren't usable as preferred products anyway.
 */
export async function readPastShopProducts(page, { base, listPath = "/shop/mylists/pastshops/everything" } = {}) {
  const url = (p) => `${base}${listPath}?pageNumber=${p}`;

  await page.goto(url(1), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  await waitForNamedResults(page);

  const pageCount = await page.evaluate(() => {
    const el = document.querySelector(".page-count");
    return el ? parseInt(el.textContent.trim(), 10) || 1 : 1;
  });

  const all = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p > 1) {
      await page.goto(url(p), { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
    }
    await waitForNamedResults(page);
    // Scroll through the page so every lazily-rendered tile mounts.
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 800) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 120));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(600);
    const names = await page.evaluate(`(() => { ${COLLECT_NAMES_FN}; return __collectProductNames(); })()`);
    all.push({ page: p, names });
  }

  const seen = new Set();
  const products = [];
  for (const { names } of all) {
    for (const n of names) {
      const key = n.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      products.push(n);
    }
  }

  return { pageCount, perPage: all.map((x) => ({ page: x.page, count: x.names.length })), products };
}

export async function readTrolley(page) {
  return page.evaluate(async () => {
    const r = await fetch("/apis/ui/Trolley", {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
    const j = await r.json();
    return {
      count: j.TrolleyItemCount,
      totalQty: j.TotalTrolleyItemQuantity,
      subtotal: j.Totals ? j.Totals.SubTotal : null,
      items: (j.AvailableItems || []).map((x) => ({ name: x.Name || x.DisplayName, qty: x.Quantity })),
    };
  });
}
