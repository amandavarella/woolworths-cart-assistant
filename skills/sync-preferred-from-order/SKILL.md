---
name: sync-preferred-from-order
description: Read every product from a single Woolworths order — your latest order by default, or a specific one via ORDER_ID / ORDER_URL — and add any new ones to preferred-items.txt (skipping products already listed). Use this to refresh your preferred-items list from a recent shop. Requires a logged-in Woolworths session (the persistent browser profile is reused; log in once when prompted).
---

# Sync Preferred Items From an Order

Open a Woolworths order, read every product it contained, and append any new product names to `preferred-items.txt`. Products already in the file are skipped. Nothing is ever removed.

This is the per-order counterpart to `sync-preferred-from-pastshops`: instead of your whole purchase history, it pulls from one order (handy right after a shop you liked).

## What it does

1. Launches the project's persistent Chrome profile (`PROFILE_DIR`) so your saved Woolworths login is reused. (Per the project's browser preference, this uses the project's own logged-in browser — **not** the Cursor/built-in browser.)
2. Ensures you are logged into Woolworths. If not, it opens a visible window and waits for you to log in, then continues.
3. Picks the order to read:
   - If `ORDER_ID` or `ORDER_URL` is set, uses that order.
   - Otherwise opens **My Account → My Orders** and picks your **latest** order.
4. Opens the order-detail page and intercepts the order API response (`.../orders/api/orders/{id}`), reading each line item's ordered product name (`OrderProducts[].Ordered.Name`).
5. De-duplicates the names (case-insensitive, order preserved) and writes a snapshot to `output/order-items.json`.
6. Appends product names that aren't already in `preferred-items.txt`, leaving existing entries untouched.

## Usage

Latest order:

```bash
node skills/sync-preferred-from-order/scripts/sync-preferred-from-order.js
```

Or via the npm script:

```bash
npm run sync-order
```

A specific order (either form works):

```bash
ORDER_ID=310959361 npm run sync-order
ORDER_URL="https://www.woolworths.com.au/shop/myaccount/myorders/310959361" npm run sync-order
```

Process only the first N products (useful for testing):

```bash
LIMIT=5 npm run sync-order
```

## Output

- **Updated file**: `preferred-items.txt` (new products appended).
- **Snapshot**: `output/order-items.json`

```json
{
  "readAt": "2026-06-12T01:20:00.000Z",
  "orderId": "310959361",
  "createdDate": "2026-06-05T00:00:00",
  "total": 142.5,
  "count": 23,
  "products": [
    "Edgell Sweet Corn Kernels Cut From the Cob",
    "Woolworths Roma Tomato Punnet 480g"
  ]
}
```

## Configuration

Reads from `.env` (see `.env.example`): `WOOLWORTHS_URL`, `ORDER_ID` / `ORDER_URL`, `PREFERRED_ITEMS_FILE`, `PROFILE_DIR`, `HEADLESS`, `BROWSER_CHANNEL`, `LIMIT`, `OUTPUT_DIR`.

## Notes

- First run must be **non-headless** (`HEADLESS=false`) so you can log into Woolworths. After that the saved session lets it run headless.
- Product names come from what you **ordered** (`Ordered.Name`), not substitutions made at pick time.
- This skill only **adds** to `preferred-items.txt`; it never edits or removes existing entries. Everyday consumables — food, personal care, toiletries, and cleaning products — are all kept. Review and prune the list by hand only if you want to drop something you happened to order.
