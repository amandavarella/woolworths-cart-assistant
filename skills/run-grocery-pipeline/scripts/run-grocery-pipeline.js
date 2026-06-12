#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../../src/config.js";
import { run as getCloveItems } from "../../get-clove-items/scripts/get-clove-items.js";
import { run as getAnylistItems } from "../../get-anylist-items/scripts/get-anylist-items.js";
import { run as mapPreferredItems } from "../../map-preferred-items/scripts/map-preferred-items.js";
import { run as addToWoolworthsCart } from "../../add-to-woolworths-cart/scripts/add-to-woolworths-cart.js";

/**
 * Skill: run-grocery-pipeline (orchestrator)
 *
 * Runs the full (Clove + AnyList) → preferred-items → Woolworths workflow end
 * to end by invoking each atomic skill in order and passing data along via the
 * hand-off files in `output/`. Both Clove and AnyList items are gathered and
 * matched against your preferred products before anything is added to the cart.
 */
export async function run(cfg = loadConfig()) {
  console.log("━━━ Step 1/4: get-clove-items ━━━");
  const clove = await getCloveItems(cfg);

  console.log("\n━━━ Step 2/4: get-anylist-items ━━━");
  // AnyList is best-effort: a failure here (e.g. no subscription) shouldn't
  // sink a run that still has Clove items to process.
  let anylist = { count: 0, items: [] };
  try {
    anylist = await getAnylistItems(cfg);
  } catch (err) {
    console.log(`\n⚠ AnyList step skipped: ${err.message}`);
  }

  if (!clove.count && !anylist.count) {
    console.log("\nNothing unchecked on Clove or AnyList. Pipeline complete (nothing to buy).");
    return { clove, anylist, plan: null, cart: null };
  }

  console.log("\n━━━ Step 3/4: map-preferred-items ━━━");
  const plan = await mapPreferredItems(cfg);

  console.log("\n━━━ Step 4/4: add-to-woolworths-cart ━━━");
  const cart = await addToWoolworthsCart(cfg);

  console.log("\n✓ Pipeline complete.");
  return { clove, anylist, plan, cart };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error("\nError:", err.message);
    process.exit(1);
  });
}
