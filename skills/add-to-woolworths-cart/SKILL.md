---
name: add-to-woolworths-cart
description: Add a Woolworths shopping plan to your online Woolworths cart. Searches for each planned product, adds the best grocery match (food plus everyday consumables like personal care and cleaning), and estimates quantities from the original amounts. Use as the final step of the grocery pipeline, after map-preferred-items has produced output/shopping-plan.json. Requires a logged-in Woolworths session.
---

# Add To Woolworths Cart

Read the shopping plan and fill your Woolworths cart. For each item it searches Woolworths, picks the best **grocery** match (food plus everyday consumables — personal care, toiletries, health, and cleaning products), clicks "Add to cart", and raises the quantity to the amount estimated from the source line.

## What it does

1. Reads `output/shopping-plan.json` (produced by `map-preferred-items`).
2. Launches a persistent browser and ensures you are logged into Woolworths (prompts in a visible window if needed; session is reused afterwards).
3. For each plan entry:
   - Searches Woolworths for `term`.
   - Chooses the best match. `preferred` entries bias toward the exact product name; only non-consumable hard goods (kitchen tools/gadgets and hard kitchenware, electronics, clothing, toys, stationery, garden, pet gear) are filtered out — produce, food and drink, and everyday consumables (personal care, toiletries, cleaning) are all eligible.
   - **Third-party marketplace listings are always excluded.** Any result whose tile shows a "Sold by &lt;seller&gt;" label (Woolworths Everyday Market, fulfilled by a third-party seller) is never chosen. If every result for a term is a marketplace listing, the item is reported as `UNAVAILABLE` rather than adding a wrong product.
   - **`strict` preferred items** (marked `| strict` in `preferred-items.txt`) are the exception: only the exact preferred product name is acceptable. If it's not among the search results, the item is reported as `UNAVAILABLE` and nothing is added — no substitute is ever added for these.
   - Adds it to the cart, then estimates quantity (e.g. `6 roma tomatoes` → 6 when sold per piece; `1 tbsp sumac` → 1 jar) and bumps the quantity, capped by `MAX_QTY`.
4. Reads the trolley total and writes a results report.

Nothing is checked out — it only fills the cart for you to review and order.

## Usage

```bash
node skills/add-to-woolworths-cart/scripts/add-to-woolworths-cart.js
```

## Input

- `output/shopping-plan.json` — must exist first (run `map-preferred-items`).

## Output

- **Results report**: `output/results.json` — per-item status (`ADDED` / `NO_RESULTS` / `ADD_FAILED` / `UNAVAILABLE`), chosen product, confidence, desired vs reached quantity, plus a trolley summary.
- **Chat/console**: a summary with counts and any low-confidence matches to review.

## Configuration

Reads from `.env`: `WOOLWORTHS_URL`, `PROFILE_DIR`, `HEADLESS`, `BROWSER_CHANNEL`, `MAX_QTY`, `OUTPUT_DIR`.

## Notes

- First run must be **non-headless** (`HEADLESS=false`) so you can log into Woolworths once.
- Quantity estimation is best-effort and reported per item — review `output/results.json` and adjust in your cart as needed.
- Low-confidence and `very-low` matches are flagged so you can double-check the chosen product.
- `UNAVAILABLE` items are listed separately in the summary — either a `strict` preferred product wasn't found, or every result was a third-party "Sold by" marketplace listing. Nothing is substituted in these cases; the summary notes how many marketplace listings were skipped.
