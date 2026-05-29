/**
 * Best-effort quantity estimation.
 *
 * Turns a Clove line like "3 lb chuck beef", "6 roma tomatoes",
 * "1 × 14 ounce can coconut milk", "1 1⁄2 tsp garlic powder" into an integer
 * quantity to add to the Woolworths cart, given the chosen product's name.
 *
 * This is heuristic — every guess is reported so it can be reviewed.
 */

const VULGAR = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅕": 0.2, "⅛": 0.125 };

const MEASURE_UNITS = [
  "tbsp", "tablespoon", "tablespoons", "tsp", "teaspoon", "teaspoons",
  "cup", "cups", "pinch", "handful", "dash", "clove", "cloves", "sprig",
  "sprigs", "knob", "splash", "ml", "millilitre", "litre", "litres",
];
const WEIGHT_UNITS = ["g", "gs", "gram", "grams", "kg", "lb", "lbs", "pound", "pounds", "oz", "ounce", "ounces"];
const CONTAINER_UNITS = ["can", "cans", "tin", "tins", "jar", "jars", "pkt", "packet", "packets", "bottle", "bottles", "box", "boxes", "tub", "tubs"];

function fractionsToDecimal(str) {
  let s = str;
  // mixed: "1 1⁄2" or "1 1/2"
  s = s.replace(/(\d+)\s+(\d+)\s*[⁄/]\s*(\d+)/g, (_, w, n, d) => String(Number(w) + Number(n) / Number(d)));
  // standalone: "1⁄2" or "1/2"
  s = s.replace(/(\d+)\s*[⁄/]\s*(\d+)/g, (_, n, d) => String(Number(n) / Number(d)));
  // mixed with vulgar char: "1½"
  s = s.replace(/(\d+)\s*([½⅓⅔¼¾⅕⅛])/g, (_, w, v) => String(Number(w) + VULGAR[v]));
  // standalone vulgar: "½"
  s = s.replace(/([½⅓⅔¼¾⅕⅛])/g, (_, v) => String(VULGAR[v]));
  return s;
}

/** Extract the quantity prefix (everything before the ingredient name). */
function prefixOf(full, name) {
  if (!name) return full;
  const idx = full.toLowerCase().lastIndexOf(name.toLowerCase());
  return idx > 0 ? full.slice(0, idx).trim() : (idx === 0 ? "" : full);
}

export function parseCloveQuantity(full, name) {
  const prefix = prefixOf(full, name);
  const norm = fractionsToDecimal(prefix);
  const lower = norm.toLowerCase();

  // Pack pattern: "N × ..." / "N x ..."
  let packCount = null;
  const packMatch = lower.match(/(\d+(?:\.\d+)?)\s*[×x]\s/);
  if (packMatch) packCount = Number(packMatch[1]);

  // Leading number
  const numMatch = norm.match(/\d+(?:\.\d+)?/);
  const number = numMatch ? Number(numMatch[0]) : null;

  // Unit classification (first matching token wins)
  const tokens = lower.replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean);
  let unit = null;
  let category = number == null ? "none" : "count";
  for (const tk of tokens) {
    if (MEASURE_UNITS.includes(tk)) { unit = tk; category = "measure"; break; }
    if (CONTAINER_UNITS.includes(tk)) { unit = tk; category = "container"; break; }
    if (WEIGHT_UNITS.includes(tk)) { unit = tk; category = "weight"; break; }
  }

  return { prefix, number, unit, category, packCount };
}

function soldPerPiece(productName) {
  return /\beach\b/i.test(productName || "");
}

export function estimateQuantity(full, name, productName, maxQty = 12) {
  const q = parseCloveQuantity(full, name);
  let qty = 1;
  let reason;

  if (q.category === "container" && q.packCount) {
    qty = q.packCount;
    reason = `${q.packCount} × container`;
  } else if (q.category === "container" && q.number) {
    qty = q.number;
    reason = `${q.number} container(s)`;
  } else if (q.category === "measure") {
    qty = 1;
    reason = `cooking measure (${q.unit || "small amount"}) → 1 pack suffices`;
  } else if (q.category === "weight") {
    qty = 1;
    reason = `weight (${q.number ?? "?"} ${q.unit}) → 1 pack`;
  } else if (q.category === "count" && q.number) {
    if (soldPerPiece(productName)) {
      qty = Math.ceil(q.number);
      reason = `${q.number} × (sold per piece)`;
    } else {
      qty = 1;
      reason = `count ${q.number}, but product is a pack → 1`;
    }
  } else {
    qty = 1;
    reason = "no parseable amount → 1";
  }

  qty = Math.max(1, Math.min(maxQty, Math.round(qty)));
  return { qty, reason, parsed: q };
}
