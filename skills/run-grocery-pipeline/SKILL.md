---
name: run-grocery-pipeline
description: Run the entire grocery workflow end to end — read Clove ingredients, map them to your preferred Woolworths products, and add them to your Woolworths cart. This is the orchestrator; use it when you just want the whole job done in one go. It chains get-clove-items → map-preferred-items → add-to-woolworths-cart.
---

# Run Grocery Pipeline

The orchestrator. Runs all three skills in order, passing data between them via the hand-off files in `output/`:

1. **`get-clove-items`** → `output/clove-items.json`
2. **`map-preferred-items`** → `output/shopping-plan.json`
3. **`add-to-woolworths-cart`** → `output/results.json`

If Clove has nothing unchecked, the pipeline stops after step 1.

## How an agent should run this

Either run the orchestrator script directly (recommended), or execute each skill in sequence by following each skill's own `SKILL.md`:

```bash
node skills/run-grocery-pipeline/scripts/run-grocery-pipeline.js
```

Running the steps individually (equivalent):

```bash
node skills/get-clove-items/scripts/get-clove-items.js
node skills/map-preferred-items/scripts/map-preferred-items.js
node skills/add-to-woolworths-cart/scripts/add-to-woolworths-cart.js
```

Running them individually is useful when you want to inspect `output/shopping-plan.json` before anything touches your Woolworths cart.

## First run / login

The two browser steps (`get-clove-items`, `add-to-woolworths-cart`) each ensure you are logged in, prompting in a visible window if needed. So the **first** run must be non-headless (`HEADLESS=false`). The login session is saved to `PROFILE_DIR` and reused, so later runs can be headless.

## Output

- `output/clove-items.json` — ingredients read from Clove
- `output/shopping-plan.json` — ingredients mapped to preferred products
- `output/results.json` — what was added to the cart, with a trolley summary
- **Console**: a per-step summary, ending with the cart total and any low-confidence matches to review.

## Configuration

All steps share the same `.env` (see `.env.example`). Set `LIMIT` to process only the first N ingredients while testing.
