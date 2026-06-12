#!/usr/bin/env node
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig, ensureOutputDir } from "../../../src/config.js";
import { fetchItems } from "../../../src/anylist.js";

/**
 * Skill: get-anylist-items
 *
 * Reads every unchecked item from your AnyList list via the AnyList API (using
 * the credentials in .env — no browser) and writes them to the hand-off file
 * (`output/anylist-items.json`) for the `map-preferred-items` skill to consume,
 * mirroring `get-clove-items`.
 */
export async function run(cfg = loadConfig()) {
  ensureOutputDir(cfg);

  console.log(`Reading AnyList list "${cfg.anylistListName}" via API...`);
  let items = await fetchItems(cfg);
  if (cfg.limit) {
    items = items.slice(0, cfg.limit);
    console.log(`(LIMIT=${cfg.limit}) keeping first ${items.length} only`);
  }

  console.log(`Found ${items.length} unchecked item(s):`);
  for (const it of items) console.log(`  • ${it.full}`);

  const payload = { extractedAt: new Date().toISOString(), count: items.length, items };
  fs.writeFileSync(cfg.anylistItemsFile, JSON.stringify(payload, null, 2));
  console.log(`\nWrote ${items.length} item(s) to ${cfg.anylistItemsFile}`);

  return payload;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err) => {
    console.error("\nError:", err.message);
    process.exit(1);
  });
}
