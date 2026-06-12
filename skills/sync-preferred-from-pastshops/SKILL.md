---
name: sync-preferred-from-pastshops
description: Read every product from your Woolworths "My Lists → past shops → All Products (everything)" page across all pages, and add any new ones to preferred-items.txt (skipping products already listed). Use this to seed or refresh your preferred-items list from everything you've bought before. Requires a logged-in Woolworths session (the persistent browser profile is reused; log in once when prompted).
---

# Sync Preferred Items From Past Shops

Open the Woolworths **My Lists → past shops → All Products** ("everything") page, read every product across **all pages** (the list is paginated), and append any new product names to `preferred-items.txt`. Products already in the file are skipped. Nothing is ever removed.

## What it does

1. Launches the project's persistent Chrome profile (`PROFILE_DIR`) so your saved Woolworths login is reused. (Per the project's browser preference, this uses the project's own logged-in browser — **not** the Cursor/built-in browser.)
2. Ensures you are logged into Woolworths. If not, it opens a visible window and waits for you to log in, then continues.
3. Navigates `/shop/mylists/pastshops/everything?pageNumber=N`, reading the page count from the pager and walking every page.
4. On each page it scrolls to mount lazily-rendered tiles, then collects each product name from its "Add to cart" button (piercing shadow DOM).
5. De-duplicates the names (case-insensitive, order preserved) and writes a snapshot to `output/past-shop-items.json`.
6. Appends product names that aren't already in `preferred-items.txt`, leaving existing entries untouched.

## Usage

```bash
node skills/sync-preferred-from-pastshops/scripts/sync-preferred-from-pastshops.js
```

Or via the npm script:

```bash
npm run sync-prefs
```

Process only the first N products (useful for testing):

```bash
LIMIT=5 node skills/sync-preferred-from-pastshops/scripts/sync-preferred-from-pastshops.js
```

## Output

- **Updated file**: `preferred-items.txt` (new products appended).
- **Snapshot**: `output/past-shop-items.json`

```json
{
  "readAt": "2026-05-29T08:10:00.000Z",
  "pageCount": 4,
  "count": 117,
  "products": [
    "Gourmet Tomato each",
    "Fresh Broccoli each"
  ]
}
```

## Configuration

Reads from `.env` (see `.env.example`): `WOOLWORTHS_URL`, `PREFERRED_ITEMS_FILE`, `PROFILE_DIR`, `HEADLESS`, `BROWSER_CHANNEL`, `LIMIT`, `OUTPUT_DIR`.

## Notes

- First run must be **non-headless** (`HEADLESS=false`) so you can log into Woolworths. After that the saved session lets it run headless.
- Only purchasable tiles (those with an "Add to cart" button) are captured. Unavailable / out-of-stock items have no add button and are skipped — they aren't usable as preferred products anyway, so the captured count can be slightly lower than the "All Products (N)" heading.
- This skill only **adds** to `preferred-items.txt`; it never edits or removes existing entries. Everyday consumables — food, personal care, toiletries, and cleaning products — are all kept. Review and prune the list by hand only if you want to drop something you've bought before.
