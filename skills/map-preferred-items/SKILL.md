---
name: map-preferred-items
description: Transform raw Clove ingredients into a Woolworths shopping plan by matching each one against your preferred-items list. Pure local logic, no browser required. Use as the second step of the grocery pipeline, after get-clove-items has produced output/clove-items.json.
---

# Map Preferred Items

Read the Clove ingredients hand-off file and turn each ingredient into a concrete shopping-plan entry, mapping to **your preferred Woolworths product** where possible. Writes `output/shopping-plan.json` for the `add-to-woolworths-cart` skill.

## What it does

1. Reads `output/clove-items.json` (produced by `get-clove-items`).
2. Loads your preferred products from `preferred-items.txt` (one product per line; `#` comments ignored).
3. For each ingredient, runs head-noun keyword matching against the preferred list:
   - **`preferred`** mode — a confident match was found; the exact preferred product name becomes the search term.
   - **`fallback`** mode — no match; the raw ingredient name is used for a generic (food-only) Woolworths search later.
4. Writes the plan.

This step is **deterministic and offline** — safe to re-run and inspect without touching any website.

## Usage

```bash
node skills/map-preferred-items/scripts/map-preferred-items.js
```

## Input

- `output/clove-items.json` — must exist first (run `get-clove-items`).

## Output

- **Hand-off file**: `output/shopping-plan.json`

```json
{
  "mappedAt": "2026-05-29T06:49:00.000Z",
  "count": 2,
  "plan": [
    {
      "ingredient": "1 lb baby potatoes",
      "name": "baby potatoes",
      "mode": "fallback",
      "term": "baby potatoes",
      "exactName": null
    },
    {
      "ingredient": "1 tbsp olive oil",
      "name": "olive oil",
      "mode": "preferred",
      "term": "Cobram Estate Classic Extra Virgin Olive Oil",
      "exactName": "Cobram Estate Classic Extra Virgin Olive Oil"
    }
  ]
}
```

## Configuration

Reads from `.env`: `PREFERRED_ITEMS_FILE`, `OUTPUT_DIR`.

## Notes

- Edit `preferred-items.txt` to control exactly which Woolworths product is bought for a given ingredient.
- Matching requires the ingredient's head noun (its last meaningful word) to appear in the preferred product, which avoids spurious matches on generic descriptors like "baby" or "fresh".
