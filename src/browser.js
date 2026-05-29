import { chromium } from "playwright";
import path from "node:path";
import readline from "node:readline";

/**
 * Launch a persistent browser context. The profile lives in PROFILE_DIR so the
 * login session is reused across runs (log in once, automatic thereafter).
 */
export async function launchBrowser({ profileDir, headless, channel }) {
  const userDataDir = path.resolve(profileDir);
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    channel: channel || undefined, // "chrome" -> system Chrome; undefined -> bundled Chromium
    viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  return context;
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

/**
 * Ensure the given page is logged into a site. Detection is heuristic; if it
 * can't confirm a logged-in state, it pauses and asks the user to log in
 * manually in the visible window, then re-checks.
 */
export async function ensureLoggedIn(page, { url, name, isLoggedIn, headless }) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  if (await isLoggedIn(page)) {
    console.log(`✓ ${name}: already logged in`);
    return true;
  }

  if (headless) {
    throw new Error(
      `${name}: not logged in and running headless. Run once with HEADLESS=false to log in.`
    );
  }

  console.log(`\n⚠ ${name}: you don't appear to be logged in.`);
  console.log(`  A browser window is open. Please log into ${name} there.`);
  await prompt(`  Press Enter once you've logged into ${name}... `);

  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  if (await isLoggedIn(page)) {
    console.log(`✓ ${name}: logged in`);
    return true;
  }
  // Give it one more chance — sites sometimes need a beat after login redirects.
  await prompt(`  Still can't confirm login. Finish logging in, then press Enter again... `);
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const ok = await isLoggedIn(page);
  console.log(ok ? `✓ ${name}: logged in` : `✗ ${name}: still not detected as logged in — continuing anyway`);
  return ok;
}
