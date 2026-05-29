#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { loadConfig } from "../../../src/config.js";
import { run as getCloveItems } from "../../get-clove-items/scripts/get-clove-items.js";
import { run as mapPreferredItems } from "../../map-preferred-items/scripts/map-preferred-items.js";
import { run as addToWoolworthsCart } from "../../add-to-woolworths-cart/scripts/add-to-woolworths-cart.js";

/**
 * Skill: run-grocery-pipeline (orchestrator)
 *
 * Runs the full Clove → preferred-items → Woolworths workflow end to end by
 * invoking each atomic skill in order and passing data along via the hand-off
 * files in `output/`.
 */
export async function run(cfg = loadConfig()) {
  console.log("━━━ Step 1/3: get-clove-items ━━━");
  const clove = await getCloveItems(cfg);
  if (!clove.count) {
    console.log("\nNothing unchecked on Clove. Pipeline complete (nothing to buy).");
    return { clove, plan: null, cart: null };
  }

  console.log("\n━━━ Step 2/3: map-preferred-items ━━━");
  const plan = await mapPreferredItems(cfg);

  console.log("\n━━━ Step 3/3: add-to-woolworths-cart ━━━");
  const cart = await addToWoolworthsCart(cfg);

  console.log("\n✓ Pipeline complete.");
  return { clove, plan, cart };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error("\nError:", err.message);
    process.exit(1);
  });
}
