const state = {
  unlockedVault: null,
  unlockedUntil: 0,
  settings: {
    lockTimeoutMs: 10 * 60 * 1000
  }
};

function parseCsv(csvText) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < csvText.length; i += 1) {
    const ch = csvText[i];
    const next = csvText[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') { field += '"'; i += 1; } else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      row.push(field.trim()); field = "";
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(field.trim()); if (row.some(Boolean)) rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field.length || row.length) { row.push(field.trim()); if (row.some(Boolean)) rows.push(row); }

  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.toLowerCase());
  return rows.slice(1).map((r) => {
    const account = Object.fromEntries(headers.map((h, idx) => [h, r[idx] || ""]));
    return {
      id: crypto.randomUUID(),
      name: account.name || "Unnamed",
      url: account.url || "",
      username: account.username || "",
      password: account.password || "",
      totp_secret: account.totp_secret || "",
      notes: account.notes || ""
    };
  });
}

function extractBaseDomain(urlOrHost) {
  try {
    const host = urlOrHost.includes("://") ? new URL(urlOrHost).hostname : urlOrHost;
    const parts = host.toLowerCase().split('.').filter(Boolean);
    return parts.length <= 2 ? parts.join('.') : parts.slice(-2).join('.');
  } catch { return ""; }
}

function scoreDomainMatch(entryUrl, activeHost) {
  try {
    const active = activeHost.toLowerCase();
    const host = (entryUrl.includes("://") ? new URL(entryUrl).hostname : entryUrl).toLowerCase();
    if (host === active) return 3;
    if (active.endsWith(`.${host}`) || host.endsWith(`.${active}`)) return 2;
    if (extractBaseDomain(host) === extractBaseDomain(active)) return 1;
    return 0;
  } catch { return 0; }
}

function ensureUnlocked() {
  if (!state.unlockedVault || Date.now() > state.unlockedUntil) {
    state.unlockedVault = null;
    return false;
  }
  return true;
}

browser.runtime.onMessage.addListener(async (message) => {
  if (!message?.type) return null;

  if (message.type === "IMPORT_CSV") return { ok: true, imported: parseCsv(message.csv) };

  if (message.type === "SAVE_ENCRYPTED_VAULT") {
    const encrypted = await CryptoUtils.encryptVault({ accounts: message.accounts }, message.masterPassword);
    await browser.storage.local.set({ openpass_encrypted_vault: encrypted });
    return { ok: true };
  }

  if (message.type === "UNLOCK_VAULT") {
    const { openpass_encrypted_vault, openpass_settings } = await browser.storage.local.get(["openpass_encrypted_vault", "openpass_settings"]);
    if (openpass_settings?.lockTimeoutMs) state.settings.lockTimeoutMs = openpass_settings.lockTimeoutMs;
    if (!openpass_encrypted_vault) return { ok: false, error: "Vault not initialized." };
    try {
      const vault = await CryptoUtils.decryptVault(openpass_encrypted_vault, message.masterPassword);
      state.unlockedVault = vault;
      state.unlockedUntil = Date.now() + state.settings.lockTimeoutMs;
      return { ok: true, vault, expiresAt: state.unlockedUntil };
    } catch { return { ok: false, error: "Invalid master password." }; }
  }

  if (message.type === "LOCK_VAULT") { state.unlockedVault = null; state.unlockedUntil = 0; return { ok: true }; }

  if (message.type === "UPDATE_SETTINGS") {
    const lockTimeoutMs = Number(message.lockTimeoutMs || 0);
    if (lockTimeoutMs >= 60_000 && lockTimeoutMs <= 60 * 60 * 1000) {
      state.settings.lockTimeoutMs = lockTimeoutMs;
      await browser.storage.local.set({ openpass_settings: { lockTimeoutMs } });
      return { ok: true };
    }
    return { ok: false, error: "Invalid timeout range." };
  }

  if (message.type === "GET_MATCHING_ACCOUNTS") {
    if (!ensureUnlocked()) return { ok: false, locked: true };
    const all = state.unlockedVault.accounts || [];
    const enriched = all.map((a) => ({ ...a, _matchScore: scoreDomainMatch(a.url || "", message.domain || "") }));
    const matches = enriched.filter((a) => a._matchScore > 0).sort((a, b) => b._matchScore - a._matchScore || a.name.localeCompare(b.name));
    return { ok: true, matches, all: enriched, expiresAt: state.unlockedUntil };
  }

  if (message.type === "GENERATE_TOTP") return { ok: true, code: await CryptoUtils.generateTotp(message.secret || "") };
  return null;
});
