import "dotenv/config";
import fs from "node:fs";
import path from "node:path";

/**
 * Shared configuration for every skill.
 *
 * Each skill script is a standalone Node entry point, so they all load the same
 * environment-driven config from here instead of duplicating the parsing.
 */
export function loadConfig() {
  const outputDir = path.resolve(process.env.OUTPUT_DIR || "./output");
  return {
    profileDir: process.env.PROFILE_DIR || "./.browser-profile",
    headless: String(process.env.HEADLESS || "false").toLowerCase() === "true",
    channel: process.env.BROWSER_CHANNEL || "chrome",
    cloveUrl: process.env.CLOVE_URL || "https://clove.kitchen/groceries",
    // AnyList is read via its (unofficial) API using email/password — no
    // browser. Credentials come from .env; an encrypted token cache speeds up
    // later logins.
    anylistEmail: process.env.ANYLIST_EMAIL || null,
    anylistPassword: process.env.ANYLIST_PASSWORD || null,
    anylistCredentialsFile: process.env.ANYLIST_CREDENTIALS_FILE || "./.anylist_credentials",
    // Name of the AnyList list to read. Defaults to "Groceries"; override via
    // ANYLIST_LIST_NAME.
    anylistListName: process.env.ANYLIST_LIST_NAME || "Groceries",
    wwUrl: process.env.WOOLWORTHS_URL || "https://www.woolworths.com.au",
    // A specific Woolworths order to sync preferred items from. Accepts either
    // a bare order id (ORDER_ID) or a full order URL (ORDER_URL). When neither
    // is set, the sync-preferred-from-order skill uses your latest order.
    orderId:
      process.env.ORDER_ID ||
      (process.env.ORDER_URL && (process.env.ORDER_URL.match(/(\d{5,})/) || [])[1]) ||
      null,
    preferredFile: process.env.PREFERRED_ITEMS_FILE || "./preferred-items.txt",
    maxQty: Number(process.env.MAX_QTY || 12),
    limit: process.env.LIMIT ? Number(process.env.LIMIT) : null,
    outputDir,
    // Hand-off files shared between skills.
    cloveItemsFile: path.join(outputDir, "clove-items.json"),
    anylistItemsFile: path.join(outputDir, "anylist-items.json"),
    shoppingPlanFile: path.join(outputDir, "shopping-plan.json"),
    resultsFile: path.join(outputDir, "results.json"),
  };
}

/** Ensure the output directory exists before a skill writes its hand-off file. */
export function ensureOutputDir(cfg) {
  fs.mkdirSync(cfg.outputDir, { recursive: true });
}
