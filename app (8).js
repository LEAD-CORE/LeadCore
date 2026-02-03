/* LEAD CORE • Premium CRM (Sheets-only, locked URL)
   - Google Sheets only (no Local mode)
   - No popups/toasts (console only)
   - Robust: no missing-element crashes
   - Live sync across computers (polling)
*/
(() => {
  "use strict";

  // ===========================
  // CONFIG (LOCKED DEFAULT URL)
  // ===========================
  const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycbzIfQh5_eUCScWtQxbf8qS978mNB1VXj0WW6wAY3XCVlEDE_JV9gm-FL1T5UKZw5wDURA/exec";
  const LS_GS_URL_KEY = "LEAD_CORE_GS_URL"; // optional persistence (backup)
  const LS_LOCAL_BACKUP_KEY = "LEAD_CORE_STATE_V1_BACKUP";

  // ---------------------------
  // Silent UX helpers (no popups / no toasts)
  // ---------------------------
  const notify = (msg, level = "info") => {
    try {
      const tag = level ? String(level).toUpperCase() : "INFO";
      console[tag === "ERROR" ? "error" : tag === "WARN" ? "warn" : "log"](`[LeadCore] ${msg}`);
    } catch (_) {}
  };
  const showToast = () => {}; // no-op

  // ---------------------------
  // Utilities
  // ---------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const on = (el, evt, fn, opts) => { if (el && el.addEventListener) el.addEventListener(evt, fn, opts); };
  const nowISO = () => new Date().toISOString();
  const safeTrim = (v) => String(v ?? "").trim();
  const uid = () => "c_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
  const fmtMoney = (n) => {
    const x = Number(n || 0);
    return "₪" + x.toLocaleString("he-IL");
  };
  const escapeHtml = (s) => String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");


  // Policy status normalizer (keeps data consistent)
  const normPolicyStatus = (s) => {
    const v = safeTrim(s).toLowerCase();
    if (!v) return "active";
    if (v === "active" || v === "פעיל" || v === "פעילה") return "active";
    if (v === "cancelled" || v === "canceled" || v === "בוטל" || v === "ביטול") return "cancelled";
    if (v === "swapped" || v === "שוחלף" || v === "שחלוף") return "swapped";
    return v;
  };

  // ---------------------------
  // State Model
  // ---------------------------
  const defaultState = () => ({
    meta: { updatedAt: null },
    agents: [{ id: "a_yuval", name: "יובל מנדלסון" }],
    customers: [],
    activity: [{ at: nowISO(), text: "ברוך הבא ל-LEAD CORE. הוסף לקוח כדי להתחיל." }]
  });

  const State = {
    data: defaultState(),
    set(next) {
      const normalized = normalizeState(next);
      normalized.meta ||= {};
      normalized.meta.updatedAt = nowISO();
      this.data = normalized;
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

    if (!out.agents.length) out.agents = base.agents;

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
        status: normPolicyStatus(p?.status) || "active",
        renewAt: safeTrim(p?.renewAt)
      })) : []
    }));

    return out;
  }

  // ---------------------------
  // Storage Layer (Sheets-only) + Local Backup
  // ---------------------------
  const Storage = {
    mode: "sheets",
    gsUrl: DEFAULT_GS_URL,

    // local backup (for safety only)
    saveBackup(state) {
      try { localStorage.setItem(LS_LOCAL_BACKUP_KEY, JSON.stringify(state)); } catch (_) {}
    },
    loadBackup() {
      try {
        const raw = localStorage.getItem(LS_LOCAL_BACKUP_KEY);
        if (!raw) return null;
        return normalizeState(JSON.parse(raw));
      } catch (_) { return null; }
    },

    async loadSheets() {
      if (!this.gsUrl) return { ok: false, error: "אין כתובת Web App" };
      const url = new URL(this.gsUrl);
      url.searchParams.set("action", "get");
      const res = await fetch(url.toString(), { method: "GET" });
      const json = await res.json();
      if (!json || json.ok !== true) return { ok: false, error: "שגיאת get" };
      return { ok: true, payload: normalizeState(json.payload || {}), at: json.at || nowISO() };
    },

    async saveSheets(state) {
      if (!this.gsUrl) return { ok: false, error: "אין כתובת Web App" };
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

    // ---------------------------
    // Live Sync (polling)
    // ---------------------------
    _liveTimer: null,
    _busy: false,
    _lastRemoteAt: null,

    _isUiBusy() {
      try {
        return (
          (UI.els.modalCustomer && UI.els.modalCustomer.classList.contains("is-open")) ||
          (UI.els.drawerCustomer && UI.els.drawerCustomer.classList.contains("is-open")) ||
          (UI.els.customerFull && UI.els.customerFull.classList.contains("is-open")) ||
          (UI.els.modalPolicy && UI.els.modalPolicy.classList.contains("is-open"))
        );
      } catch (_) { return false; }
    },

    _applyRemote(payload, at) {
      State.data = normalizeState(payload || {});
      State.data.meta ||= {};
      if (!State.data.meta.updatedAt) State.data.meta.updatedAt = at || nowISO();
      this._lastRemoteAt = at || State.data.meta.updatedAt || nowISO();

      this.saveBackup(State.data);
      UI.renderAll();
      UI.renderSyncStatus("עודכן אוטומטית");
    },

    startLiveSync() {
      this.stopLiveSync();
      if (!this.gsUrl) return;

      this._lastRemoteAt = this._lastRemoteAt || (State.data.meta && State.data.meta.updatedAt) || null;

      this._liveTimer = setInterval(async () => {
        try {
          if (this._busy) return;
          if (this._isUiBusy()) return;

          const r = await this.loadSheets();
          if (!r || !r.ok) return;

          const remoteAt = r.at || (r.payload && r.payload.meta && r.payload.meta.updatedAt) || null;
          if (!remoteAt) return;
          if (this._lastRemoteAt && String(remoteAt) === String(this._lastRemoteAt)) return;

          this._applyRemote(r.payload, remoteAt);
        } catch (_) {}
      }, 4000);
    },

    stopLiveSync() {
      if (this._liveTimer) clearInterval(this._liveTimer);
      this._liveTimer = null;
    }
  };

  // ---------------------------
  // UI + Navigation
  // ---------------------------
  const UI = {
    els: {},

    init() {
      // core
      this.els.pageTitle = $("#pageTitle");
      this.els.customersTbody = $("#customersTbody");
      this.els.globalSearch = $("#globalSearch");
      this.els.btnSearch = $("#btnSearch");

      // dashboard
      this.els.kpiCustomers = $("#kpiCustomers");
      this.els.kpiPremium = $("#kpiPremium");
      this.els.kpiUpdated = $("#kpiUpdated");
      this.els.activityFeed = $("#activityFeed");

      // sync status
      this.els.syncDot = $("#syncDot");
      this.els.syncText = $("#syncText");
      this.els.lastSyncText = $("#lastSyncText");

      // modals / overlays
      this.els.modalCustomer = $("#modalCustomer");
      this.els.customerForm = $("#customerForm");
      this.els.newAssignedAgent = $("#newAssignedAgent");

      this.els.drawerCustomer = $("#drawerCustomer"); // may exist but not used now
      this.els.btnSaveCustomer = $("#btnSaveCustomer");

      // customer full
      this.els.customerFull = $("#customerFull");
      this.els.cfName = $("#cfName");
      this.els.cfPhone = $("#cfPhone");
      this.els.cfId = $("#cfId");
      this.els.cfNameLine = $("#cfNameLine");
      this.els.cfAddress = $("#cfAddress");
      this.els.cfEmail = $("#cfEmail");
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

      // policy modal
      this.els.modalPolicy = $("#modalPolicy");
      this.els.modalPolicyAction = $("#modalPolicyAction");
      this.els.policyActionTitle = $("#policyActionTitle");
      this.els.policyActionSub = $("#policyActionSub");
      this.els.btnPolicyActionConfirm = $("#btnPolicyActionConfirm");
      this.els.policyForm = $("#policyForm");

      // settings
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
      $$("[data-close='1']").forEach(el => on(el, "click", () => this.closeOverlays()));

      // Policy action confirm (cancel / swap)
      on(this.els.btnPolicyActionConfirm, "click", async () => {
        const action = safeTrim(this.els.modalPolicyAction?.dataset?.action);
        const pid = safeTrim(this.els.modalPolicyAction?.dataset?.policyId);
        if (!action || !pid) return;
        await this._applyPolicyAction(action, pid);
      });

      // Search (live filter on customers view)
      on(this.els.globalSearch, "input", () => {
        if (!document.body.classList.contains("view-customers-active")) return;
        this.renderCustomers();
      });
      on(this.els.btnSearch, "click", () => {
        this.goView("customers");
        this.renderCustomers();
      });

      // Form submit (new customer)
      on(this.els.customerForm, "submit", async (e) => {
        e.preventDefault();

        const fd = new FormData(this.els.customerForm);
        const fallbackAgent = (State.data.agents && State.data.agents[0]) ? State.data.agents[0].name : "";

        const customer = {
          id: uid(),
          firstName: safeTrim(fd.get("firstName")),
          lastName: safeTrim(fd.get("lastName")),
          phone: safeTrim(fd.get("phone")),
          idNumber: safeTrim(fd.get("idNumber")),
          assignedAgent: safeTrim(fd.get("assignedAgent")) || fallbackAgent || "",
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

        State.data.customers.unshift(customer);
        State.data.activity.unshift({ at: nowISO(), text: `נוצר לקוח חדש: ${customer.firstName} ${customer.lastName}` });
        State.data.meta.updatedAt = nowISO();

        const r = await App.save("נשמר לקוח");
        if (!r.ok) {
          notify("שמירה נכשלה: " + (r.error || "שגיאה"), "error");
          return;
        }

        this.closeModal();
        this.openCustomerFull(customer.id);
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
        c.policies.unshift({ id: "p_" + uid(), type, company, premium, status: "active", renewAt });

        // clear add bar
        try {
          if (this.els.cfAddCompany) this.els.cfAddCompany.selectedIndex = 0;
          if (this.els.cfAddType) this.els.cfAddType.selectedIndex = 0;
          if (this.els.cfAddPremium) this.els.cfAddPremium.value = "";
          if (this.els.cfAddRenew) this.els.cfAddRenew.value = "";
        } catch (_) {}

        c.updatedAt = nowISO();
        this.renderPolicies();

        const r = await App.save("נוסף ביטוח ללקוח");
        if (!r.ok) notify("שמירה נכשלה: " + (r.error || "שגיאה"), "error");
        this.renderAll();
      });

      // agent select change
      on(this.els.cfAgentSelect, "change", async () => {
        const id = safeTrim(this.els.customerFull?.dataset?.customerId);
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;
        const next = safeTrim(this.els.cfAgentSelect.value);
        if (next === safeTrim(c.assignedAgent)) return;
        c.assignedAgent = next;
        c.updatedAt = nowISO();
        const r = await App.save("עודכן נציג מטפל");
        if (!r.ok) notify("שמירה נכשלה: " + (r.error || "שגיאה"), "error");
        this.renderAll();
      });

      // Policy modal submit
      on(this.els.policyForm, "submit", async (e) => {
        e.preventDefault();

        const id = safeTrim(this.els.customerFull?.dataset?.customerId);
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;

        const fd = new FormData(this.els.policyForm);
        const type = safeTrim(fd.get("type"));
        const company = safeTrim(fd.get("company"));
        const premium = Number(String(fd.get("premium") || "").replace(/[^\d.]/g, "")) || 0;
        const renewAt = safeTrim(fd.get("renewAt"));

        if (!type || !company || !premium) {
          notify("נא למלא סוג, חברה ופרמיה.", "warn");
          return;
        }

        c.policies ||= [];
        c.policies.unshift({ id: "p_" + uid(), type, company, premium, status: "active", renewAt });
        c.updatedAt = nowISO();

        this.closePolicyModal();
      this.closePolicyActionModal();
        this.renderPolicies();

        const r = await App.save("נוסף ביטוח ללקוח");
        if (!r.ok) notify("שמירה נכשלה: " + (r.error || "שגיאה"), "error");
        this.renderAll();
      });

      // Settings actions
      if (this.els.gsUrl) {
        // locked display (still shown so you can copy)
        this.els.gsUrl.value = Storage.gsUrl;
        this.els.gsUrl.setAttribute("readonly", "readonly");

        // store as backup (not required for operation)
        try { localStorage.setItem(LS_GS_URL_KEY, Storage.gsUrl); } catch (_) {}
      }

      on(this.els.btnTestConn, "click", async () => {
        const r = await App.testConnection();
        notify(r.ok ? "חיבור תקין ✔" : ("חיבור נכשל: " + (r.error || "שגיאה")), r.ok ? "info" : "error");
        if (r.ok) UI.renderSyncStatus("חיבור תקין");
      });

      on(this.els.btnSyncNow, "click", async () => {
        const r = await App.syncNow();
        notify(r.ok ? "סנכרון בוצע ✔" : ("סנכרון נכשל: " + (r.error || "שגיאה")), r.ok ? "info" : "error");
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
      if (this.els.pageTitle) this.els.pageTitle.textContent = titles[view] || "LEAD CORE";

      document.body.classList.toggle("view-customers-active", view === "customers");
    },

    openModal() {
      if (!this.els.modalCustomer || !this.els.customerForm) return;
      this.els.customerForm.reset();

      // agents dropdown
      if (this.els.newAssignedAgent) {
        const agents = State.data.agents || [];
        this.els.newAssignedAgent.innerHTML = agents.map(a =>
          `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`
        ).join("");
      }

      this.els.modalCustomer.classList.add("is-open");
      this.els.modalCustomer.setAttribute("aria-hidden", "false");
      setTimeout(() => {
        try { this.els.customerForm.querySelector("input[name='firstName']")?.focus(); } catch (_) {}
      }, 50);
    },

    closeModal() {
      if (!this.els.modalCustomer) return;
      this.els.modalCustomer.classList.remove("is-open");
      this.els.modalCustomer.setAttribute("aria-hidden", "true");
    },

    openCustomerFull(customerId) {
      const c = State.data.customers.find(x => x.id === customerId);
      if (!c || !this.els.customerFull) return;

      this.els.customerFull.dataset.customerId = c.id;

      if (this.els.cfName) this.els.cfName.textContent = `${c.firstName} ${c.lastName}`.trim() || "—";
      if (this.els.cfNameLine) this.els.cfNameLine.textContent = `${c.firstName} ${c.lastName}`.trim() || "—";
      if (this.els.cfPhone) this.els.cfPhone.textContent = c.phone || "—";
      if (this.els.cfId) this.els.cfId.textContent = c.idNumber || "—";
      if (this.els.cfAddress) this.els.cfAddress.textContent = (c.address || c.city || "—");
      if (this.els.cfEmail) this.els.cfEmail.textContent = (c.email || "—");

      // agent select
      if (this.els.cfAgentSelect) {
        const agents = State.data.agents || [];
        this.els.cfAgentSelect.innerHTML = agents.map(a =>
          `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`
        ).join("");
        const fallback = agents[0]?.name || "";
        if (!c.assignedAgent && fallback) c.assignedAgent = fallback;
        this.els.cfAgentSelect.value = c.assignedAgent || fallback || "";
      }

      // reset add bar
      try {
        if (this.els.cfAddCompany) this.els.cfAddCompany.selectedIndex = 0;
        if (this.els.cfAddType) this.els.cfAddType.selectedIndex = 0;
        if (this.els.cfAddPremium) this.els.cfAddPremium.value = "";
        if (this.els.cfAddRenew) this.els.cfAddRenew.value = "";
      } catch (_) {}

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

    openPolicyModal() {
      if (!this.els.modalPolicy) return;
      this.els.policyForm?.reset?.();
      this.els.modalPolicy.classList.add("is-open");
      this.els.modalPolicy.setAttribute("aria-hidden", "false");
    },

    closePolicyModal() {
      if (!this.els.modalPolicy) return;
      this.els.modalPolicy.classList.remove("is-open");
      this.els.modalPolicy.setAttribute("aria-hidden", "true");
    },

    openPolicyActionModal(action, policyId, policyLabel) {
      if (!this.els.modalPolicyAction) return;
      this.els.modalPolicyAction.dataset.action = action || "";
      this.els.modalPolicyAction.dataset.policyId = policyId || "";
      if (this.els.policyActionTitle) {
        this.els.policyActionTitle.textContent = action === "cancel" ? "ביטול פוליסה" : "שחלוף פוליסה";
      }
      if (this.els.policyActionSub) {
        this.els.policyActionSub.textContent = policyLabel ? (`פוליסה: ${policyLabel}`) : "—";
      }
      if (this.els.btnPolicyActionConfirm) {
        this.els.btnPolicyActionConfirm.textContent = action === "cancel" ? "אישור ביטול" : "אישור שחלוף";
        this.els.btnPolicyActionConfirm.classList.toggle("btn--danger", action === "cancel");
        this.els.btnPolicyActionConfirm.classList.toggle("btn--primary", action !== "cancel");
      }
      this.els.modalPolicyAction.classList.add("is-open");
      this.els.modalPolicyAction.setAttribute("aria-hidden", "false");
    },

    closePolicyActionModal() {
      if (!this.els.modalPolicyAction) return;
      this.els.modalPolicyAction.classList.remove("is-open");
      this.els.modalPolicyAction.setAttribute("aria-hidden", "true");
      this.els.modalPolicyAction.dataset.action = "";
      this.els.modalPolicyAction.dataset.policyId = "";
    },

    async _applyPolicyAction(action, policyId) {
      const id = safeTrim(this.els.customerFull?.dataset?.customerId);
      const c = (State.data.customers || []).find(x => x.id === id);
      if (!c) return;

      const p = (c.policies || []).find(x => x.id === policyId);
      if (!p) return;

      if (action === "cancel") {
        p.status = "cancelled";
        p.cancelledAt = nowISO();
      } else if (action === "swap") {
        // mark old as swapped
        p.status = "swapped";
        p.swappedAt = nowISO();

        // clone new active policy (user can edit later)
        const neo = { ...p, id: "p_" + uid(), status: "active", createdAt: nowISO() };
        c.policies = [neo, ...(c.policies || [])];
      }

      c.updatedAt = nowISO();
      this.closePolicyActionModal();
      this.renderPolicies();

      const r = await App.save(action === "cancel" ? "בוטלה פוליסה" : "בוצע שחלוף פוליסה");
      if (!r.ok) notify("שמירה נכשלה: " + (r.error || "שגיאה"), "error");
      this.renderAll();
    },


    closeOverlays() {
      this.closeModal();
      this.closePolicyModal();
      this.closePolicyActionModal();
      this.closeCustomerFull();
      // drawer kept for compatibility
      try {
        if (this.els.drawerCustomer) {
          this.els.drawerCustomer.classList.remove("is-open");
          this.els.drawerCustomer.setAttribute("aria-hidden", "true");
        }
      } catch (_) {}
    },

    renderAll() {
      this.renderDashboard();
      this.renderCustomers();
      this.renderSyncStatus();
    },

    renderDashboard() {
      const customers = State.data.customers || [];
      const totalPremium = customers.reduce((sum, c) => sum + Number(c.monthlyPremium || 0), 0);

      if (this.els.kpiCustomers) this.els.kpiCustomers.textContent = String(customers.length);
      if (this.els.kpiPremium) this.els.kpiPremium.textContent = fmtMoney(totalPremium);

      const updatedAt = State.data.meta?.updatedAt;
      if (this.els.kpiUpdated) this.els.kpiUpdated.textContent = updatedAt ? new Date(updatedAt).toLocaleString("he-IL") : "—";

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

      if (this.els.activityFeed) this.els.activityFeed.innerHTML = items || `<div class="muted">אין פעילות</div>`;
    },

    renderCustomers() {
      if (!this.els.customersTbody) return;

      const q = safeTrim(this.els.globalSearch?.value || "").toLowerCase();

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
            <button class="btn" data-open="${escapeHtml(c.id)}">פתח תיק</button>
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
      const list = c.policies.slice().map(p => ({...p, status: normPolicyStatus(p.status)}));

      const active = list.filter(p => !p.status || p.status === "active");
      const total = active.reduce((s, p) => s + Number(p.premium || 0), 0);
      c.monthlyPremium = total;

      if (this.els.cfTotalPremium) this.els.cfTotalPremium.textContent = fmtMoney(total);
      if (this.els.cfActiveCount) this.els.cfActiveCount.textContent = String(active.length);
      
      if (!this.els.cfPoliciesTbody) return;

      this.els.cfPoliciesTbody.innerHTML = list.map(p => {
        const d = safeTrim(p.renewAt);
        const renew = d ? new Date(d).toLocaleDateString("he-IL") : "—";
        return `
          <tr>
            <td>${escapeHtml(p.type || "")}${(p.status && p.status!=="active") ? ('<div class="muted small">סטטוס: ' + escapeHtml(p.status==="cancelled"?"בוטל":"שוחלף") + '</div>') : ""}</td>
            <td>${escapeHtml(p.company || "")}</td>
            <td><span class="badge">${fmtMoney(p.premium)}</span></td>
            <td>${escapeHtml(renew)}</td>
            <td style="text-align:left">
              <button class="btn btn--danger" data-cancelpol="${escapeHtml(p.id)}">ביטול פוליסה</button>
              <button class="btn" data-swapol="${escapeHtml(p.id)}">שחלוף פוליסה</button>
            </td>
          </tr>
        `;
      }).join("") || `
        <tr><td colspan="5" class="muted" style="padding:18px">אין ביטוחים להצגה</td></tr>
      `;

      
      $$("button[data-cancelpol]", this.els.cfPoliciesTbody).forEach(btn => {
        on(btn, "click", () => {
          const pid = btn.dataset.cancelpol;
          const pol = (c.policies || []).find(x => x.id === pid);
          const label = pol ? `${pol.type || ""} • ${pol.company || ""}`.trim() : "";
          this.openPolicyActionModal("cancel", pid, label);
        });
      });

      $$("button[data-swapol]", this.els.cfPoliciesTbody).forEach(btn => {
        on(btn, "click", () => {
          const pid = btn.dataset.swapol;
          const pol = (c.policies || []).find(x => x.id === pid);
          const label = pol ? `${pol.type || ""} • ${pol.company || ""}`.trim() : "";
          this.openPolicyActionModal("swap", pid, label);
        });
      });
    },

    renderSyncStatus(extraText) {
      const dot = this.els.syncDot;
      const txt = this.els.syncText;
      const last = this.els.lastSyncText;

      if (txt) txt.textContent = "מצב: Google Sheets";
      if (dot) {
        dot.classList.remove("ok", "warn", "err");
        dot.classList.add(Storage.gsUrl ? "ok" : "err");
      }

      const updatedAt = State.data.meta?.updatedAt;
      const base = updatedAt ? ("עודכן: " + new Date(updatedAt).toLocaleString("he-IL")) : "לא סונכרן עדיין";
      if (last) last.textContent = (extraText ? (extraText + " • ") : "") + base;
    }
  };

  // ---------------------------
  // App Controller (Sheets-only)
  // ---------------------------
  const App = {
    async boot() {
      // locked URL first; if user previously saved a URL, keep it only if it looks valid
      let savedUrl = "";
      try { savedUrl = safeTrim(localStorage.getItem(LS_GS_URL_KEY)); } catch (_) {}

      // if savedUrl exists and looks like a script.google.com exec URL, use it; otherwise use default locked
      const looksLikeGs = (u) => /^https:\/\/script\.google\.com\/macros\/s\/.+\/exec/.test(String(u || ""));
      Storage.gsUrl = looksLikeGs(savedUrl) ? savedUrl : DEFAULT_GS_URL;

      // reflect in UI (readonly)
      if (UI.els.gsUrl) {
        UI.els.gsUrl.value = Storage.gsUrl;
        UI.els.gsUrl.setAttribute("readonly", "readonly");
      }

      // HARD RULE: must connect to Sheets. If fails, load backup but keep system in "needs connection"
      const r = await Storage.loadSheets();
      if (r.ok) {
        State.set(r.payload);
        // keep remote updatedAt as-is, but make sure meta exists
        State.data.meta ||= {};
        if (!State.data.meta.updatedAt) State.data.meta.updatedAt = r.at || nowISO();
        Storage._lastRemoteAt = r.at || State.data.meta.updatedAt || null;
        Storage.saveBackup(State.data);
        UI.renderSyncStatus("מחובר");
      } else {
        const b = Storage.loadBackup();
        if (b) {
          State.data = b;
          UI.renderSyncStatus("אין חיבור • מוצג גיבוי");
        } else {
          State.data = defaultState();
          UI.renderSyncStatus("אין חיבור");
        }
        State.data.activity.unshift({ at: nowISO(), text: "שגיאת חיבור ל-Google Sheets. בדוק Deploy/הרשאות/URL." });
      }

      UI.renderAll();
      UI.goView("dashboard");

      // start live sync
      Storage.startLiveSync();
    },

    async save(activityText) {
      // Block save if no URL
      if (!Storage.gsUrl) {
        return { ok: false, error: "אין URL ל-Web App" };
      }

      // stamp update
      State.data.meta ||= {};
      State.data.meta.updatedAt = nowISO();
      if (activityText) State.data.activity.unshift({ at: nowISO(), text: activityText });

      Storage._busy = true;
      try {
        const r = await Storage.saveSheets(State.data);
        if (r && r.ok) {
          Storage._lastRemoteAt = r.at || Storage._lastRemoteAt;
          Storage.saveBackup(State.data);
          UI.renderSyncStatus("נשמר ל-Sheets");
          return r;
        }
        UI.renderSyncStatus("שמירה נכשלה");
        return r || { ok: false, error: "שמירה נכשלה" };
      } catch (e) {
        UI.renderSyncStatus("שמירה נכשלה");
        return { ok: false, error: String(e?.message || e) };
      } finally {
        Storage._busy = false;
      }
    },

    async testConnection() {
      try {
        const r = await Storage.loadSheets();
        return r.ok ? { ok: true } : r;
      } catch (e) {
        return { ok: false, error: String(e?.message || e) };
      }
    },

    async syncNow() {
      try {
        const r1 = await Storage.loadSheets();
        if (!r1.ok) return r1;

        // take remote truth
        State.data = normalizeState(r1.payload);
        State.data.meta ||= {};
        if (!State.data.meta.updatedAt) State.data.meta.updatedAt = r1.at || nowISO();

        // write back to ensure schema (optional but useful)
        const r2 = await Storage.saveSheets(State.data);
        if (!r2.ok) return r2;

        Storage._lastRemoteAt = r2.at || Storage._lastRemoteAt;
        Storage.saveBackup(State.data);

        UI.renderAll();
        UI.renderSyncStatus("סונכרן");
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
      notify("שגיאה בעליית המערכת. פתח קונסול (F12) לפרטים.", "error");
    }
  });

  // Debug
  window.LEAD_CORE = { App, State, Storage, UI };
})();
