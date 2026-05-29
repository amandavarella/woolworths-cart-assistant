# Woolworths Cart Assistant

Reads your grocery ingredients from [Clove](https://clove.kitchen/groceries), maps each one to **your preferred Woolworths product**, and adds them to your Woolworths online cart — automatically.

This project is **agent-driven**: the work is split into small, composable *skills* that an AI agent (or you, from the command line) can run individually or chain end to end. See [`AGENTS.md`](./AGENTS.md) for the agent guidelines (`CLAUDE.md` is a symlink to it).

## The skills

Each skill lives in `skills/<name>/` with a `SKILL.md` (instructions) and a `scripts/` entry point. Skills hand off data to each other through JSON files in `output/`.

| Skill | What it does | Reads | Writes |
|-------|--------------|-------|--------|
| [`get-clove-items`](./skills/get-clove-items/SKILL.md) | Reads unchecked ingredients from Clove | Clove page | `output/clove-items.json` |
| [`map-preferred-items`](./skills/map-preferred-items/SKILL.md) | Maps ingredients → preferred Woolworths products | `clove-items.json` + `preferred-items.txt` | `output/shopping-plan.json` |
| [`add-to-woolworths-cart`](./skills/add-to-woolworths-cart/SKILL.md) | Adds the plan to your Woolworths cart | `shopping-plan.json` | `output/results.json` |
| [`run-grocery-pipeline`](./skills/run-grocery-pipeline/SKILL.md) | **Orchestrator** — runs all three in order | — | end-to-end |

The two browser skills each open their own window and reuse a saved login profile, so the pure-logic mapping step in the middle never touches a website.

## Requirements

- Node.js 20+
- Google Chrome installed (the default; or set `BROWSER_CHANNEL=""` to use Playwright's bundled Chromium)

## Setup

```bash
npm install
cp .env.example .env       # adjust if you like; defaults work out of the box
```

## First run — log in once

The browser skills check whether you're logged into Clove / Woolworths; if not,
they open a visible window, wait for you to log in, then continue. Your session
is saved in a dedicated profile (`PROFILE_DIR`), so future runs are automatic.

Run the whole pipeline once with a visible browser (`HEADLESS=false`, the
default) to log in:

```bash
npm run shop
```

After that, set `HEADLESS=true` in `.env` for unattended runs.

## Usage

Run the entire workflow (Clove → preferred items → Woolworths):

```bash
npm run shop
```

Or run a single stage (e.g. to inspect the plan before anything touches your cart):

```bash
npm run clove   # get-clove-items        → output/clove-items.json
npm run map     # map-preferred-items    → output/shopping-plan.json
npm run cart    # add-to-woolworths-cart → output/results.json
```

You can also invoke any skill's script directly, e.g.:

```bash
node skills/run-grocery-pipeline/scripts/run-grocery-pipeline.js
```

Output example:

```
━━━ Step 3/3: add-to-woolworths-cart ━━━
[1/8] baby potatoes (fallback)  → ADDED: Woolworths White Washed Baby Potatoes Bag 1kg ×1 (good; ...)
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
| `OUTPUT_DIR` | `./output` | Where skills write hand-off files and reports |
| `LIMIT` | _(unset)_ | Process only the first N Clove ingredients (testing) |

## Project layout

```
AGENTS.md                  # agent guidelines (CLAUDE.md is a symlink to this)
CLAUDE.md -> AGENTS.md
preferred-items.txt        # your preferred Woolworths products
src/                       # shared logic imported by the skill scripts
  config.js  browser.js  clove.js  preferences.js  quantity.js  woolworths.js
skills/
  get-clove-items/         SKILL.md + scripts/
  map-preferred-items/     SKILL.md + scripts/
  add-to-woolworths-cart/  SKILL.md + scripts/
  run-grocery-pipeline/    SKILL.md + scripts/   (orchestrator)
output/                    # git-ignored hand-off files & reports
```

## Notes

- Nothing is checked out — the app only fills your cart for you to review and order.
- Quantity estimation is best-effort and printed per item; tweak in your cart as needed.
- The browser profile holds your login — it's git-ignored; never commit it.
