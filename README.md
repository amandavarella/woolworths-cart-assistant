# Woolworths Cart Assistant

Reads your grocery ingredients from [Clove](https://clove.kitchen/groceries), maps each one to **your preferred Woolworths product**, and adds them to your Woolworths online cart — automatically.

## How it works

1. **Extract (Clove):** opens your Clove groceries list and reads every **unchecked** ingredient (already-ticked items are skipped).
2. **Map (local):** matches each ingredient against your flat preferred-items list by keyword overlap. If `Milk` is on Clove and your list has `a2 Milk Full Cream Milk 3L`, that's what gets bought.
3. **Add (Woolworths):** searches Woolworths for each resolved product and adds it to your cart. Items with no preferred match fall back to a generic, **food-only** search (kitchenware/clothing/toys/etc. are filtered out). It does its best to estimate the **quantity** from the Clove amount (e.g. `6 roma tomatoes` → 6 when sold per piece; `1 tbsp sumac` → 1 jar).
4. **Report:** prints a summary and writes `results.json`, flagging any low-confidence matches for you to review.

The browser runs each phase sequentially — Clove is read first, then the same window is used for Woolworths. Only one tab is needed.

## Requirements

- Node.js 20+
- Google Chrome installed (the default; or set `BROWSER_CHANNEL=""` to use Playwright's bundled Chromium)

## Setup

```bash
npm install
cp .env.example .env       # adjust if you like; defaults work out of the box
```

## First run — log in once

The first run opens a visible browser. The app checks whether you're already
logged into Clove and Woolworths; if not, it asks you to log in **in that
window**, then press Enter. Your session is saved in a dedicated profile
(`PROFILE_DIR`), so future runs are automatic.

```bash
npm run login     # opens the browser, verifies or prompts for both logins, then exits
```

After that, normal runs can be headless (set `HEADLESS=true` in `.env`).

## Usage

```bash
npm start
```

Output example:

```
[1/8] baby potatoes (preferred) → ADDED: Woolworths White Washed Baby Potatoes Bag 1kg ×1 (good; ...)
[2/8] roma tomatoes (fallback)  → ADDED: Woolworths Roma Tomato Punnet 480g ×1 (good; ...)
...
========== SUMMARY ==========
Added: 8   Cart now: 8 items, $34.20
```

## Your preferred items list

Edit `preferred-items.txt` — one Woolworths product name per line. Lines
starting with `#` are ignored. These are the exact products bought whenever a
Clove ingredient matches them by keyword.

```
a2 Milk Full Cream Milk 3L
Cobram Estate Classic Extra Virgin Olive Oil
Woolworths Fresh Herb Coriander Bunch each
```

## Configuration (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `PROFILE_DIR` | `./.browser-profile` | Where the logged-in browser session is stored |
| `HEADLESS` | `false` | Run without a visible window (keep `false` for first login) |
| `BROWSER_CHANNEL` | `chrome` | `chrome` uses installed Chrome; `""` uses bundled Chromium |
| `CLOVE_URL` | `https://clove.kitchen/groceries` | Clove groceries page |
| `WOOLWORTHS_URL` | `https://www.woolworths.com.au` | Woolworths base URL |
| `PREFERRED_ITEMS_FILE` | `./preferred-items.txt` | Your preferred products |
| `MAX_QTY` | `12` | Safety cap on quantity per product |

## Notes

- Nothing is checked out — the app only fills your cart for you to review and order.
- Quantity estimation is best-effort and printed per item; tweak in your cart as needed.
- The browser profile holds your login — it's git-ignored; never commit it.
```
