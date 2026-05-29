#!/usr/bin/env node
import "dotenv/config";
import fs from "node:fs";
import { launchBrowser, ensureLoggedIn } from "./browser.js";
import { extractIngredients, isCloveLoggedIn } from "./clove.js";
import { loadPreferred, matchPreferred, isStrongMatch } from "./preferences.js";
import { estimateQuantity } from "./quantity.js";
import { addToCart, setQuantity, readTrolley, isWoolworthsLoggedIn } from "./woolworths.js";

const cfg = {
  profileDir: process.env.PROFILE_DIR || "./.browser-profile",
  headless: String(process.env.HEADLESS || "false").toLowerCase() === "true",
  channel: process.env.BROWSER_CHANNEL || "chrome",
  cloveUrl: process.env.CLOVE_URL || "https://clove.kitchen/groceries",
  wwUrl: process.env.WOOLWORTHS_URL || "https://www.woolworths.com.au",
  preferredFile: process.env.PREFERRED_ITEMS_FILE || "./preferred-items.txt",
  maxQty: Number(process.env.MAX_QTY || 12),
  limit: process.env.LIMIT ? Number(process.env.LIMIT) : null, // process only first N ingredients (testing)
};

const loginOnly = process.argv.includes("--login-only");

async function main() {
  const preferred = loadPreferred(cfg.preferredFile);
  console.log(`Loaded ${preferred.length} preferred items from ${cfg.preferredFile}`);

  const context = await launchBrowser(cfg);
  const page = await context.newPage();

  try {
    // ─── Phase 1: Clove ───────────────────────────────────────────────
    await ensureLoggedIn(page, {
      url: cfg.cloveUrl,
      name: "Clove",
      isLoggedIn: isCloveLoggedIn,
      headless: cfg.headless,
    });

    // ─── Phase 1b: Woolworths login (while still headed/interactive) ──
    await ensureLoggedIn(page, {
      url: cfg.wwUrl,
      name: "Woolworths",
      isLoggedIn: isWoolworthsLoggedIn,
      headless: cfg.headless,
    });

    if (loginOnly) {
      console.log("\n✓ Login check complete. You can now run normally (HEADLESS=true is fine).");
      return;
    }

    // ─── Phase 2: extract ingredients from Clove ──────────────────────
    console.log("\nExtracting ingredients from Clove...");
    let ingredients = await extractIngredients(page, cfg.cloveUrl);
    if (cfg.limit) {
      ingredients = ingredients.slice(0, cfg.limit);
      console.log(`(LIMIT=${cfg.limit}) processing first ${ingredients.length} only`);
    }
    console.log(`Found ${ingredients.length} unchecked ingredient(s):`);
    for (const it of ingredients) console.log(`  • ${it.full}`);

    if (!ingredients.length) {
      console.log("Nothing to add. Done.");
      return;
    }

    // ─── Phase 3: map ingredients to preferred products (in memory) ───
    console.log("\nMapping to preferred items...");
    const plan = ingredients.map((it) => {
      const match = matchPreferred(it.name, preferred);
      const strong = isStrongMatch(match, it.name);
      return {
        ingredient: it.full,
        name: it.name,
        mode: strong ? "preferred" : "fallback",
        term: strong ? match.product : it.name,
        exactName: strong ? match.product : null,
      };
    });
    for (const p of plan) {
      console.log(
        p.mode === "preferred"
          ? `  • "${p.name}" → preferred: ${p.term}`
          : `  • "${p.name}" → no preferred match, will search generically`
      );
    }

    // We have everything we need from Clove now — navigate away to Woolworths.
    // ─── Phase 4: add to Woolworths cart ──────────────────────────────
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

    // ─── Phase 5: report ──────────────────────────────────────────────
    const trolley = await readTrolley(page).catch(() => null);
    fs.writeFileSync("results.json", JSON.stringify({ results, trolley }, null, 2));

    const added = results.filter((r) => r.status === "ADDED");
    const lowConf = added.filter((r) => r.confidence !== "good");
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
    console.log(`\nFull details written to results.json`);
  } finally {
    await context.close();
  }
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
