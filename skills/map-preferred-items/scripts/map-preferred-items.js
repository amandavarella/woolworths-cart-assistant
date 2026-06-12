#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, ensureOutputDir } from "../../../src/config.js";
import { loadPreferred, matchPreferred, isStrongMatch } from "../../../src/preferences.js";

/**
 * Skill: map-preferred-items
 *
 * Pure local logic — no browser. Reads every available item-source hand-off
 * file (Clove and/or AnyList), maps each ingredient to your preferred
 * Woolworths product (or marks it for a generic fallback search), merges and
 * de-duplicates the sources, and writes a single shopping plan for the cart
 * skill to execute.
 */
export async function run(cfg = loadConfig()) {
  ensureOutputDir(cfg);

  // Item sources, in priority order. The first source to resolve a given
  // product "wins" when de-duplicating across lists.
  const sources = [
    { source: "clove", file: cfg.cloveItemsFile },
    { source: "anylist", file: cfg.anylistItemsFile },
  ].filter((s) => fs.existsSync(s.file));

  if (!sources.length) {
    throw new Error(
      `No item sources found. Run get-clove-items and/or get-anylist-items first ` +
        `(expected ${cfg.cloveItemsFile} or ${cfg.anylistItemsFile}).`
    );
  }

  const preferred = loadPreferred(cfg.preferredFile);
  console.log(`Loaded ${preferred.length} preferred items from ${cfg.preferredFile}`);

  const plan = [];
  const seen = new Set(); // de-dupe identical search targets across sources

  for (const { source, file } of sources) {
    const { items } = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`\nMapping ${items.length} item(s) from ${source}...`);

    for (const it of items) {
      const match = matchPreferred(it.name, preferred);
      const strong = isStrongMatch(match, it.name);
      const entry = {
        source,
        ingredient: it.full,
        name: it.name,
        mode: strong ? "preferred" : "fallback",
        term: strong ? match.product : it.name,
        exactName: strong ? match.product : null,
      };

      // De-dupe so the same product from two lists isn't added twice.
      const dedupeKey = `${entry.mode}|${(entry.exactName || entry.term).toLowerCase()}`;
      if (seen.has(dedupeKey)) {
        console.log(`  • "${it.name}" → already planned (${entry.term}), skipping duplicate`);
        continue;
      }
      seen.add(dedupeKey);

      console.log(
        strong
          ? `  • "${it.name}" → preferred: ${match.product}`
          : `  • "${it.name}" → no preferred match, will search generically`
      );
      plan.push(entry);
    }
  }

  const payload = {
    mappedAt: new Date().toISOString(),
    sources: sources.map((s) => s.source),
    count: plan.length,
    plan,
  };
  fs.writeFileSync(cfg.shoppingPlanFile, JSON.stringify(payload, null, 2));
  console.log(
    `\nWrote shopping plan (${plan.length} item(s) from ${sources
      .map((s) => s.source)
      .join(" + ")}) to ${cfg.shoppingPlanFile}`
  );

  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error("\nError:", err.message);
    process.exit(1);
  });
}
