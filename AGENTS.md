# Agent Guidelines

Guidelines for AI agents working in this repository. This project is **agent-driven**: its functionality is packaged as modular skills that an agent runs, rather than a single monolithic CLI.

## Steps to run before starting

Before running any skill, gather context:

- Read the `README.md`.
- Read the relevant `SKILL.md` in `skills/<name>/` fully before executing it.
- Make sure dependencies are installed (`npm install`) and a `.env` exists (`cp .env.example .env`).

## What this project does

Reads grocery ingredients from [Clove](https://clove.kitchen/groceries), maps each one to **your preferred Woolworths product**, and adds them to your Woolworths online cart. Nothing is ever checked out — the cart is only filled for you to review and order.

## Skills

Skills are modular instruction packages in the `skills/` directory. Each skill has:

- a `SKILL.md` with YAML frontmatter (`name`, `description`) and step-by-step instructions, and
- a `scripts/` subdirectory with the Node entry point(s) the skill runs.

| Skill | Purpose | Browser | Hand-off |
|-------|---------|---------|----------|
| `get-clove-items` | Read unchecked ingredients from Clove | yes | writes `output/clove-items.json` |
| `map-preferred-items` | Map ingredients → preferred Woolworths products | no (pure logic) | reads `clove-items.json`, writes `output/shopping-plan.json` |
| `add-to-woolworths-cart` | Add the plan to the Woolworths cart | yes | reads `shopping-plan.json`, writes `output/results.json` |
| `run-grocery-pipeline` | **Orchestrator** — runs all three in order | — | end-to-end |

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
- `src/clove.js` — Clove extraction.
- `src/preferences.js` — preferred-items matching.
- `src/quantity.js` — quantity estimation from Clove amounts.
- `src/woolworths.js` — Woolworths search, add-to-cart, quantity, trolley read.

Keep `src/` as the single source of shared logic. Skill scripts should stay thin wrappers around it.

## Login

The browser skills detect whether you are logged in and, if not, open a visible window and wait for you to log in, then continue. Because the session is saved in `PROFILE_DIR`, you only log in once.

- The **first** run must be non-headless (`HEADLESS=false`).
- After logging in once, set `HEADLESS=true` for unattended runs.

**Browser preference:** When a task needs a logged-in Woolworths (or Clove) session, drive this project's own persistent Chrome profile (`PROFILE_DIR`, e.g. `.browser-profile`) via Playwright — **not** the Cursor/built-in browser. That profile already holds the saved login, so prefer launching it with `launchBrowser()` from `src/browser.js`. If the session isn't valid, run non-headless and let the user log in there once; don't ask the user to log into the Cursor browser.

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
