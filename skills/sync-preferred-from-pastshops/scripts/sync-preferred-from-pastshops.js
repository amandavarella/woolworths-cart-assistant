#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, ensureOutputDir } from "../../../src/config.js";
import { launchBrowser, ensureLoggedIn } from "../../../src/browser.js";
import { isWoolworthsLoggedIn, readPastShopProducts } from "../../../src/woolworths.js";
import { appendPreferred } from "../../../src/preferences.js";

/**
 * Skill: sync-preferred-from-pastshops
 *
 * Reads every product from the Woolworths "My Lists → past shops → All
 * Products (everything)" page across all pages, and appends any new ones to
 * `preferred-items.txt` (skipping products already listed). A snapshot of what
 * was read is also written to `output/past-shop-items.json`.
 *
 * Nothing is removed from the preferred list — this only adds.
 */
export async function run(cfg = loadConfig()) {
  ensureOutputDir(cfg);

  const context = await launchBrowser(cfg);
  const page = await context.newPage();

  try {
    const listUrl = `${cfg.wwUrl}/shop/mylists/pastshops/everything`;
    await ensureLoggedIn(page, {
      url: listUrl,
      name: "Woolworths",
      isLoggedIn: isWoolworthsLoggedIn,
      headless: cfg.headless,
    });

    console.log("\nReading your past-shops list (all pages)...");
    let { pageCount, perPage, products } = await readPastShopProducts(page, { base: cfg.wwUrl });
    console.log(`Pages: ${pageCount}`);
    for (const pp of perPage) console.log(`  • page ${pp.page}: ${pp.count} item(s)`);

    if (cfg.limit) {
      products = products.slice(0, cfg.limit);
      console.log(`(LIMIT=${cfg.limit}) keeping first ${products.length} only`);
    }
    console.log(`Found ${products.length} unique product(s).`);

    // Snapshot what was read (handy for inspection / debugging).
    const snapshot = path.join(cfg.outputDir, "past-shop-items.json");
    fs.writeFileSync(
      snapshot,
      JSON.stringify({ readAt: new Date().toISOString(), pageCount, count: products.length, products }, null, 2)
    );
    console.log(`Wrote snapshot to ${snapshot}`);

    const preferredPath = path.resolve(cfg.preferredFile);
    const { added, skipped, total } = appendPreferred(preferredPath, products);

    console.log(`\nPreferred items updated: ${added.length} added, ${skipped} already present.`);
    for (const name of added) console.log(`  + ${name}`);
    console.log(`\n${preferredPath} now has ${total} product(s).`);

    return { products, added, skipped, total, preferredPath };
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
