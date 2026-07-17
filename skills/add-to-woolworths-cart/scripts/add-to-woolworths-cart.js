#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, ensureOutputDir } from "../../../src/config.js";
import { launchBrowser, ensureLoggedIn } from "../../../src/browser.js";
import { estimateQuantity } from "../../../src/quantity.js";
import {
  addToCart,
  setQuantity,
  readTrolley,
  isWoolworthsLoggedIn,
} from "../../../src/woolworths.js";

/**
 * Skill: add-to-woolworths-cart
 *
 * Reads the shopping plan, searches Woolworths for each item, adds the best
 * match to the cart, raises the quantity to the estimated amount, and writes a
 * results report.
 */
export async function run(cfg = loadConfig()) {
  ensureOutputDir(cfg);

  if (!fs.existsSync(cfg.shoppingPlanFile)) {
    throw new Error(
      `Missing ${cfg.shoppingPlanFile}. Run the map-preferred-items skill first.`
    );
  }

  const { plan } = JSON.parse(fs.readFileSync(cfg.shoppingPlanFile, "utf8"));
  if (!plan.length) {
    console.log("Shopping plan is empty. Nothing to add.");
    return { results: [], trolley: null };
  }

  const context = await launchBrowser(cfg);
  const page = await context.newPage();

  try {
    await ensureLoggedIn(page, {
      url: cfg.wwUrl,
      name: "Woolworths",
      isLoggedIn: isWoolworthsLoggedIn,
      headless: cfg.headless,
    });

    console.log("\nAdding to Woolworths cart...");
    const results = [];
    for (let i = 0; i < plan.length; i++) {
      const p = plan[i];
      process.stdout.write(`\n[${i + 1}/${plan.length}] ${p.name} (${p.mode}) `);
      const res = await addToCart(page, {
        base: cfg.wwUrl,
        term: p.term,
        ingredientName: p.name,
        exactName: p.exactName,
        strict: p.strict,
      });

      if (res.status !== "ADDED") {
        console.log(`→ ${res.status}`);
        results.push({ ...p, ...res });
        continue;
      }

      const est = estimateQuantity(p.ingredient, p.name, res.product, cfg.maxQty);
      let qtyReached = 1;
      if (est.qty > 1) {
        qtyReached = await setQuantity(page, res.product, est.qty, cfg.maxQty);
      }
      console.log(
        `→ ADDED: ${res.product} ×${est.qty} (${res.confidence}; qty: ${est.reason})`
      );
      results.push({ ...p, ...res, desiredQty: est.qty, qtyReached, qtyReason: est.reason });
      await page.waitForTimeout(500);
    }

    const trolley = await readTrolley(page).catch(() => null);
    fs.writeFileSync(cfg.resultsFile, JSON.stringify({ results, trolley }, null, 2));

    const added = results.filter((r) => r.status === "ADDED");
    const lowConf = added.filter((r) => r.confidence !== "good");
    const unavailable = results.filter((r) => r.status === "UNAVAILABLE");
    const failed = results.filter((r) => r.status !== "ADDED");

    console.log("\n========== SUMMARY ==========");
    console.log(`Ingredients processed: ${results.length}`);
    console.log(`Added:                 ${added.length}`);
    console.log(`Failed / no results:   ${failed.length}`);
    if (trolley) console.log(`Cart now:              ${trolley.count} items, $${trolley.subtotal}`);
    if (lowConf.length) {
      console.log(`\nReview these low-confidence matches:`);
      for (const r of lowConf) console.log(`  • ${r.name} → ${r.product} (${r.confidence})`);
    }
    if (unavailable.length) {
      console.log(`\nUnavailable (nothing suitable added):`);
      for (const r of unavailable) {
        const skipped = r.marketplaceFiltered
          ? ` (skipped ${r.marketplaceFiltered} third-party "Sold by" listing${r.marketplaceFiltered === 1 ? "" : "s"})`
          : "";
        const why = r.exactName
          ? `strict preferred item not found, nothing substituted; wanted: ${r.exactName}${skipped}`
          : r.marketplaceFiltered
            ? `only third-party marketplace listings found${skipped}`
            : `no suitable Woolworths product found`;
        console.log(`  • ${r.name} → ${why}`);
      }
    }
    console.log(`\nFull details written to ${cfg.resultsFile}`);

    return { results, trolley };
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
