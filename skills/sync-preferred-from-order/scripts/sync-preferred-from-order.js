#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, ensureOutputDir } from "../../../src/config.js";
import { launchBrowser, ensureLoggedIn } from "../../../src/browser.js";
import {
  isWoolworthsLoggedIn,
  findLatestOrderId,
  readOrderProducts,
} from "../../../src/woolworths.js";
import { appendPreferred } from "../../../src/preferences.js";

/**
 * Skill: sync-preferred-from-order
 *
 * Reads every product from a single Woolworths order — your latest order by
 * default, or a specific one via ORDER_ID / ORDER_URL — and appends any new
 * ones to `preferred-items.txt` (skipping products already listed). A snapshot
 * of what was read is also written to `output/order-items.json`.
 *
 * Nothing is removed from the preferred list — this only adds.
 */
export async function run(cfg = loadConfig()) {
  ensureOutputDir(cfg);

  const context = await launchBrowser(cfg);
  const page = await context.newPage();

  try {
    await ensureLoggedIn(page, {
      url: `${cfg.wwUrl}/shop/myaccount/myorders`,
      name: "Woolworths",
      isLoggedIn: isWoolworthsLoggedIn,
      headless: cfg.headless,
    });

    let orderId = cfg.orderId;
    if (orderId) {
      console.log(`\nUsing configured order ${orderId}.`);
    } else {
      console.log("\nNo ORDER_ID/ORDER_URL set — finding your latest order...");
      orderId = await findLatestOrderId(page, { base: cfg.wwUrl });
      if (!orderId) throw new Error("Could not find any orders on your account.");
      console.log(`Latest order: ${orderId}`);
    }

    console.log(`Reading products from order ${orderId}...`);
    const order = await readOrderProducts(page, { base: cfg.wwUrl, orderId });

    let products = order.products;
    if (cfg.limit) {
      products = products.slice(0, cfg.limit);
      console.log(`(LIMIT=${cfg.limit}) keeping first ${products.length} only`);
    }
    console.log(
      `Order ${order.orderId}${order.createdDate ? ` (${order.createdDate})` : ""}` +
        `${order.total != null ? ` — $${order.total}` : ""}: ${products.length} product(s).`
    );

    const snapshot = path.join(cfg.outputDir, "order-items.json");
    fs.writeFileSync(
      snapshot,
      JSON.stringify(
        {
          readAt: new Date().toISOString(),
          orderId: order.orderId,
          createdDate: order.createdDate,
          total: order.total,
          count: products.length,
          products,
        },
        null,
        2
      )
    );
    console.log(`Wrote snapshot to ${snapshot}`);

    const preferredPath = path.resolve(cfg.preferredFile);
    const { added, skipped, total } = appendPreferred(preferredPath, products);

    console.log(`\nPreferred items updated: ${added.length} added, ${skipped} already present.`);
    for (const name of added) console.log(`  + ${name}`);
    console.log(`\n${preferredPath} now has ${total} product(s).`);

    return { orderId: order.orderId, products, added, skipped, total, preferredPath };
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
