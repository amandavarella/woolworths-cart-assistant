---
name: map-preferred-items
description: Transform raw grocery items from one or more sources into a single Woolworths shopping plan by matching each one against your preferred-items list. Pure local logic, no browser required. Use as the mapping step of the grocery pipeline, after the source skills (e.g. get-clove-items, get-anylist-items) have produced their hand-off files.
---

# Map Preferred Items

Read every available item-source hand-off file (`clove-items.json` and/or `anylist-items.json`) and turn each ingredient into a concrete shopping-plan entry, mapping to **your preferred Woolworths product** where possible. The sources are merged and de-duplicated into a single `output/shopping-plan.json` for the `add-to-woolworths-cart` skill.

## What it does

1. Reads whichever item sources exist:
   - `output/clove-items.json` (produced by `get-clove-items`)
   - `output/anylist-items.json` (produced by `get-anylist-items`)
2. Loads your preferred products from `preferred-items.txt` (one product per line; `#` comments ignored). A line may add extras after `|`: a comma-separated list of alias keywords (e.g. common misspellings) and/or the flag `strict` — see that file's header comment for the syntax.
3. For each ingredient, runs head-noun keyword matching against the preferred list (matching the product name or any of its aliases):
   - **`preferred`** mode — a confident match was found; the exact preferred product name becomes the search term. If the line was marked `strict`, the plan entry carries `strict: true`.
   - **`fallback`** mode — no match; the raw ingredient name is used for a generic Woolworths search later (food plus everyday consumables like personal care and cleaning; only non-grocery hard goods are filtered out).
4. Merges both sources and **de-duplicates** by resolved search target, so the same product appearing on both lists is only added once. Each plan entry records which `source` it came from.
5. Writes the plan.

This step is **deterministic and offline** — safe to re-run and inspect without touching any website.

## Usage

```bash
node skills/map-preferred-items/scripts/map-preferred-items.js
```

## Input

At least one of (run the matching source skill first):

- `output/clove-items.json` — from `get-clove-items`
- `output/anylist-items.json` — from `get-anylist-items`

## Output

- **Hand-off file**: `output/shopping-plan.json`

```json
{
  "mappedAt": "2026-06-12T06:49:00.000Z",
  "sources": ["clove", "anylist"],
  "count": 2,
  "plan": [
    {
      "source": "clove",
      "ingredient": "1 lb baby potatoes",
      "name": "baby potatoes",
      "mode": "fallback",
      "term": "baby potatoes",
      "exactName": null,
      "strict": false
    },
    {
      "source": "anylist",
      "ingredient": "olive oil",
      "name": "olive oil",
      "mode": "preferred",
      "term": "Cobram Estate Classic Extra Virgin Olive Oil",
      "exactName": "Cobram Estate Classic Extra Virgin Olive Oil",
      "strict": false
    }
  ]
}
```

## Configuration

Reads from `.env`: `PREFERRED_ITEMS_FILE`, `OUTPUT_DIR`.

## Notes

- Edit `preferred-items.txt` to control exactly which Woolworths product is bought for a given ingredient.
- Matching requires the ingredient's head noun (its last meaningful word) to appear in the preferred product or one of its aliases, which avoids spurious matches on generic descriptors like "baby" or "fresh".
- Add `| alias1, alias2` after a product name to route extra keywords (e.g. misspellings) to it; add `| strict` to require the exact product and report `UNAVAILABLE` (in `add-to-woolworths-cart`) rather than substitute a different one.
- Sources are merged in priority order (Clove first, then AnyList); the first source to resolve a given product wins when de-duplicating.
