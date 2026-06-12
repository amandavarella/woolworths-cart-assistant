/**
 * AnyList integration via its (unofficial, reverse-engineered) API.
 *
 * Uses the `anylist` package (https://github.com/kevdliu/anylist) to log in
 * with your email/password and read a list's items directly — no browser, no
 * scraping. The encrypted token cache (see `credentialsFile`) means only the
 * first call performs a full login.
 *
 * Items are returned in the same shape as the Clove extractor so the two
 * sources are interchangeable downstream: `{ full, name }` per item. AnyList
 * items are usually just a product name (optionally with a quantity), so:
 *   - `name` is the bare item name (used for preferred-item matching), and
 *   - `full` includes the quantity when AnyList has one (e.g. "2 milk").
 */
import AnyList from "anylist";

const normalise = (s) => (s || "").replace(/\s+/g, " ").trim();

/**
 * Log into AnyList, read the named list, and return its unchecked items.
 *
 * @param {object} cfg loaded config (needs anylistEmail/Password, list name)
 * @returns {Promise<Array<{full: string, name: string}>>}
 */
export async function fetchItems(cfg) {
  if (!cfg.anylistEmail || !cfg.anylistPassword) {
    throw new Error(
      "AnyList credentials missing. Set ANYLIST_EMAIL and ANYLIST_PASSWORD in .env."
    );
  }

  const any = new AnyList({
    email: cfg.anylistEmail,
    password: cfg.anylistPassword,
    credentialsFile: cfg.anylistCredentialsFile || undefined,
  });

  try {
    await any.login();
    await any.getLists();

    const listName = cfg.anylistListName || "Groceries";
    const list = any.getListByName(listName);
    if (!list) {
      const available = (any.lists || []).map((l) => l.name).filter(Boolean);
      throw new Error(
        `AnyList list "${listName}" not found.` +
          (available.length ? ` Available lists: ${available.join(", ")}.` : "")
      );
    }

    const seen = new Set();
    const items = [];
    for (const it of list.items || []) {
      if (it.checked) continue; // skip crossed-off items
      const name = normalise(it.name);
      if (!name) continue;
      const qty = normalise(String(it.quantity ?? ""));
      const full = qty ? `${qty} ${name}` : name;

      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ full, name });
    }

    return items;
  } finally {
    // Closes the websocket/HTTP client so the process can exit cleanly.
    try {
      any.teardown();
    } catch {
      /* ignore teardown errors */
    }
  }
}
