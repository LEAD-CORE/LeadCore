/* LEAD CORE • Premium CRM
   מבנה מודולרי כדי שלא “ידרוס” קוד בעת הוספת פיצ’רים.
*/
(() => {
  "use strict";

  // ---------------------------
  // Utilities
  // ---------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  // Safe event binding
  const on = (el, evt, fn, opts) => { if (el && el.addEventListener) el.addEventListener(evt, fn, opts); };

  const nowISO = () => new Date().toISOString();
  const fmtMoney = (n) => {
    const x = Number(n || 0);
    return "₪" + x.toLocaleString("he-IL");
  };

  const safeTrim = (v) => String(v ?? "").trim();
  const uid = () => "c_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);

  // ---------------------------
  // State Model
  // ---------------------------
  const defaultState = () => ({
    meta: { updatedAt: null },
    customers: [],
    activity: [
      { at: nowISO(), text: "ברוך הבא ל-LEAD CORE. הוסף לקוח כדי להתחיל." }
    ]
  });

  const State = {
    data: defaultState(),
    set(next) {
      this.data = next;
      this.data.meta ||= {};
      this.data.meta.updatedAt = nowISO();
    }
  };

  // ---------------------------
  // Storage Layer (Local + Google Sheets)
  // ---------------------------
  const Storage = {
    mode: "local", // "local" | "sheets"
    gsUrl: "",

    localKey: "LEAD_CORE_STATE_V1",

    loadLocal() {
      const raw = localStorage.getItem(this.localKey);
      if (!raw) return defaultState();
      try {
        const parsed = JSON.parse(raw);
        return normalizeState(parsed);
      } catch {
        return defaultState();
      }
    },

    saveLocal(state) {
      localStorage.setItem(this.localKey, JSON.stringify(state));
      return { ok: true, at: nowISO() };
    },

    async loadSheets() {
      if (!this.gsUrl) return { ok: false, error: "אין כתובת Web App" };

      const url = new URL(this.gsUrl);
      url.searchParams.set("action", "get");

      const res = await fetch(url.toString(), { method: "GET" });
      const json = await res.json();

      if (!json || json.ok !== true) return { ok: false, error: "שגיאת get" };

      const payload = normalizeState(json.payload || {});
      return { ok: true, payload, at: json.at || nowISO() };
    },

    async saveSheets(state) {
      if (!this.gsUrl) return { ok: false, error: "אין כתובת Web App" };

      // אנחנו שולחים POST עם JSON כדי לשמור ל-Sheet (action=put)
      const url = new URL(this.gsUrl);
      url.searchParams.set("action", "put");

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ payload: state })
      });

      const json = await res.json();
      if (!json || json.ok !== true) return { ok: false, error: "שגיאת put" };
      return { ok: true, at: json.at || nowISO() };
    },

    async load() {
      if (this.mode === "sheets") return this.loadSheets();
      return { ok: true, payload: this.loadLocal(), at: nowISO() };
    },

    async save(state) {
      if (this.mode === "sheets") return this.saveSheets(state);
      return this.saveLocal(state);
    }
  };

  function normalizeState(s) {
    const base = defaultState();
    const out = {
      meta: { ...(s?.meta || {}) },
      customers: Array.isArray(s?.customers) ? s.customers : [],
      activity: Array.isArray(s?.activity) ? s.activity : base.activity
    };
    // normalize customer objects
    out.customers = out.customers.map((c) => ({
      id: safeTrim(c.id) || uid(),
      firstName: safeTrim(c.firstName),
      lastName: safeTrim(c.lastName),
      phone: safeTrim(c.phone),
      idNumber: safeTrim(c.idNumber),
      monthlyPremium: Number(c.monthlyPremium || 0),
      notes: safeTrim(c.notes),
      createdAt: safeTrim(c.createdAt) || nowISO(),
      updatedAt: safeTrim(c.updatedAt) || nowISO()
    }));
    return out;
  }

  // ---------------------------
  // UI + Navigation
  // ---------------------------
  const UI = {
    els: {},

    init() {
      this.els.pageTitle = $("#pageTitle");
      this.els.customersSearch = $("#customersSearch");
      this.els.customersTbody = $("#customersTbody");

      this.els.kpiCustomers = $("#kpiCustomers");
      this.els.kpiPremium = $("#kpiPremium");
      this.els.kpiUpdated = $("#kpiUpdated");
      this.els.activityFeed = $("#activityFeed");

      this.els.syncDot = $("#syncDot");
      this.els.syncText = $("#syncText");
      this.els.lastSyncText = $("#lastSyncText");

      // Modals / Drawer
      this.els.modalCustomer = $("#modalCustomer");
      this.els.customerForm = $("#customerForm");
      this.els.drawerCustomer = $("#drawerCustomer");

      this.els.drawerTitle = $("#drawerTitle");
      this.els.drawerPremium = $("#drawerPremium");
      this.els.drawerName = $("#drawerName");
      this.els.drawerPhone = $("#drawerPhone");
      this.els.drawerId = $("#drawerId");
      this.els.drawerNotes = $("#drawerNotes");
      this.els.btnSaveCustomer = $("#btnSaveCustomer");

      // Settings
      this.els.modeLocal = $("#modeLocal");
      this.els.modeSheets = $("#modeSheets");
      this.els.gsUrl = $("#gsUrl");
      this.els.btnTestConn = $("#btnTestConn");
      this.els.btnSyncNow = $("#btnSyncNow");
      this.els.btnResetLocal = $("#btnResetLocal");

      // Topbar
      $("#btnNewCustomer").addEventListener("click", () => this.openModal());

      // Nav
      $$(".nav__item").forEach(btn => {
        btn.addEventListener("click", () => this.goView(btn.dataset.view));
      });

      // Close handlers
      $$("[data-close='1']").forEach(el => {
        el.addEventListener("click", () => this.closeOverlays());
      });

      // Search

// globalSearch input -> filter customers list live (customers view)
// globalSearch-live
      on(this.els.globalSearch, "input", () => {
  if (!document.body.classList.contains("view-customers-active")) return;
  this.renderCustomers();
});
      if (this.els.customersSearch) this.els.customersSearch.addEventListener("input", () => this.renderCustomers());

      // Form submit
      this.els.customerForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(this.els.customerForm);
        const customer = {
          id: uid(),
          firstName: safeTrim(fd.get("firstName")),
          lastName: safeTrim(fd.get("lastName")),
          phone: safeTrim(fd.get("phone")),
          idNumber: safeTrim(fd.get("idNumber")),
          monthlyPremium: 0,
          notes: "",
          createdAt: nowISO(),
          updatedAt: nowISO()
        };

        if (!customer.firstName || !customer.lastName || !customer.phone) {
          alert("נא למלא שם פרטי, שם משפחה וטלפון.");
          return;
        }

        State.data.customers.unshift(customer);
        State.data.activity.unshift({ at: nowISO(), text: `נוצר לקוח חדש: ${customer.firstName} ${customer.lastName}` });
        State.data.meta.updatedAt = nowISO();

        await App.save("נשמר לקוח");
        this.closeModal();
        this.openDrawer(customer.id);
        this.renderAll();
      });

      // Drawer save
      this.els.btnSaveCustomer.addEventListener("click", async () => {
        await App.save("נשמר תיק לקוח");
        alert("נשמר ✔");
        this.renderAll();
      });

      // Settings
      this.els.modeLocal.addEventListener("click", () => App.setMode("local"));
      this.els.modeSheets.addEventListener("click", () => App.setMode("sheets"));

      this.els.gsUrl.addEventListener("change", () => {
        Storage.gsUrl = safeTrim(this.els.gsUrl.value);
        localStorage.setItem("LEAD_CORE_GS_URL", Storage.gsUrl);
      });

      this.els.btnTestConn.addEventListener("click", async () => {
        const r = await App.testConnection();
        alert(r.ok ? "חיבור תקין ✔" : ("חיבור נכשל: " + (r.error || "שגיאה")));
      });

      this.els.btnSyncNow.addEventListener("click", async () => {
        const r = await App.syncNow();
        alert(r.ok ? "סנכרון בוצע ✔" : ("סנכרון נכשל: " + (r.error || "שגיאה")));
      });

      this.els.btnResetLocal.addEventListener("click", () => {
        if (!confirm("לאפס את ה-Local?")) return;
        localStorage.removeItem(Storage.localKey);
        State.set(defaultState());
        this.renderAll();
        alert("אופס Local בוצע.");
      });
    },

    goView(view) {
      // set active button
      $$(".nav__item").forEach(b => b.classList.toggle("is-active", b.dataset.view === view));
      // show view
      $$(".view").forEach(v => v.classList.remove("is-visible"));
      const el = $("#view-" + view);
      if (el) el.classList.add("is-visible");

      const titles = {
        dashboard: "דשבורד",
        customers: "לקוחות",
        esign: "החתמת לקוח",
        settings: "הגדרות מערכת"
      };
      this.els.pageTitle.textContent = titles[view] || "LEAD CORE";

      // show top search only on Customers view
      document.body.classList.toggle("view-customers-active", view === "customers");
    },

    openModal() {
      this.els.customerForm.reset();
      this.els.modalCustomer.classList.add("is-open");
      this.els.modalCustomer.setAttribute("aria-hidden", "false");
      // focus first input
      setTimeout(() => this.els.customerForm.querySelector("input[name='firstName']").focus(), 50);
    },

    closeModal() {
      this.els.modalCustomer.classList.remove("is-open");
      this.els.modalCustomer.setAttribute("aria-hidden", "true");
    },

    openDrawer(customerId) {
      const c = State.data.customers.find(x => x.id === customerId);
      if (!c) return;

      this.els.drawerTitle.textContent = `${c.firstName} ${c.lastName}`;
      this.els.drawerPremium.textContent = fmtMoney(c.monthlyPremium);
      this.els.drawerName.textContent = `${c.firstName} ${c.lastName}`;
      this.els.drawerPhone.textContent = c.phone || "—";
      this.els.drawerId.textContent = c.idNumber || "—";
      this.els.drawerNotes.textContent = c.notes || "—";

      // store "current"
      this.els.drawerCustomer.dataset.customerId = c.id;

      this.els.drawerCustomer.classList.add("is-open");
      this.els.drawerCustomer.setAttribute("aria-hidden", "false");
    },

    closeDrawer() {
      this.els.drawerCustomer.classList.remove("is-open");
      this.els.drawerCustomer.setAttribute("aria-hidden", "true");
      this.els.drawerCustomer.dataset.customerId = "";
    },

    closeOverlays() {
      this.closeModal();
      this.closeDrawer();
    },

    renderAll() {
      this.renderDashboard();
      this.renderCustomers();
      this.renderSyncStatus();
    },

    renderDashboard() {
      const customers = State.data.customers;
      const totalPremium = customers.reduce((sum, c) => sum + Number(c.monthlyPremium || 0), 0);

      this.els.kpiCustomers.textContent = String(customers.length);
      this.els.kpiPremium.textContent = fmtMoney(totalPremium);

      const updatedAt = State.data.meta.updatedAt;
      this.els.kpiUpdated.textContent = updatedAt ? new Date(updatedAt).toLocaleString("he-IL") : "—";

      // activity
      const items = (State.data.activity || []).slice(0, 6).map(ev => {
        const time = new Date(ev.at).toLocaleString("he-IL");
        return `
          <div class="event">
            <div class="event__dot"></div>
            <div>
              <div class="event__text">${escapeHtml(ev.text)}</div>
              <div class="event__time">${time}</div>
            </div>
          </div>
        `;
      }).join("");

      this.els.activityFeed.innerHTML = items || `<div class="muted">אין פעילות</div>`;
    },

    renderCustomers() {
  const q = safeTrim((this.els.globalSearch && this.els.globalSearch.value) || "").toLowerCase();

  // score customers by relevance
  const scored = State.data.customers.map(c => {
    const hay = `${c.firstName} ${c.lastName} ${c.phone} ${c.idNumber}`.toLowerCase();
    let score = 0;
    if (!q) score = 0;
    else if (hay.startsWith(q)) score = 100;
    else if (hay.includes(q)) score = 50;
    return { c, score };
  });

  // sort: best match first, keep original order otherwise
  scored.sort((a,b) => b.score - a.score);

  const list = q ? scored.filter(x => x.score > 0).map(x => x.c) : scored.map(x => x.c);

  this.els.customersTbody.innerHTML = list.map(c => `
    <tr>
      <td>${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</td>
      <td>${escapeHtml(c.phone || "")}</td>
      <td>${escapeHtml(c.idNumber || "")}</td>
      <td><span class="badge">${fmtMoney(c.monthlyPremium)}</span></td>
      <td style="text-align:left">
        <button class="btn" data-open="${c.id}">פתח תיק</button>
      </td>
    </tr>
  `).join("") || `
    <tr><td colspan="5" class="muted" style="padding:18px">אין תוצאות</td></tr>
  `;

  // bind open buttons
  $$("button[data-open]", this.els.customersTbody).forEach(btn => {
    on(btn, "click", () => this.openDrawer(btn.dataset.open));
  });
});

      this.els.customersTbody.innerHTML = list.map(c => `
        <tr>
          <td>${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</td>
          <td>${escapeHtml(c.phone || "")}</td>
          <td>${escapeHtml(c.idNumber || "")}</td>
          <td><span class="badge">${fmtMoney(c.monthlyPremium)}</span></td>
          <td style="text-align:left">
            <button class="btn" data-open="${c.id}">פתח תיק</button>
          </td>
        </tr>
      `).join("") || `
        <tr><td colspan="5" class="muted" style="padding:18px">אין לקוחות להצגה</td></tr>
      `;

      // bind open buttons
      $$("button[data-open]", this.els.customersTbody).forEach(btn => {
        btn.addEventListener("click", () => this.openDrawer(btn.dataset.open));
      });
    },

    renderSyncStatus() {
      const dot = this.els.syncDot;
      const txt = this.els.syncText;
      const last = this.els.lastSyncText;

      const modeLabel = Storage.mode === "sheets" ? "Google Sheets" : "Local";
      txt.textContent = `מצב: ${modeLabel}`;

      dot.classList.remove("ok","warn","err");
      if (Storage.mode === "local") dot.classList.add("ok");
      else {
        if (Storage.gsUrl) dot.classList.add("ok");
        else dot.classList.add("warn");
      }

      const updatedAt = State.data.meta.updatedAt;
      last.textContent = updatedAt ? ("עודכן: " + new Date(updatedAt).toLocaleString("he-IL")) : "לא סונכרן עדיין";
    }
  };

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  // ---------------------------
  // App Controller
  // ---------------------------
  const App = {
    async boot() {
      // restore settings
      Storage.gsUrl = localStorage.getItem("LEAD_CORE_GS_URL") || "";
      Storage.mode = localStorage.getItem("LEAD_CORE_MODE") || "local";
      UI.els.gsUrl.value = Storage.gsUrl;

      UI.els.modeLocal.classList.toggle("is-active", Storage.mode === "local");
      UI.els.modeSheets.classList.toggle("is-active", Storage.mode === "sheets");

      // load
      const r = await Storage.load();
      if (r.ok) {
        State.set(r.payload);
      } else {
        // fallback local
        State.set(Storage.loadLocal());
        State.data.activity.unshift({ at: nowISO(), text: "המערכת עלתה ב-Local (בעיה בחיבור ל-Sheets)." });
      }

      UI.renderAll();
      UI.goView("dashboard");
    },

    async save(activityText) {
      State.data.meta.updatedAt = nowISO();
      if (activityText) State.data.activity.unshift({ at: nowISO(), text: activityText });

      // If drawer open, update from "current" (we keep it simple now; later we'll add editing fields)
      const currentId = UI.els.drawerCustomer.dataset.customerId;
      if (currentId) {
        // keep updatedAt for the customer
        const c = State.data.customers.find(x => x.id === currentId);
        if (c) c.updatedAt = nowISO();
      }

      const r = await Storage.save(State.data);
      if (!r.ok) {
        State.data.activity.unshift({ at: nowISO(), text: "שמירה נכשלה (בדוק חיבור/URL)." });
      }
      UI.renderSyncStatus();
      return r;
    },

    async setMode(mode) {
      Storage.mode = mode;
      localStorage.setItem("LEAD_CORE_MODE", mode);

      UI.els.modeLocal.classList.toggle("is-active", mode === "local");
      UI.els.modeSheets.classList.toggle("is-active", mode === "sheets");

      UI.renderSyncStatus();

      // אופציונלי: כשעוברים ל-Sheets נטען מהענן ישר
      if (mode === "sheets") {
        const r = await Storage.loadSheets();
        if (r.ok) {
          State.set(r.payload);
          await Storage.saveLocal(State.data); // backup local
          UI.renderAll();
          State.data.activity.unshift({ at: nowISO(), text: "נטען מ-Google Sheets" });
          UI.renderDashboard();
        } else {
          alert("לא ניתן לטעון מ-Sheets: " + (r.error || "שגיאה"));
        }
      }
    },

    async testConnection() {
      if (!Storage.gsUrl) return { ok: false, error: "אין URL" };
      try {
        const r = await Storage.loadSheets();
        return r.ok ? { ok: true } : r;
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    },

    async syncNow() {
      // Strategy:
      // 1) Load from Sheets (if ok) -> set state
      // 2) Save current state back (ensures schema)
      if (Storage.mode !== "sheets") return { ok: false, error: "עבור למצב Google Sheets קודם" };
      try {
        const r1 = await Storage.loadSheets();
        if (!r1.ok) return r1;

        State.set(r1.payload);
        const r2 = await Storage.saveSheets(State.data);
        if (!r2.ok) return r2;

        await Storage.saveLocal(State.data); // local backup
        UI.renderAll();
        return { ok: true };
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    }
  };

  // ---------------------------
  // Boot
  // ---------------------------
  document.addEventListener("DOMContentLoaded", async () => {
    try {
      UI.init();
      await App.boot();
    } catch (e) {
      console.error("LEAD_CORE boot error:", e);
      alert("שגיאה בעליית המערכת. פתח קונסול (F12) לפרטים.");
    }
  });

  // Expose a minimal namespace for debugging without polluting global scope too much
  window.LEAD_CORE = { App, State, Storage, UI };
})();
