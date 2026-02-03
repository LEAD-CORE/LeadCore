/* LEAD CORE • Final • Live Sync build 20260203 */
(() => {
  "use strict";

  /* =========================
     CONFIG
  ========================= */
  const SYNC_INTERVAL_MS = 5000; // כל 5 שניות
  const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycbwHDJlsn3TiTrPXpIVdOc9b0sy7cIlkF9cQnKJ4__19vvr-OUjvwzpEuSFhSBEItjB9Iw/exec";

  /* =========================
     UTILS
  ========================= */
  const nowISO = () => new Date().toISOString();
  const uid = () => "c_" + Math.random().toString(16).slice(2) + Date.now();
  const safe = v => String(v ?? "").trim();

  /* =========================
     STATE
  ========================= */
  const defaultState = () => ({
    meta: { updatedAt: null },
    agents: [{ id: "a_yuval", name: "יובל מנדלסון" }],
    customers: [],
    activity: []
  });

  const State = {
    data: defaultState(),
    lastServerAt: null
  };

  /* =========================
     STORAGE (Sheets)
  ========================= */
  const Storage = {
    gsUrl: localStorage.getItem("LEADCORE_GS_URL") || DEFAULT_GS_URL,

    async get() {
      const url = new URL(this.gsUrl);
      url.searchParams.set("action", "get");
      const r = await fetch(url);
      return r.json();
    },

    async put(state) {
      const url = new URL(this.gsUrl);
      url.searchParams.set("action", "put");
      const r = await fetch(url, {
        method: "POST",
        body: JSON.stringify({ payload: state })
      });
      return r.json();
    }
  };

  /* =========================
     AUTO SYNC ENGINE 🔄
  ========================= */
  let syncTimer = null;
  let savingNow = false;

  async function autoSyncTick() {
    if (savingNow) return;

    try {
      const r = await Storage.get();
      if (!r.ok) return;

      if (State.lastServerAt && r.at === State.lastServerAt) return;

      State.lastServerAt = r.at;
      State.data = r.payload;
      renderAll();

      console.log("🔄 Live sync update");
    } catch (e) {
      console.warn("sync failed", e);
    }
  }

  function startAutoSync() {
    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(autoSyncTick, SYNC_INTERVAL_MS);
  }

  /* =========================
     SAVE
  ========================= */
  async function saveState(activityText) {
    savingNow = true;

    State.data.meta.updatedAt = nowISO();
    if (activityText) {
      State.data.activity.unshift({ at: nowISO(), text: activityText });
    }

    const r = await Storage.put(State.data);
    if (r.ok) {
      State.lastServerAt = r.at;
    }

    savingNow = false;
    return r;
  }

  /* =========================
     UI (קיים אצלך – לא שיניתי לוגיקה)
  ========================= */
  function renderAll() {
    // כאן נשאר כל קוד הרינדור הקיים שלך
    // לקוחות / דשבורד / תיק לקוח
  }

  /* =========================
     BOOT
  ========================= */
  document.addEventListener("DOMContentLoaded", async () => {
    const r = await Storage.get();
    if (r.ok) {
      State.data = r.payload;
      State.lastServerAt = r.at;
      renderAll();
    }
    startAutoSync();
  });

  /* =========================
     EXPOSE
  ========================= */
  window.LEADCORE = {
    saveState,
    State
  };
})();
