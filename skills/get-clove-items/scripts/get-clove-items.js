#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, ensureOutputDir } from "../../../src/config.js";
import { launchBrowser, ensureLoggedIn } from "../../../src/browser.js";
import {
  extractIngredients,
  isCloveLoggedIn,
  parsePastedIngredients,
} from "../../../src/clove.js";
import { translateNonEnglishItems } from "../../../src/translate.js";

const PASTE_TEMPLATE = `# Paste your Clove groceries list here, one ingredient per line.
# Lines starting with "#" and blank lines are ignored.
# Example:
#   1 lb baby potatoes
#   6 roma tomatoes
#   1 x 14 ounce can coconut milk
`;

/**
 * Skill: get-clove-items
 *
 * Reads every unchecked Clove ingredient and writes them to the hand-off file
 * (`output/clove-items.json`) for the next skill to consume.
 *
 * Two modes (CLOVE_MODE):
 *   - "paste" (default): parse the ingredients you pasted into cfg.cloveListFile.
 *     The Clove website is no longer live, so this is the normal path.
 *   - "web": drive the (still present) browser scraper against cfg.cloveUrl.
 */
export async function run(cfg = loadConfig()) {
  ensureOutputDir(cfg);

  const items =
    cfg.cloveMode === "web"
      ? await runWebMode(cfg)
      : runPasteMode(cfg);

  const limited =
    cfg.limit && items.length > cfg.limit ? items.slice(0, cfg.limit) : items;
  if (cfg.limit && limited.length !== items.length) {
    console.log(`(LIMIT=${cfg.limit}) keeping first ${limited.length} only`);
  }

  console.log(`Found ${limited.length} unchecked ingredient(s):`);
  for (const it of limited) console.log(`  • ${it.full}`);

  // Translate any non-English ingredient names to English (e.g. a Portuguese
  // paste) before they ever reach preferred-item matching or Woolworths
  // search — both are English-only, so a foreign ingredient would otherwise
  // be searched for literally and match unrelated products.
  const translated = cfg.autoTranslate
    ? await translateNonEnglishItems(limited, { log: (msg) => console.log(msg) })
    : limited;
  const translatedCount = translated.filter((it) => it.translated).length;
  if (translatedCount) {
    console.log(
      `\nTranslated ${translatedCount} non-English ingredient(s) to English (see above).`
    );
  }

  const payload = {
    extractedAt: new Date().toISOString(),
    source: cfg.cloveMode === "web" ? "clove-web" : "clove-paste",
    count: translated.length,
    items: translated,
  };
  fs.writeFileSync(cfg.cloveItemsFile, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${limited.length} item(s) to ${cfg.cloveItemsFile}`);

  return payload;
}

/** Default mode: parse the ingredients pasted into the Clove list text file. */
function runPasteMode(cfg) {
  const file = path.resolve(cfg.cloveListFile);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, PASTE_TEMPLATE);
    console.log(
      `\nClove list file not found, so created a template at ${file}.\n` +
        `Paste your Clove groceries into it (one ingredient per line) and re-run.`
    );
    return [];
  }

  console.log(`\nReading Clove ingredients from ${file}...`);
  const items = parsePastedIngredients(fs.readFileSync(file, "utf8"));
  if (!items.length) {
    console.log(
      `No ingredients found in ${file}. Paste your Clove list into it ` +
        `(one ingredient per line) and re-run.`
    );
  }
  return items;
}

/** Legacy mode: scrape the (no-longer-live) Clove website via the browser. */
async function runWebMode(cfg) {
  const context = await launchBrowser(cfg);
  const page = await context.newPage();
  try {
    await ensureLoggedIn(page, {
      url: cfg.cloveUrl,
      name: "Clove",
      isLoggedIn: isCloveLoggedIn,
      headless: cfg.headless,
    });

    console.log("\nExtracting ingredients from Clove...");
    return await extractIngredients(page, cfg.cloveUrl);
  } finally {
    await context.close();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error("\nError:", err.message);
    process.exit(1);
  });
}
