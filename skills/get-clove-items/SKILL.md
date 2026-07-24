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
3. **Non-English ingredients are auto-translated to English** (see below).
4. Results are written to the hand-off file.

## Automatic translation

Woolworths' catalogue and this project's preferred-item matching are both
English-only, so an ingredient pasted in another language (e.g. Portuguese)
would otherwise be searched for literally and match unrelated products.
Before the hand-off file is written, every ingredient is auto-detected and
any non-English ones are translated to English in a single batched request
(via [`google-translate-api-x`](https://www.npmjs.com/package/google-translate-api-x),
a free, unofficial Google Translate client — no API key needed). English
ingredients pass through untouched.

- A translated item keeps its original text too: `{ full, name, translated: true, originalFull, originalName }`.
- Only the trailing amount-stripped `name` is translated; the leading
  amount/unit in `full` (e.g. `"2 "`) is preserved, so quantity estimation
  still works on the translated line.
- Set `AUTO_TRANSLATE=false` in `.env` to disable this step (e.g. if you're
  offline or the translation endpoint is unavailable) — non-English
  ingredients then flow through unchanged, same as before this feature.
- **Fails safe**: if the translation request errors (offline, rate-limited,
  endpoint change), a warning is logged and the original ingredients are used
  as-is — a flaky translation call never breaks the pipeline.
- This is best-effort machine translation, not a curated glossary — it can
  produce imperfect results for local terminology (e.g. Portuguese
  "pimentão" → "pepper" rather than the Australian "capsicum"). It still
  reliably beats matching against the untranslated foreign text, which
  Woolworths' search and this project's matching cannot use at all.
- Applies in both paste and web mode, since it runs after ingredients are
  parsed/extracted either way.

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
    { "full": "6 roma tomatoes", "name": "roma tomatoes" },
    {
      "full": "1 coconut milk",
      "name": "coconut milk",
      "translated": true,
      "originalFull": "1 vidro leite de coco",
      "originalName": "vidro leite de coco"
    }
  ]
}
```

## Configuration

Reads from `.env` (see `.env.example`): `CLOVE_MODE`, `CLOVE_LIST_FILE`, `CLOVE_URL`, `PROFILE_DIR`, `HEADLESS`, `BROWSER_CHANNEL`, `AUTO_TRANSLATE`, `LIMIT`, `OUTPUT_DIR`.

## Notes

- **Paste mode** is the default because the Clove website is no longer live. If the list file is empty or missing, the hand-off file is written with `count: 0` (and a template is created) so the pipeline can stop early or continue with other sources.
- **Web mode** (`CLOVE_MODE=web`) keeps the old scraper. Its first run must be **non-headless** (`HEADLESS=false`) so you can log into Clove; after that the saved session lets it run headless.
