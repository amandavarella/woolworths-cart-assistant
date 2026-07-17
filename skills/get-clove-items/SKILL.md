---
name: get-clove-items
description: Collect your Clove grocery ingredients and save them to a hand-off file. By default (CLOVE_MODE=paste) it parses a list you paste into a text file, because the Clove website is no longer live. Set CLOVE_MODE=web to use the legacy browser scraper. Use this as the first step of the grocery pipeline, or on its own to capture the current Clove list.
---

# Get Clove Items

Collect every Clove ingredient and write them to `output/clove-items.json` for the next skill (`map-preferred-items`) to consume.

There are two modes, chosen by `CLOVE_MODE`:

- **`paste` (default)**: the Clove website is no longer live, so you paste your
  Clove groceries list into a plain text file (`CLOVE_LIST_FILE`, default
  `./clove-list.txt`) and this skill parses it. No browser, no login.
- **`web` (legacy)**: drive the still-present browser scraper against
  `CLOVE_URL`. Requires a logged-in Clove session.

## Paste mode (default)

1. Paste your Clove list into `clove-list.txt`, one ingredient per line, e.g.:

```
1 lb baby potatoes
6 roma tomatoes
1 x 14 ounce can coconut milk
```

   Blank lines and lines starting with `#` are ignored. If the file doesn't
   exist yet, the first run creates a template for you to fill in.
2. Each line is parsed into `{ full, name }` where `full` is the whole line and
   `name` is the ingredient with any leading amount/unit stripped (e.g.
   `baby potatoes`, `coconut milk`).
3. Results are written to the hand-off file.

## Web mode (legacy)

1. Launches a persistent browser (profile from `PROFILE_DIR`, so the login is reused).
2. Ensures you are logged into Clove. If not, it opens a visible window and waits for you to log in, then continues.
3. Scrolls the groceries page until the item list stabilises (handles lazy rendering).
4. Extracts each unchecked ingredient as `{ full, name }`, skipping already-ticked items and section headers.
5. Writes the results to the hand-off file.

## Usage

Default (paste) mode:

```bash
node skills/get-clove-items/scripts/get-clove-items.js
```

Legacy web mode:

```bash
CLOVE_MODE=web node skills/get-clove-items/scripts/get-clove-items.js
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

Reads from `.env` (see `.env.example`): `CLOVE_MODE`, `CLOVE_LIST_FILE`, `CLOVE_URL`, `PROFILE_DIR`, `HEADLESS`, `BROWSER_CHANNEL`, `LIMIT`, `OUTPUT_DIR`.

## Notes

- **Paste mode** is the default because the Clove website is no longer live. If the list file is empty or missing, the hand-off file is written with `count: 0` (and a template is created) so the pipeline can stop early or continue with other sources.
- **Web mode** (`CLOVE_MODE=web`) keeps the old scraper. Its first run must be **non-headless** (`HEADLESS=false`) so you can log into Clove; after that the saved session lets it run headless.
