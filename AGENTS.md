# Agent Guidelines

Guidelines for AI agents working in this repository. This project is **agent-driven**: its functionality is packaged as modular skills that an agent runs, rather than a single monolithic CLI.

## Steps to run before starting

Before running any skill, gather context:

- Read the `README.md`.
- Read the relevant `SKILL.md` in `skills/<name>/` fully before executing it.
- Make sure dependencies are installed (`npm install`) and a `.env` exists (`cp .env.example .env`).

## What this project does

Reads grocery ingredients from Clove and [AnyList](https://www.anylist.com/web), maps each one to **your preferred Woolworths product**, and adds them to your Woolworths online cart. Nothing is ever checked out; the cart is only filled for you to review and order. The Clove website is no longer live, so Clove items are read from a pasted list (`clove-list.txt`) by default (`CLOVE_MODE=paste`); the legacy browser scraper remains available via `CLOVE_MODE=web`.

## Skills

Skills are modular instruction packages in the `skills/` directory. Each skill has:

- a `SKILL.md` with YAML frontmatter (`name`, `description`) and step-by-step instructions, and
- a `scripts/` subdirectory with the Node entry point(s) the skill runs.

| Skill | Purpose | Browser | Hand-off |
|-------|---------|---------|----------|
| `get-clove-items` | Read your Clove ingredients (default `CLOVE_MODE=paste` reads a pasted list; `CLOVE_MODE=web` uses the legacy scraper) | paste: no / web: yes | reads `clove-list.txt` (paste) or Clove page (web), writes `output/clove-items.json` |
| `get-anylist-items` | Read unchecked items from AnyList (via API) | no (API) | writes `output/anylist-items.json` |
| `map-preferred-items` | Map ingredients → preferred Woolworths products (merges Clove + AnyList) | no (pure logic) | reads `clove-items.json` + `anylist-items.json`, writes `output/shopping-plan.json` |
| `add-to-woolworths-cart` | Add the plan to the Woolworths cart | yes | reads `shopping-plan.json`, writes `output/results.json` |
| `run-grocery-pipeline` | **Orchestrator** — runs all of the above in order | — | end-to-end |
| `sync-preferred-from-pastshops` | Read Woolworths past-shops list → add new products to preferred items | yes | reads past shops page, writes `preferred-items.txt` (+ `output/past-shop-items.json`) |
| `sync-preferred-from-order` | Read a single Woolworths order (latest or a specific one) → add new products to preferred items | yes | reads order detail API, writes `preferred-items.txt` (+ `output/order-items.json`) |

### Executing skills

- **Follow skill instructions precisely** and in order.
- **Skill scripts** live in `skills/<name>/scripts/` and are invoked as `node skills/<name>/scripts/<script>.js`.
- Each script is also importable: it exports an `async run(cfg)` function and only auto-runs when invoked directly. The orchestrator imports the three step functions.
- **Data hand-off** between skills happens through JSON files in `output/` (see the table above) — never by sharing a browser session. Each browser skill launches its own context and reuses the persistent login profile.
- **To run the whole job**: use the `run-grocery-pipeline` skill. To run a single stage or inspect intermediate output, run the individual skills.

## Shared code

Common logic lives in `src/` and is imported by the skill scripts:

- `src/config.js` — loads `.env` config and the `output/` hand-off file paths.
- `src/browser.js` — persistent browser launch + interactive login helper.
- `src/clove.js` — Clove extraction (pasted-list parser + legacy web scraper).
- `src/anylist.js` — AnyList API client (logs in with email/password, reads a list's items).
- `src/preferences.js` — preferred-items matching.
- `src/quantity.js` — quantity estimation from Clove amounts.
- `src/woolworths.js` — Woolworths search, add-to-cart, quantity, trolley read.

Keep `src/` as the single source of shared logic. Skill scripts should stay thin wrappers around it.

## Login

The browser skills detect whether you are logged in and, if not, open a visible window and poll until you log in there (no terminal Enter needed), then continue. Because the session is saved in `PROFILE_DIR`, you only log in once.

- The **first** run must be non-headless (`HEADLESS=false`).
- After logging in once, set `HEADLESS=true` for unattended runs.

**Browser preference:** When a task needs a logged-in Woolworths (or Clove) session, drive this project's own persistent Chrome profile (`PROFILE_DIR`, e.g. `.browser-profile`) via Playwright — **not** the Cursor/built-in browser. (AnyList is the exception: it uses the AnyList API with credentials from `.env`, not a browser.) That profile already holds the saved login, so prefer launching it with `launchBrowser()` from `src/browser.js`. If the session isn't valid, run non-headless and let the user log in there once; don't ask the user to log into the Cursor browser.

## Output

- All hand-off files and reports are written to `output/` (git-ignored).
- Use date- or run-meaningful content in reports where helpful, but the fixed hand-off filenames (`clove-items.json`, `shopping-plan.json`, `results.json`) are what the skills expect.

## Configuration

| Type of value | Where it goes |
|---------------|---------------|
| Credentials / tokens / personal settings | `.env` (git-ignored) — add new keys to `.env.example` |
| Your preferred products | `preferred-items.txt` |
| Anything secret or session-related | `PROFILE_DIR` (git-ignored) |

**Never commit**: `.env`, the browser profile, or anything under `output/`.

## Conventions

- This repo uses ES modules (`"type": "module"`). Use `import`, not `require`.
- Node 20+.
- Keep skills self-describing: if you change a script's behaviour, update its `SKILL.md`.
- New scheduled/recurring automations should be named with a clear prefix and documented in their `SKILL.md`.
