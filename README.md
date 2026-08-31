# Woolworths Cart Assistant

Reads your grocery ingredients from Clove (pasted list) and [AnyList](https://www.anylist.com/web), maps each one to **your preferred Woolworths product**, and adds them to your Woolworths online cart, automatically.

> **Clove is now paste-based.** The Clove website is no longer live, so by
> default (`CLOVE_MODE=paste`) you paste your Clove groceries into a text file
> (`clove-list.txt`) and the assistant reads it from there. The old browser
> scraper is kept and can be re-enabled with `CLOVE_MODE=web`.

This project is **agent-driven**: the work is split into small, composable *skills* that an AI agent (or you, from the command line) can run individually or chain end to end. See [`AGENTS.md`](./AGENTS.md) for the agent guidelines (`CLAUDE.md` is a symlink to it).

## The skills

Each skill lives in `skills/<name>/` with a `SKILL.md` (instructions) and a `scripts/` entry point. Skills hand off data to each other through JSON files in `output/`.

| Skill | What it does | Reads | Writes |
|-------|--------------|-------|--------|
| [`get-clove-items`](./skills/get-clove-items/SKILL.md) | Reads your Clove ingredients (pasted list by default; `CLOVE_MODE=web` for the legacy scraper) | `clove-list.txt` (or Clove page) | `output/clove-items.json` |
| [`get-anylist-items`](./skills/get-anylist-items/SKILL.md) | Reads unchecked items from AnyList (via API, no browser) | AnyList API | `output/anylist-items.json` |
| [`map-preferred-items`](./skills/map-preferred-items/SKILL.md) | Maps ingredients → preferred Woolworths products (merges Clove + AnyList) | `clove-items.json` + `anylist-items.json` + `preferred-items.txt` | `output/shopping-plan.json` |
| [`add-to-woolworths-cart`](./skills/add-to-woolworths-cart/SKILL.md) | Adds the plan to your Woolworths cart | `shopping-plan.json` | `output/results.json` |
| [`run-grocery-pipeline`](./skills/run-grocery-pipeline/SKILL.md) | **Orchestrator** — runs all of the above in order | — | end-to-end |
| [`sync-preferred-from-pastshops`](./skills/sync-preferred-from-pastshops/SKILL.md) | Reads your Woolworths past-shops list and adds new products to your preferred items | past shops page | `preferred-items.txt` (+ `output/past-shop-items.json`) |
| [`sync-preferred-from-order`](./skills/sync-preferred-from-order/SKILL.md) | Reads a single Woolworths order (latest or a specific one) and adds new products to your preferred items | order detail API | `preferred-items.txt` (+ `output/order-items.json`) |

The browser skills each open their own window and reuse a saved login profile, so the pure-logic mapping step in the middle never touches a website.

## Requirements

- Node.js 21+
- Google Chrome installed (the default; or set `BROWSER_CHANNEL=""` to use Playwright's bundled Chromium)

## Setup

```bash
npm install
cp .env.example .env                         # adjust if you like; defaults work out of the box
cp preferred-items.example.txt preferred-items.txt   # your local preferred products (git-ignored)
```

## Your Clove list (paste mode)

Paste your Clove groceries into `clove-list.txt`, one ingredient per line:

```
1 lb baby potatoes
6 roma tomatoes
1 x 14 ounce can coconut milk
```

Blank lines and lines starting with `#` are ignored. If the file doesn't exist
yet, the first run creates a template for you to fill in. The leading
amount/unit is stripped automatically to match your preferred products (e.g.
`baby potatoes`, `coconut milk`). This file is git-ignored.

**Ingredients are translated/localized to Australian English automatically.**
Pastes may be in Portuguese or American English; both are translated when
found. The path is `portuguese → Australian English` and `US English →
Australian English`. A curated glossary runs first for known phrases (e.g.
`cheiro-verde` → parsley, `butternut squash` → butternut pumpkin), then any
remaining non-English lines are machine-translated before matching or search
ever sees them — Woolworths' catalogue and this project's preferred-item
matching are both English-only, so an untranslated ingredient would otherwise
search literally and match unrelated products. Every ingredient (translated
or already English) is then run through the Australian-English glossary again
so US/generic grocery terms map to the ones Woolworths actually uses (e.g.
"cilantro" → "coriander", "bell pepper" → "capsicum", "ground beef" →
"beef mince"). Machine translation uses a free, unofficial Google Translate
client (no API key) in a single batched request per run and fails safe (falls
back to the original text, or a glossary hit) if unreachable; the glossary
always runs regardless, since it needs no network. Turn off just the
machine-translation step with `AUTO_TRANSLATE=false`. See
[`get-clove-items`](./skills/get-clove-items/SKILL.md#automatic-translation)
for details. The same applies to AnyList item names.

## First run — log in once

The Woolworths skills check whether you're logged in; if not, they open a
visible window and **poll until you finish logging in** (no need to press
Enter in the terminal — important when an agent runs the pipeline). Your
session is saved in a dedicated profile (`PROFILE_DIR`), so future runs are
automatic.

Run the whole pipeline once with a visible browser (`HEADLESS=false`, the
default) to log into Woolworths:

```bash
npm run shop
```

After that, set `HEADLESS=true` in `.env` for unattended runs.

> If you re-enable the legacy Clove scraper with `CLOVE_MODE=web`, that step
> will also prompt you to log into Clove on its first run.

> **AnyList** is read through its (unofficial) API, not a browser. Put your
> `ANYLIST_EMAIL` and `ANYLIST_PASSWORD` in `.env` to enable it. If you don't
> use AnyList, leave them blank — the pipeline logs a warning for the AnyList
> step and continues with your Clove items.

## Usage

Run the entire workflow (Clove + AnyList → preferred items → Woolworths):

```bash
npm run shop
```

Or run a single stage (e.g. to inspect the plan before anything touches your cart):

```bash
npm run clove     # get-clove-items        → output/clove-items.json
npm run anylist   # get-anylist-items      → output/anylist-items.json
npm run map       # map-preferred-items    → output/shopping-plan.json
npm run cart      # add-to-woolworths-cart → output/results.json
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

Copy `preferred-items.example.txt` to `preferred-items.txt` and put one
Woolworths product name per line. Lines starting with `#` are ignored. These
are the exact products bought whenever a Clove or AnyList ingredient matches
them by keyword. `preferred-items.txt` is git-ignored.

A line can add extras after `|`:

```
Nestle Plaistowe Cocoa Powder Premium 180g | cocoa, plastowe | strict
```

- A comma-separated list of **aliases** — extra keywords (e.g. common misspellings) that should also route to this product.
- The flag **`strict`** — only ever add this exact product; if it's not found in Woolworths search results, the item is reported as unavailable instead of a different product being substituted.

### Ignoring items

Some things land on your Clove/AnyList lists that you never want the assistant
to buy (things you grow, get elsewhere, or that Woolworths doesn't stock). List
them in `ignore-items.txt` — one item per line, `#` comments ignored. Any
ingredient matching a line (case-insensitive and word-based, so `Cassava` also
drops `cassava flour`) is dropped during mapping: it is never matched to a
product and never added to your cart. Ignored items are recorded under
`ignored` in `output/shopping-plan.json`.

A line written as `category: <name>` ignores a whole **AnyList category** rather
than a single item, so anything you file (now or later) under a non-grocery
aisle is skipped automatically:

```
category: officeworks
category: pharmacy
category: chemist
```

To seed or refresh the preferred list from everything you've bought before, run the
[`sync-preferred-from-pastshops`](./skills/sync-preferred-from-pastshops/SKILL.md)
skill — it reads your Woolworths past-shops list (all pages) and appends any
new products:

```bash
npm run sync-prefs
```

Or pull from a single shop with
[`sync-preferred-from-order`](./skills/sync-preferred-from-order/SKILL.md) —
your latest order by default, or a specific one via `ORDER_ID` / `ORDER_URL`:

```bash
npm run sync-order                 # latest order
ORDER_ID=310959361 npm run sync-order
```

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
| `CLOVE_MODE` | `paste` | `paste` reads your pasted list; `web` uses the legacy browser scraper |
| `CLOVE_LIST_FILE` | `./clove-list.txt` | Paste-mode input: your Clove list, one ingredient per line (git-ignored) |
| `CLOVE_URL` | `https://clove.kitchen/groceries` | Clove groceries page (only used when `CLOVE_MODE=web`) |
| `AUTO_TRANSLATE` | `true` | Translate non-English Clove/AnyList ingredient names to English before matching; the Australian-English glossary step always runs regardless |
| `ANYLIST_EMAIL` | _(unset)_ | AnyList account email (enables the AnyList source) |
| `ANYLIST_PASSWORD` | _(unset)_ | AnyList account password |
| `ANYLIST_LIST_NAME` | `Groceries` | Name of the AnyList list to read |
| `ANYLIST_CREDENTIALS_FILE` | `./.anylist_credentials` | Encrypted AnyList token cache (git-ignored) |
| `WOOLWORTHS_URL` | `https://www.woolworths.com.au` | Woolworths base URL |
| `ORDER_ID` / `ORDER_URL` | _(unset)_ | A specific order for `sync-preferred-from-order` (else latest) |
| `PREFERRED_ITEMS_FILE` | `./preferred-items.txt` | Your preferred products (git-ignored; copy from `preferred-items.example.txt`) |
| `IGNORE_ITEMS_FILE` | `./ignore-items.txt` | Items to drop before mapping (never bought) |
| `MAX_QTY` | `12` | Safety cap on quantity per product |
| `OUTPUT_DIR` | `./output` | Where skills write hand-off files and reports |
| `LIMIT` | _(unset)_ | Process only the first N items per source (testing) |

## Project layout

```
AGENTS.md                  # agent guidelines (CLAUDE.md is a symlink to this)
CLAUDE.md -> AGENTS.md
preferred-items.example.txt  # example preferred products (copy to preferred-items.txt)
preferred-items.txt          # git-ignored; your preferred Woolworths products
ignore-items.txt             # items to drop before mapping (never bought)
src/                       # shared logic imported by the skill scripts
  config.js  browser.js  clove.js  anylist.js  preferences.js  quantity.js  woolworths.js
skills/
  get-clove-items/         SKILL.md + scripts/
  get-anylist-items/       SKILL.md + scripts/
  map-preferred-items/     SKILL.md + scripts/
  add-to-woolworths-cart/  SKILL.md + scripts/
  run-grocery-pipeline/    SKILL.md + scripts/   (orchestrator)
  sync-preferred-from-pastshops/  SKILL.md + scripts/
  sync-preferred-from-order/      SKILL.md + scripts/
output/                    # git-ignored hand-off files & reports
```

## Notes

- Nothing is checked out — the app only fills your cart for you to review and order.
- **Preparation state and protein are never swapped.** If an ingredient (or its preferred product) says *raw*, a *cooked* product is never added in its place, and vice versa; the same holds for *peeled* vs *unpeeled*, and for the protein (*beef*, *chicken*, *lamb*, *pork*, *turkey*, *fish*, *vegetable*), which outranks any brand preference — a favourite brand's beef stock is never used for chicken stock. A substitute may differ in brand or size, but not in preparation, and an item with no acceptable result is reported as unavailable instead. Softer details such as *deveined*, *tail off*, or *skinless* rank matching products higher without ruling the others out. See [`map-preferred-items`](./skills/map-preferred-items/SKILL.md#preparation-states).
- **Third-party marketplace items are never added.** Woolworths search results that are fulfilled by an outside seller (shown with a "Sold by &lt;seller&gt;" label — Woolworths Everyday Market) are always skipped, both when filling the cart and when syncing preferred products, since they're consistently the wrong product. If every result for an item is a marketplace listing, that item is reported as unavailable instead.
- Quantity estimation is best-effort and printed per item; tweak in your cart as needed.
- The browser profile holds your login — it's git-ignored; never commit it.
