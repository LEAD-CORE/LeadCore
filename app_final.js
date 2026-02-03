/* LEAD CORE • Final • Sheets-only build 20260203
   מצב עבודה: Google Sheets בלבד (בלי Local).
   דורש Apps Script Web App שתומך ב:
     GET  ?action=ping|get
     POST ?action=put  (body: {payload: <state>})
*/
(() => {
  "use strict";

  // ---------------------------
  // Silent UX helpers (no popups / no toasts)
  // ---------------------------
  const notify = (msg, level="info") => {
    try {
      const tag = level ? String(level).toUpperCase() : "INFO";
      console[tag === "ERROR" ? "error" : tag === "WARN" ? "warn" : "log"](`[LeadCore] ${msg}`);
    } catch(_) {}
  };

  const showToast = () => {}; // no-op

  // ---------------------------
  // Utilities
  // ---------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, evt, fn, opts) => { if (el && el.addEventListener) el.addEventListener(evt, fn, opts); };

  const nowISO = () => new Date().toISOString();
  const fmtMoney = (n) => {
    const x = Number(n || 0);
    return "₪" + x.toLocaleString("he-IL");
  };
  const safeTrim = (v) => String(v ?? "").trim();
  const uid = () => "c_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);

  const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycbwHDJlsn3TiTrPXpIVdOc9b0sy7cIlkF9cQnKJ4__19vvr-OUjvwzpEuSFhSBEItjB9Iw/exec";
  const LS_KEY_URL = "LEAD_CORE_GS_URL";
  const LS_KEY_STATE_BACKUP = "LEAD_CORE_STATE_BACKUP_V1";

  // ---------------------------
  // State Model
  // ---------------------------
  const defaultState = () => ({
    meta: { updatedAt: null },
    agents: [
      { id: "a_yuval", name: "יובל מנדלסון" }
    ],
    customers: [],
    activity: [
      { at: nowISO(), text: "ברוך הבא ל-LEAD CORE. הוסף לקוח כדי להתחיל." }
    ]
  });

  const State = {
    data: defaultState(),
    set(next) {
      this.data = normalizeState(next);
      this.data.meta ||= {};
      this.data.meta.updatedAt = nowISO();
    }
  };

  function normalizeState(s) {
    const base = defaultState();
    const out = {
      meta: { ...(s?.meta || {}) },
      agents: Array.isArray(s?.agents) ? s.agents : base.agents,
      customers: Array.isArray(s?.customers) ? s.customers : [],
      activity: Array.isArray(s?.activity) ? s.activity : base.activity
    };

    // agents
    out.agents = (out.agents || []).map((a, idx) => ({
      id: safeTrim(a?.id) || ("a_" + idx),
      name: safeTrim(a?.name) || "נציג"
    })).filter(a => a.name);

    if (out.agents.length === 0) out.agents = base.agents;

    // customers
    out.customers = (out.customers || []).map((c) => ({
      id: safeTrim(c?.id) || uid(),
      firstName: safeTrim(c?.firstName),
      lastName: safeTrim(c?.lastName),
      phone: safeTrim(c?.phone),
      idNumber: safeTrim(c?.idNumber),
      assignedAgent: safeTrim(c?.assignedAgent) || "",
      monthlyPremium: Number(c?.monthlyPremium || 0),
      notes: safeTrim(c?.notes),
      createdAt: safeTrim(c?.createdAt) || nowISO(),
      updatedAt: safeTrim(c?.updatedAt) || nowISO(),
      policies: Array.isArray(c?.policies) ? c.policies.map((p) => ({
        id: safeTrim(p?.id) || ("p_" + uid()),
        type: safeTrim(p?.type),
        company: safeTrim(p?.company),
        premium: Number(p?.premium || 0),
        status: safeTrim(p?.status) || "פעיל",
        renewAt: safeTrim(p?.renewAt)
      })) : []
    }));

    return out;
  }

  // ---------------------------
  // Storage Layer (Sheets-only + local backup)
  // ---------------------------
  const Storage = {
    gsUrl: "",

    loadBackup() {
      const raw = localStorage.getItem(LS_KEY_STATE_BACKUP);
      if (!raw) return null;
      try {
        return normalizeState(JSON.parse(raw));
      } catch {
        return null;
      }
    },

    saveBackup(state) {
      try {
        localStorage.setItem(LS_KEY_STATE_BACKUP, JSON.stringify(state));
      } catch(_) {}
    },

    async ping() {
      if (!this.gsUrl) return { ok:false, error:"אין כתובת Web App" };
      const url = new URL(this.gsUrl);
      url.searchParams.set("action", "ping");
      const res = await fetch(url.toString(), { method:"GET" });
      const json = await res.json().catch(() => null);
      if (!json || json.ok !== true) return { ok:false, error: json?.error || "ping failed" };
      return { ok:true };
    },

    async get() {
      if (!this.gsUrl) return { ok:false, error:"אין כתובת Web App" };
      const url = new URL(this.gsUrl);
      url.searchParams.set("action", "get");
      const res = await fetch(url.toString(), { method:"GET" });
      const json = await res.json().catch(() => null);
      if (!json || json.ok !== true) return { ok:false, error: json?.error || "get failed" };
      const payload = normalizeState(json.payload || {});
      return { ok:true, payload, at: json.at || nowISO() };
    },

    async put(state) {
      if (!this.gsUrl) return { ok:false, error:"אין כתובת Web App" };
      const url = new URL(this.gsUrl);
      url.searchParams.set("action", "put");

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ payload: state })
      });

      const json = await res.json().catch(() => null);
      if (!json || json.ok !== true) return { ok:false, error: json?.error || "put failed" };

      // אימות מינימלי: לוודא שחוזר at או serverUpdatedAt
      const at = json.at || json.serverUpdatedAt || nowISO();
      return { ok:true, at };
    },

    // Full save with verification (put ואז get קצר)
    async saveVerified(state) {
      const r1 = await this.put(state);
      if (!r1.ok) return r1;

      // best-effort verification: load back once
      const r2 = await this.get();
      if (!r2.ok) {
        // שמרנו אבל אימות נכשל – עדיין נסמן warn
        return { ok:true, at:r1.at, warn:true };
      }

      // אם חזר payload, נעדכן את ה-state המקומי עם מה שבענן (מקבע סכימה)
      return { ok:true, at:r2.at, payload:r2.payload };
    }
  };

  // ---------------------------
  // UI
  // ---------------------------
  const UI = {
    els: {},

    init() {
      this.els.pageTitle = $("#pageTitle");
      this.els.customersTbody = $("#customersTbody");
      this.els.globalSearch = $("#globalSearch");
      this.els.btnSearch = $("#btnSearch");

      this.els.kpiCustomers = $("#kpiCustomers");
      this.els.kpiPremium = $("#kpiPremium");
      this.els.kpiUpdated = $("#kpiUpdated");
      this.els.activityFeed = $("#activityFeed");

      this.els.syncDot = $("#syncDot");
      this.els.syncText = $("#syncText");
      this.els.lastSyncText = $("#lastSyncText");

      // Modals
      this.els.modalCustomer = $("#modalCustomer");
      this.els.customerForm = $("#customerForm");
      this.els.newAssignedAgent = $("#newAssignedAgent");

      // Customer Full Screen
      this.els.customerFull = $("#customerFull");
      this.els.cfName = $("#cfName");
      this.els.cfPhone = $("#cfPhone");
      this.els.cfId = $("#cfId");
      this.els.cfTotalPremium = $("#cfTotalPremium");
      this.els.cfActiveCount = $("#cfActiveCount");
      this.els.cfAgentSelect = $("#cfAgentSelect");
      this.els.cfAddCompany = $("#cfAddCompany");
      this.els.cfAddType = $("#cfAddType");
      this.els.cfAddPremium = $("#cfAddPremium");
      this.els.cfAddRenew = $("#cfAddRenew");
      this.els.btnAddPolicyInline = $("#btnAddPolicyInline");
      this.els.cfPoliciesTbody = $("#cfPoliciesTbody");
      this.els.cfFilteredTotal = $("#cfFilteredTotal");

      // Settings (URL only)
      this.els.gsUrl = $("#gsUrl");
      this.els.btnTestConn = $("#btnTestConn");
      this.els.btnSyncNow = $("#btnSyncNow");

      // Topbar
      on($("#btnNewCustomer"), "click", () => this.openModal());

      // Nav
      $$(".nav__item").forEach(btn => {
        on(btn, "click", () => this.goView(btn.dataset.view));
      });

      // Close handlers
      $$("[data-close='1']").forEach(el => {
        on(el, "click", () => this.closeOverlays());
      });

      // Search
      on(this.els.globalSearch, "input", () => {
        if (!document.body.classList.contains("view-customers-active")) return;
        this.renderCustomers();
      });

      on(this.els.btnSearch, "click", () => {
        this.goView("customers");
        this.renderCustomers();
      });

      // New customer submit
      on(this.els.customerForm, "submit", async (e) => {
        e.preventDefault();
        const fd = new FormData(this.els.customerForm);

        const customer = {
          id: uid(),
          firstName: safeTrim(fd.get("firstName")),
          lastName: safeTrim(fd.get("lastName")),
          phone: safeTrim(fd.get("phone")),
          idNumber: safeTrim(fd.get("idNumber")),
          assignedAgent: safeTrim(fd.get("assignedAgent")),
          monthlyPremium: 0,
          notes: "",
          policies: [],
          createdAt: nowISO(),
          updatedAt: nowISO()
        };

        if (!customer.firstName || !customer.lastName || !customer.phone) {
          notify("נא למלא שם פרטי, שם משפחה וטלפון.", "warn");
          return;
        }

        // default agent
        if (!customer.assignedAgent) {
          const fallback = (State.data.agents && State.data.agents[0]) ? State.data.agents[0].name : "";
          customer.assignedAgent = fallback;
        }

        State.data.customers.unshift(customer);
        State.data.activity.unshift({ at: nowISO(), text: `נוצר לקוח חדש: ${customer.firstName} ${customer.lastName}` });
        State.data.meta.updatedAt = nowISO();

        const r = await App.save("נשמר לקוח");
        if (r.ok) {
          this.closeModal();
          this.openCustomerFull(customer.id);
        }
        this.renderAll();
      });

      // Add policy inline
      on(this.els.btnAddPolicyInline, "click", async () => {
        const id = safeTrim(this.els.customerFull?.dataset?.customerId);
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;

        const company = safeTrim(this.els.cfAddCompany?.value);
        const type = safeTrim(this.els.cfAddType?.value);
        const premium = Number(String(this.els.cfAddPremium?.value || "").replace(/[^\d.]/g, "")) || 0;
        const renewAt = safeTrim(this.els.cfAddRenew?.value);

        if (!company || !type || !premium) {
          notify("נא לבחור חברה, סוג ביטוח ולהכניס פרמיה חודשית.", "warn");
          return;
        }

        c.policies ||= [];
        c.policies.unshift({
          id: "p_" + uid(),
          type,
          company,
          premium,
          status: "פעיל",
          renewAt
        });

        try {
          if (this.els.cfAddCompany) this.els.cfAddCompany.selectedIndex = 0;
          if (this.els.cfAddType) this.els.cfAddType.selectedIndex = 0;
          if (this.els.cfAddPremium) this.els.cfAddPremium.value = "";
          if (this.els.cfAddRenew) this.els.cfAddRenew.value = "";
        } catch(_) {}

        c.updatedAt = nowISO();
        this.renderPolicies();
        const r = await App.save("נוסף ביטוח ללקוח");
        if (r.ok) this.renderAll();
      });

      // Change agent
      on(this.els.cfAgentSelect, "change", async () => {
        const id = safeTrim(this.els.customerFull?.dataset?.customerId);
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;
        const next = safeTrim(this.els.cfAgentSelect.value);
        if (!next || next === safeTrim(c.assignedAgent)) return;
        c.assignedAgent = next;
        c.updatedAt = nowISO();
        await App.save("עודכן נציג מטפל");
        this.renderAll();
      });

      // Settings: URL change
      on(this.els.gsUrl, "change", () => {
        Storage.gsUrl = safeTrim(this.els.gsUrl.value);
        localStorage.setItem(LS_KEY_URL, Storage.gsUrl);
        App.updateSyncUI();
      });

      on(this.els.btnTestConn, "click", async () => {
        const r = await App.testConnection();
        notify(r.ok ? "חיבור תקין ✔" : ("חיבור נכשל: " + (r.error || "שגיאה")), r.ok ? "info" : "error");
        App.updateSyncUI(r.ok ? "מחובר" : "לא מחובר");
      });

      on(this.els.btnSyncNow, "click", async () => {
        const r = await App.reloadFromSheets();
        notify(r.ok ? "נטען מה-Sheets ✔" : ("טעינה נכשלה: " + (r.error || "שגיאה")), r.ok ? "info" : "error");
        this.renderAll();
      });
    },

    goView(view) {
      $$(".nav__item").forEach(b => b.classList.toggle("is-active", b.dataset.view === view));
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
      document.body.classList.toggle("view-customers-active", view === "customers");
    },

    openModal() {
      this.els.customerForm.reset();
      if (this.els.newAssignedAgent) {
        this.els.newAssignedAgent.innerHTML = (State.data.agents || []).map(a =>
          `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`
        ).join("");
      }
      this.els.modalCustomer.classList.add("is-open");
      this.els.modalCustomer.setAttribute("aria-hidden", "false");
      setTimeout(() => {
        const el = this.els.customerForm.querySelector("input[name='firstName']");
        if (el) el.focus();
      }, 50);
    },

    closeModal() {
      this.els.modalCustomer.classList.remove("is-open");
      this.els.modalCustomer.setAttribute("aria-hidden", "true");
    },

    // Customer Full Screen
    openCustomerFull(customerId) {
      const c = State.data.customers.find(x => x.id === customerId);
      if (!c || !this.els.customerFull) return;

      this.els.customerFull.dataset.customerId = c.id;

      this.els.cfName.textContent = `${c.firstName} ${c.lastName}`.trim() || "—";
      this.els.cfPhone.textContent = c.phone || "—";
      this.els.cfId.textContent = c.idNumber || "—";

      // agent select
      if (this.els.cfAgentSelect) {
        this.els.cfAgentSelect.innerHTML = (State.data.agents || []).map(a =>
          `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`
        ).join("");

        const fallback = (State.data.agents && State.data.agents[0]) ? State.data.agents[0].name : "";
        if (!c.assignedAgent && fallback) c.assignedAgent = fallback;
        this.els.cfAgentSelect.value = c.assignedAgent || fallback || "";
      }

      // reset add bar
      try {
        if (this.els.cfAddCompany) this.els.cfAddCompany.selectedIndex = 0;
        if (this.els.cfAddType) this.els.cfAddType.selectedIndex = 0;
        if (this.els.cfAddPremium) this.els.cfAddPremium.value = "";
        if (this.els.cfAddRenew) this.els.cfAddRenew.value = "";
      } catch(_) {}

      this.renderPolicies();

      this.els.customerFull.classList.add("is-open");
      this.els.customerFull.setAttribute("aria-hidden", "false");
    },

    closeCustomerFull() {
      if (!this.els.customerFull) return;
      this.els.customerFull.classList.remove("is-open");
      this.els.customerFull.setAttribute("aria-hidden", "true");
      this.els.customerFull.dataset.customerId = "";
    },

    closeOverlays() {
      this.closeModal();
      this.closeCustomerFull();
    },

    renderAll() {
      this.renderDashboard();
      this.renderCustomers();
      this.renderSyncStatus();
    },

    renderDashboard() {
      const customers = State.data.customers || [];
      const totalPremium = customers.reduce((sum, c) => sum + Number(c.monthlyPremium || 0), 0);

      this.els.kpiCustomers.textContent = String(customers.length);
      this.els.kpiPremium.textContent = fmtMoney(totalPremium);

      const updatedAt = State.data.meta?.updatedAt;
      this.els.kpiUpdated.textContent = updatedAt ? new Date(updatedAt).toLocaleString("he-IL") : "—";

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

      const scored = (State.data.customers || []).map((c, idx) => {
        const name = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
        const phone = String(c.phone || "").toLowerCase();
        const idn = String(c.idNumber || "").toLowerCase();
        const hay = `${name} ${phone} ${idn}`.trim();

        let score = 0;
        if (q) {
          if (name.startsWith(q) || phone.startsWith(q) || idn.startsWith(q)) score = 300;
          else if (hay.includes(q)) score = 200;
        }
        return { c, idx, score };
      });

      scored.sort((a, b) => (b.score - a.score) || (a.idx - b.idx));
      const list = scored.map(x => x.c);

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

      $$("button[data-open]", this.els.customersTbody).forEach(btn => {
        on(btn, "click", () => this.openCustomerFull(btn.dataset.open));
      });
    },

    renderPolicies() {
      const id = safeTrim(this.els.customerFull?.dataset?.customerId);
      const c = (State.data.customers || []).find(x => x.id === id);
      if (!c) return;

      c.policies ||= [];
      const list = c.policies.slice();
      const total = list.reduce((s,p)=> s + Number(p.premium||0), 0);

      c.monthlyPremium = total;

      if (this.els.cfTotalPremium) this.els.cfTotalPremium.textContent = fmtMoney(total);
      if (this.els.cfActiveCount) this.els.cfActiveCount.textContent = String(list.length);
      if (this.els.cfFilteredTotal) this.els.cfFilteredTotal.textContent = fmtMoney(total);

      if (!this.els.cfPoliciesTbody) return;

      this.els.cfPoliciesTbody.innerHTML = list.map(p => {
        const d = safeTrim(p.renewAt);
        const renew = d ? new Date(d).toLocaleDateString("he-IL") : "—";
        return `
          <tr>
            <td>${escapeHtml(p.type || "")}</td>
            <td>${escapeHtml(p.company || "")}</td>
            <td><span class="badge">${fmtMoney(p.premium)}</span></td>
            <td>${escapeHtml(renew)}</td>
            <td style="text-align:left">
              <button class="btn btn--danger" data-delpol="${escapeHtml(p.id)}">מחק</button>
            </td>
          </tr>
        `;
      }).join("") || `
        <tr><td colspan="5" class="muted" style="padding:18px">אין ביטוחים להצגה</td></tr>
      `;

      $$("button[data-delpol]", this.els.cfPoliciesTbody).forEach(btn => {
        on(btn, "click", async () => {
          const pid = btn.dataset.delpol;
          c.policies = (c.policies || []).filter(x => x.id !== pid);
          c.updatedAt = nowISO();
          this.renderPolicies();
          await App.save("נמחק ביטוח מהלקוח");
          this.renderAll();
        });
      });
    },

    renderSyncStatus(labelOverride) {
      const dot = this.els.syncDot;
      const txt = this.els.syncText;
      const last = this.els.lastSyncText;

      txt.textContent = "מצב: Google Sheets";
      dot.classList.remove("ok","warn","err");

      if (!Storage.gsUrl) {
        dot.classList.add("err");
        last.textContent = "אין URL של Web App";
        return;
      }

      dot.classList.add("ok");

      const updatedAt = State.data.meta?.updatedAt;
      const base = updatedAt ? ("עודכן: " + new Date(updatedAt).toLocaleString("he-IL")) : "לא סונכרן עדיין";
      last.textContent = labelOverride ? `${labelOverride} • ${base}` : base;
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
      // URL: localStorage -> DEFAULT
      Storage.gsUrl = localStorage.getItem(LS_KEY_URL) || DEFAULT_GS_URL;
      if (UI.els.gsUrl) UI.els.gsUrl.value = Storage.gsUrl;

      // נסה לטעון מה-Sheets. אם לא מצליח -> טען backup מקומי (רק לקריאה/הצגה) כדי שלא “יראה מת”
      const r = await Storage.get();
      if (r.ok) {
        State.set(r.payload);
        Storage.saveBackup(State.data);
        UI.renderAll();
        UI.renderSyncStatus("מחובר");
      } else {
        const b = Storage.loadBackup();
        if (b) {
          State.set(b);
          State.data.activity.unshift({ at: nowISO(), text: "נטען מגיבוי מקומי (בעיה בחיבור ל-Sheets)." });
        } else {
          State.set(defaultState());
          State.data.activity.unshift({ at: nowISO(), text: "המערכת עלתה ללא נתונים (בדוק חיבור ל-Sheets)." });
        }
        UI.renderAll();
        UI.renderSyncStatus("לא מחובר");
        notify("בעיה בטעינת Sheets: " + (r.error || "שגיאה"), "error");
      }

      UI.goView("dashboard");
    },

    updateSyncUI(label) {
      UI.renderSyncStatus(label);
    },

    async reloadFromSheets() {
      const r = await Storage.get();
      if (!r.ok) {
        UI.renderSyncStatus("לא מחובר");
        return r;
      }
      State.set(r.payload);
      Storage.saveBackup(State.data);
      UI.renderAll();
      UI.renderSyncStatus("מחובר");
      return { ok:true };
    },

    async save(activityText) {
      if (!Storage.gsUrl) {
        notify("אין URL של Web App — השמירה נחסמה.", "error");
        UI.renderSyncStatus("אין URL");
        return { ok:false, error:"אין URL" };
      }

      State.data.meta ||= {};
      State.data.meta.updatedAt = nowISO();
      if (activityText) State.data.activity.unshift({ at: nowISO(), text: activityText });

      // Save verified
      const r = await Storage.saveVerified(State.data);
      if (!r.ok) {
        State.data.activity.unshift({ at: nowISO(), text: "שמירה נכשלה (בדוק Deploy / הרשאות / URL)." });
        UI.renderSyncStatus("שמירה נכשלה");
        return r;
      }

      // If verification returned payload, adopt it
      if (r.payload) {
        State.set(r.payload);
      }

      Storage.saveBackup(State.data);
      UI.renderSyncStatus(r.warn ? "נשמר (אימות חלקי)" : "נשמר");
      return { ok:true };
    },

    async testConnection() {
      try {
        return await Storage.ping();
      } catch (e) {
        return { ok:false, error:String(e?.message || e) };
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
      notify("שגיאה בעליית המערכת. פתח קונסול (F12) לפרטים.", "error");
    }
  });

  window.LEAD_CORE = { App, State, Storage, UI };
})();
