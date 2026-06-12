---
name: get-anylist-items
description: Read the unchecked items from your AnyList list via the AnyList API (email/password from .env — no browser) and save them to a hand-off file. Use this alongside get-clove-items as a source step of the grocery pipeline, or on its own to capture what is currently on your AnyList. Requires ANYLIST_EMAIL and ANYLIST_PASSWORD in .env.
---

# Get AnyList Items

Read every **unchecked** item from your AnyList list and write them to `output/anylist-items.json` for the `map-preferred-items` skill to consume. This mirrors `get-clove-items` so the two sources are interchangeable — but unlike the browser skills, it talks to the **AnyList API directly** (no window, no scraping).

It uses the [`anylist`](https://github.com/kevdliu/anylist) package, an unofficial, reverse-engineered wrapper around AnyList's private API.

## What it does

1. Logs into AnyList with `ANYLIST_EMAIL` / `ANYLIST_PASSWORD`. The encrypted token cache (`.anylist_credentials`, git-ignored) means only the first run does a full login.
2. Fetches your lists and selects the one named by `ANYLIST_LIST_NAME` (default **Groceries**).
3. Reads each **unchecked** item as `{ full, name }` — `name` is the bare item name (used for matching), `full` includes the quantity when AnyList has one. Crossed-off (checked) items are skipped.
4. Writes the results to the hand-off file.

## Usage

```bash
node skills/get-anylist-items/scripts/get-anylist-items.js
```

Read a different list, and only the first N items (useful for testing):

```bash
ANYLIST_LIST_NAME="Costco" LIMIT=5 node skills/get-anylist-items/scripts/get-anylist-items.js
```

## Output

- **Hand-off file**: `output/anylist-items.json`

```json
{
  "extractedAt": "2026-06-12T06:48:00.000Z",
  "count": 2,
  "items": [
    { "full": "bananas", "name": "bananas" },
    { "full": "2 olive oil", "name": "olive oil" }
  ]
}
```

## Configuration

Reads from `.env` (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `ANYLIST_EMAIL` | _(required)_ | Your AnyList account email |
| `ANYLIST_PASSWORD` | _(required)_ | Your AnyList account password |
| `ANYLIST_LIST_NAME` | `Groceries` | Name of the list to read |
| `ANYLIST_CREDENTIALS_FILE` | `./.anylist_credentials` | Encrypted token cache (git-ignored) |
| `LIMIT` | _(unset)_ | Process only the first N items |
| `OUTPUT_DIR` | `./output` | Where the hand-off file is written |

## Notes

- This uses an **unofficial** API and may break if AnyList changes it.
- If credentials are missing, the skill errors out; within `run-grocery-pipeline` that error is caught and the AnyList source is simply skipped.
- If `ANYLIST_LIST_NAME` doesn't match a list, the error message lists the available list names.
