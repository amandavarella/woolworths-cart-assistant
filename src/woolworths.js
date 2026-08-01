import {
  keywords,
  preparationProfile,
  conflictsWithProfile,
  profileAffinity,
} from "./preferences.js";

// Product-name fragments that indicate a non-consumable hard good — used to
// keep the cart to actual consumables: produce, food & drink, house-cleaning
// products, and personal hygiene/care. Everything below (kitchen tools and
// gadgets, electronics, clothing, toys, stationery, garden, pet gear, etc.)
// is filtered out even if it turns up in a search for a food term.
const NONFOOD_WORDS = [
  // Kitchen tools, gadgets & hard kitchenware (not consumable)
  "dishrack", "dish rack", "autospout", "water bottle", "bottle cap", "storage box",
  "cookware", "bakeware", "utensil", "cutlery", "frying pan", "saucepan", "pot set",
  "squeezer", "juicer", "peeler", "grater", "masher", "whisk", "spatula", "tongs",
  "corkscrew", "bottle opener", "can opener", "colander", "strainer", "sieve",
  "chopper", "slicer", "mandoline", "rolling pin", "cutting board", "chopping board",
  "knife set", "knife block", "scissors", "funnel", "kettle", "toaster", "blender",
  "mixer", "grinder", "mould", "mold", "tumbler", "flask", "thermos", "gadget",
  "stainless steel", "dispenser", "organiser", "organizer", "lunch box", "lunchbox",
  "container set", "kitchen scale", "thermometer", "timer",
  // Other non-consumable hard goods
  "electric", "appliance", "candle", "stationery", "notebook", "battery", "charger",
  "earphone", "puzzle", "costume", "inflatable", "clothing", "shirt", "sock", "towel",
  "bedding", "pillow", "pillowcase", "hat ", "fertiliser", "garden", "tool kit",
  "cat food", "dog food", "pet ", "cat toy", "dog toy",
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

// In-page helper: decide whether a product tile is a third-party
// "marketplace" listing (Woolworths Everyday Market), which renders a
// "Sold by <seller>" label inside the tile. These are never Woolworths-
// fulfilled groceries and are consistently the wrong product, so we exclude
// them. Each tile's text is isolated in its own <wc-product-tile> shadow root,
// so climbing ancestors from a button can't pick up a neighbouring tile's
// label; we still stop at the tile boundary to be safe.
const MARKETPLACE_FN = `
function __isMarketplace(startEl) {
  let p = startEl;
  for (let k = 0; k < 8 && p; k++) {
    if (/sold by/i.test(p.textContent || '')) return true;
    if (p.tagName === 'WC-PRODUCT-TILE') break;
    const host = (p.getRootNode && p.getRootNode() instanceof ShadowRoot) ? p.getRootNode().host : null;
    p = p.parentElement || host;
  }
  return false;
}`;

// In-page helper: collect every "Add to cart" button (piercing shadow DOM)
// together with its product name and whether it's a marketplace listing.
const COLLECT_FN = `
${MARKETPLACE_FN}
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
          out.push({ name, marketplace: __isMarketplace(el) });
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

function chooseProduct(products, kws, exactName, strict, prep) {
  const ex = (exactName || "").toLowerCase();
  let bestPassing = null; // food-safe, score >= 0
  let bestAny = null; // highest keyword overlap regardless (best-effort fallback)
  let bestExact = null; // food-safe candidate whose name contains the exact preferred name

  // Never consider third-party marketplace ("Sold by …") listings — they are
  // not Woolworths-fulfilled and are consistently the wrong product. If every
  // result is a marketplace listing, we return null (reported as UNAVAILABLE)
  // rather than substitute one in.
  const listed = products.filter((p) => !p.marketplace).map((p) => p.name);
  if (!listed.length) return null;

  // A substitute may differ in brand or size but never in preparation state,
  // so results in a state the ingredient rules out are dropped before scoring.
  // When that leaves nothing, the item is reported as UNAVAILABLE rather than
  // filled with, say, cooked prawns in place of raw ones.
  const candidates = listed.filter((name) => !conflictsWithProfile(prep, name));
  if (!candidates.length) return null;

  for (const name of candidates) {
    const pl = name.toLowerCase();
    let hits = 0;
    for (const kw of kws) if (pl.includes(kw)) hits++;
    const isNonFood = NONFOOD_WORDS.some((w) => pl.includes(w));
    const isExact = !!ex && pl.includes(ex);
    let score = hits * 2 + profileAffinity(prep, name) * 3;
    if (isExact) score += 5;

    if (!bestAny || hits > bestAny.hits) bestAny = { name, hits, score };
    if (!isNonFood) {
      if (!bestPassing || score > bestPassing.score) bestPassing = { name, hits, score };
      if (isExact && (!bestExact || score > bestExact.score)) bestExact = { name, hits, score };
    }
  }

  if (strict) {
    // Only the exact preferred product is acceptable — never substitute.
    if (!bestExact) return null;
    return { ...bestExact, confidence: "good" };
  }

  if (bestPassing && bestPassing.score >= 0) {
    return { ...bestPassing, confidence: bestPassing.score >= 2 ? "good" : "low" };
  }
  // Nothing passed the food filter — best-effort pick, flagged.
  const fallback = bestAny || { name: candidates[0], hits: 0, score: 0 };
  return { ...fallback, confidence: "very-low" };
}

/**
 * Search Woolworths for `term`, choose the best product, and click Add to cart
 * (adds a single unit). Quantity is raised separately via setQuantity().
 *
 * Normally never silently skips: if results exist it adds the best available
 * match. There are two exceptions, both reported as `UNAVAILABLE` rather than
 * filled with something else: `strict` preferred items, for which only the
 * exact preferred product name is acceptable, and items whose preparation
 * state (raw, cooked, …) no result matches.
 */
export async function addToCart(page, { base, term, ingredientName, exactName, strict }) {
  await page.goto(SEARCH(base, term), { waitUntil: "domcontentloaded" });
  const count = await waitForResults(page);
  if (!count) return { status: "NO_RESULTS", term };

  const products = await page.evaluate(`(() => { ${COLLECT_FN}; return __collectAddButtons(); })()`);
  const kws = keywords(exactName || ingredientName || term);
  const marketplaceCount = products.filter((p) => p.marketplace).length;
  // The ingredient's own wording decides the preparation state; the preferred
  // product only fills in states the ingredient didn't mention.
  const prep = preparationProfile(ingredientName, exactName);
  const choice = chooseProduct(products, kws, exactName, strict, prep);

  if (!choice) {
    const stateFiltered = products.filter(
      (p) => !p.marketplace && conflictsWithProfile(prep, p.name)
    ).length;
    return {
      status: "UNAVAILABLE",
      term,
      exactName,
      strict: !!strict,
      marketplaceFiltered: marketplaceCount,
      stateFiltered,
      wantedStates: [...prep.states.values()],
    };
  }

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
    marketplaceFiltered: marketplaceCount,
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
${MARKETPLACE_FN}
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
          if (__isMarketplace(el)) continue; // skip third-party "Sold by" listings
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

/**
 * Find the most recent order's id from the "My Account → My Orders" list.
 *
 * The list page renders order rows that each link to
 * `/shop/myaccount/myorders/{id}`, newest first, so the first such link is the
 * latest order. Returns the id string, or null if none were found.
 */
export async function findLatestOrderId(page, { base }) {
  await page.goto(`${base}/shop/myaccount/myorders`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  return page.evaluate(() => {
    const seen = new Set();
    let found = null;
    (function walk(root, d) {
      if (d > 16 || found) return;
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot && !seen.has(el.shadowRoot)) { seen.add(el.shadowRoot); walk(el.shadowRoot, d + 1); }
        if (found) return;
        if (el.tagName === "A") {
          const m = (el.getAttribute("href") || "").match(/myorders\/(\d+)/);
          if (m) { found = m[1]; return; }
        }
      }
    })(document, 0);
    return found;
  });
}

/**
 * Read every product from a Woolworths order.
 *
 * The order-detail page (`/shop/myaccount/myorders/{id}`) loads its data from
 * an authenticated mobile API call (`.../orders/api/orders/{id}`). Rather than
 * scrape the DOM (which has no add-to-cart tiles here), we let the page make
 * that request and intercept the JSON response, then read each line item's
 * ordered product name from `OrderProducts[].Ordered.Name`.
 *
 * Returns `{ orderId, createdDate, total, count, products }` where `products`
 * is a de-duplicated (case-insensitive, order-preserving) array of names.
 */
export async function readOrderProducts(page, { base, orderId, timeoutMs = 25000 }) {
  if (!orderId) throw new Error("readOrderProducts: orderId is required.");

  const wanted = new RegExp(`/orders/api/orders/${orderId}(?:[/?]|$)`);
  let resolveBody;
  const bodyPromise = new Promise((resolve) => { resolveBody = resolve; });

  const onResponse = async (resp) => {
    try {
      if (!wanted.test(resp.url())) return;
      const text = await resp.text();
      if (text && text.length > 2) resolveBody(text);
    } catch {
      /* ignore individual response read errors */
    }
  };
  page.on("response", onResponse);

  try {
    await page.goto(`${base}/shop/myaccount/myorders/${orderId}`, {
      waitUntil: "domcontentloaded",
    });

    const body = await Promise.race([
      bodyPromise,
      new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    if (!body) {
      throw new Error(
        `Timed out waiting for order ${orderId} data. Is the order id correct and are you logged in?`
      );
    }

    const data = JSON.parse(body);
    const seen = new Set();
    const products = [];
    for (const entry of data.OrderProducts || []) {
      const ordered = entry.Ordered || {};
      const name = (ordered.Name || "").replace(/\s+/g, " ").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      products.push(name);
    }

    return {
      orderId: String(data.OrderId || orderId),
      createdDate: data.CreatedDate || null,
      total: data.Total ?? null,
      count: products.length,
      products,
    };
  } finally {
    page.off("response", onResponse);
  }
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
