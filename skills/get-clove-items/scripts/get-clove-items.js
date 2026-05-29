#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, ensureOutputDir } from "../../../src/config.js";
import { launchBrowser, ensureLoggedIn } from "../../../src/browser.js";
import { extractIngredients, isCloveLoggedIn } from "../../../src/clove.js";

/**
 * Skill: get-clove-items
 *
 * Opens Clove, reads every unchecked ingredient, and writes them to the
 * hand-off file (`output/clove-items.json`) for the next skill to consume.
 */
export async function run(cfg = loadConfig()) {
  ensureOutputDir(cfg);

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
    let items = await extractIngredients(page, cfg.cloveUrl);
    if (cfg.limit) {
      items = items.slice(0, cfg.limit);
      console.log(`(LIMIT=${cfg.limit}) keeping first ${items.length} only`);
    }

    console.log(`Found ${items.length} unchecked ingredient(s):`);
    for (const it of items) console.log(`  • ${it.full}`);

    const payload = { extractedAt: new Date().toISOString(), count: items.length, items };
    fs.writeFileSync(cfg.cloveItemsFile, JSON.stringify(payload, null, 2));
    console.log(`\nWrote ${items.length} item(s) to ${cfg.cloveItemsFile}`);

    return payload;
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
