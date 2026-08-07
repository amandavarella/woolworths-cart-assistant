import { chromium } from "playwright";
import path from "node:path";

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

const LOGIN_POLL_MS = 3000;
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * Ensure the given page is logged into a site. Detection is heuristic; if it
 * can't confirm a logged-in state, it opens a visible window and polls until
 * you finish logging in there (no terminal Enter needed — so agent-driven
 * runs can continue once the browser session is valid).
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
  console.log(`  Waiting up to ${LOGIN_TIMEOUT_MS / 60000} minutes (checking every ${LOGIN_POLL_MS / 1000}s)...`);

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await page.waitForTimeout(LOGIN_POLL_MS);
    if (await isLoggedIn(page)) {
      console.log(`✓ ${name}: logged in`);
      return true;
    }
  }

  // One last reload in case cookies landed but the open tab still looks logged out.
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  const ok = await isLoggedIn(page);
  console.log(
    ok
      ? `✓ ${name}: logged in`
      : `✗ ${name}: still not detected as logged in after ${LOGIN_TIMEOUT_MS / 60000} minutes — continuing anyway`
  );
  return ok;
}
