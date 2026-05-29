#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, ensureOutputDir } from "../../../src/config.js";
import { loadPreferred, matchPreferred, isStrongMatch } from "../../../src/preferences.js";

/**
 * Skill: map-preferred-items
 *
 * Pure local logic — no browser. Reads the Clove items hand-off file, maps each
 * ingredient to your preferred Woolworths product (or marks it for a generic
 * fallback search), and writes a shopping plan for the cart skill to execute.
 */
export async function run(cfg = loadConfig()) {
  ensureOutputDir(cfg);

  if (!fs.existsSync(cfg.cloveItemsFile)) {
    throw new Error(
      `Missing ${cfg.cloveItemsFile}. Run the get-clove-items skill first.`
    );
  }

  const { items } = JSON.parse(fs.readFileSync(cfg.cloveItemsFile, "utf8"));
  const preferred = loadPreferred(cfg.preferredFile);
  console.log(`Loaded ${preferred.length} preferred items from ${cfg.preferredFile}`);
  console.log(`Mapping ${items.length} Clove ingredient(s)...\n`);

  const plan = items.map((it) => {
    const match = matchPreferred(it.name, preferred);
    const strong = isStrongMatch(match, it.name);
    const entry = {
      ingredient: it.full,
      name: it.name,
      mode: strong ? "preferred" : "fallback",
      term: strong ? match.product : it.name,
      exactName: strong ? match.product : null,
    };
    console.log(
      strong
        ? `  • "${it.name}" → preferred: ${match.product}`
        : `  • "${it.name}" → no preferred match, will search generically`
    );
    return entry;
  });

  const payload = { mappedAt: new Date().toISOString(), count: plan.length, plan };
  fs.writeFileSync(cfg.shoppingPlanFile, JSON.stringify(payload, null, 2));
  console.log(`\nWrote shopping plan (${plan.length} item(s)) to ${cfg.shoppingPlanFile}`);

  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error("\nError:", err.message);
    process.exit(1);
  });
}
