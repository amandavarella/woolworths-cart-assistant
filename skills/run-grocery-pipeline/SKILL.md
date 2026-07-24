---
name: run-grocery-pipeline
description: Run the entire grocery workflow end to end — read ingredients from Clove and AnyList, map them to your preferred Woolworths products, and add them to your Woolworths cart. This is the orchestrator; use it when you just want the whole job done in one go. It chains get-clove-items + get-anylist-items → map-preferred-items → add-to-woolworths-cart.
---

# Run Grocery Pipeline

The orchestrator. Runs all source + processing skills in order, passing data between them via the hand-off files in `output/`:

1. **`get-clove-items`** → `output/clove-items.json`
2. **`get-anylist-items`** → `output/anylist-items.json`
3. **`map-preferred-items`** (merges both sources) → `output/shopping-plan.json`
4. **`add-to-woolworths-cart`** → `output/results.json`

Both Clove and AnyList are read and matched against your preferred products before anything touches the cart. AnyList is read via its API (credentials in `.env`), not a browser. The AnyList step is best-effort: if it fails (e.g. missing credentials), the pipeline logs a warning and continues with the Clove items. If **both** sources are empty, the pipeline stops before mapping.

Any ingredient/item names (from either source) are automatically translated and localized to Australian English as part of the source steps, before matching ever sees them: `portuguese → Australian English` and `US English → Australian English` — see [`get-clove-items`](../get-clove-items/SKILL.md#automatic-translation). Disable the translation half with `AUTO_TRANSLATE=false` (the Australian-English glossary half always runs regardless).

## How an agent should run this

Either run the orchestrator script directly (recommended), or execute each skill in sequence by following each skill's own `SKILL.md`:

```bash
node skills/run-grocery-pipeline/scripts/run-grocery-pipeline.js
```

Running the steps individually (equivalent):

```bash
node skills/get-clove-items/scripts/get-clove-items.js
node skills/get-anylist-items/scripts/get-anylist-items.js
node skills/map-preferred-items/scripts/map-preferred-items.js
node skills/add-to-woolworths-cart/scripts/add-to-woolworths-cart.js
```

Running them individually is useful when you want to inspect `output/shopping-plan.json` before anything touches your Woolworths cart.

## First run / login

The two browser steps (`get-clove-items`, `add-to-woolworths-cart`) each ensure you are logged in, prompting in a visible window if needed. So the **first** run must be non-headless (`HEADLESS=false`). The login session is saved to `PROFILE_DIR` and reused, so later runs can be headless. Log into Clove and Woolworths once each.

`get-anylist-items` is **not** a browser step — it reads the AnyList API using `ANYLIST_EMAIL` / `ANYLIST_PASSWORD` from `.env`. Fill those in to enable the AnyList source (or leave them blank to skip it).

## Output

- `output/clove-items.json` — ingredients read from Clove
- `output/anylist-items.json` — items read from AnyList
- `output/shopping-plan.json` — merged ingredients mapped to preferred products
- `output/results.json` — what was added to the cart, with a trolley summary
- **Console**: a per-step summary, ending with the cart total and any low-confidence matches to review.

## Configuration

All steps share the same `.env` (see `.env.example`). Set `LIMIT` to process only the first N ingredients while testing.
