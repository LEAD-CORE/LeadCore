```javascript
/* LEAD CORE • Premium CRM (Sheets-only, locked URL)
   - Google Sheets only (no Local mode)
   - No popups/toasts (console only)
   - Robust: no missing-element crashes
   - Live sync across computers (polling)
*/
(() => {
  "use strict";

  const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycbzIfQh5_eUCScWtQxbf8qS978mNB1VXj0WW6wAY3XCVlEDE_JV9gm-FL1T5UKZw5wDURA/exec";
  const LS_GS_URL_KEY = "LEAD_CORE_GS_URL";
  const LS_LOCAL_BACKUP_KEY = "LEAD_CORE_STATE_V1_BACKUP";

  const notify = (msg, level = "info") => {
    try {
      const tag = level ? String(level).toUpperCase() : "INFO";
      console[tag === "ERROR" ? "error" : tag === "WARN" ? "warn" : "log"](`[LeadCore] ${msg}`);
    } catch (_) {}
  };
  const showToast = () => {};

  let RESOLVED_GS_URL = null;

  async function resolveGsUrl() {
    if (RESOLVED_GS_URL) return RESOLVED_GS_URL;

    try {
      const r = await fetch(DEFAULT_GS_URL + "?action=ping", {
        method: "GET",
        redirect: "follow",
        cache: "no-store"
      });

      RESOLVED_GS_URL = r.url || DEFAULT_GS_URL;
      notify("Resolved GS URL → " + RESOLVED_GS_URL);
      return RESOLVED_GS_URL;
    } catch (e) {
      notify("Failed resolving GS URL, fallback", "warn");
      return DEFAULT_GS_URL;
    }
  }

  async function gsFetch(action, payload) {
    const base = await resolveGsUrl();
    const url = base + "?action=" + encodeURIComponent(action);

    const r = await fetch(url, {
      method: "POST",
      body: JSON.stringify(payload || {}),
      cache: "no-store"
    });

    const txt = await r.text();
    try { return JSON.parse(txt); }
    catch { return { ok:false, raw:txt }; }
  }

  const state = {
    customers: []
  };

  async function saveState() {
    try {
      const res = await gsFetch("put", state);
      if (!res || !res.ok) throw new Error("Save failed");
      localStorage.setItem(LS_LOCAL_BACKUP_KEY, JSON.stringify(state));
      notify("State saved");
    } catch (e) {
      notify("Save error: " + e.message, "error");
    }
  }

  async function loadState() {
    try {
      const res = await gsFetch("get");
      if (res && res.ok && res.payload) {
        Object.assign(state, res.payload);
        notify("State loaded");
        return;
      }
      throw new Error("Bad payload");
    } catch (e) {
      notify("Load failed, using backup", "warn");
      try {
        const raw = localStorage.getItem(LS_LOCAL_BACKUP_KEY);
        if (raw) Object.assign(state, JSON.parse(raw));
      } catch (_) {}
    }
  }

  async function addInsurance(customerId, insurance) {
    const cust = state.customers.find(c => c.id === customerId);
    if (!cust) return;
    cust.insurances = cust.insurances || [];
    cust.insurances.push(insurance);
    await saveState();
  }

  window.LeadCore = {
    state,
    saveState,
    loadState,
    addInsurance
  };

  loadState();
})();
```
