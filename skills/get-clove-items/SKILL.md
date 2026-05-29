---
name: get-clove-items
description: Read the unchecked grocery ingredients from your Clove groceries list and save them to a hand-off file. Use this as the first step of the grocery pipeline, or on its own when you just want to capture what is currently on your Clove list. Requires a logged-in Clove session (the browser profile is reused between runs; log in once when prompted).
---

# Get Clove Items

Open Clove, scrape every **unchecked** ingredient from the groceries list, and write them to `output/clove-items.json` for the next skill (`map-preferred-items`) to consume.

## What it does

1. Launches a persistent browser (profile from `PROFILE_DIR`, so the login is reused).
2. Ensures you are logged into Clove. If not, it opens a visible window and waits for you to log in, then continues.
3. Scrolls the groceries page until the item list stabilises (handles lazy rendering).
4. Extracts each unchecked ingredient as `{ full, name }` where `full` is the whole line (e.g. `1 lb baby potatoes`) and `name` is just the bolded ingredient (e.g. `baby potatoes`). Already-ticked items and section headers are skipped.
5. Writes the results to the hand-off file.

## Usage

```bash
node skills/get-clove-items/scripts/get-clove-items.js
```

Process only the first N ingredients (useful for testing):

```bash
LIMIT=5 node skills/get-clove-items/scripts/get-clove-items.js
```

## Output

- **Hand-off file**: `output/clove-items.json`

```json
{
  "extractedAt": "2026-05-29T06:48:00.000Z",
  "count": 8,
  "items": [
    { "full": "1 lb baby potatoes", "name": "baby potatoes" },
    { "full": "6 roma tomatoes", "name": "roma tomatoes" }
  ]
}
```

## Configuration

Reads from `.env` (see `.env.example`): `CLOVE_URL`, `PROFILE_DIR`, `HEADLESS`, `BROWSER_CHANNEL`, `LIMIT`, `OUTPUT_DIR`.

## Notes

- First run must be **non-headless** (`HEADLESS=false`) so you can log into Clove. After that the saved session lets it run headless.
- If nothing is unchecked on Clove, the file is written with `count: 0` and the pipeline can stop early.
