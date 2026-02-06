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
  const LS_ACTIVE_AGENT_KEY = "LEAD_CORE_ACTIVE_AGENT";
  const LS_SESSION_KEY = "LEAD_CORE_SESSION_V1";

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
  const normPolicyStatus = (v) => {
    const s = safeTrim(v).toLowerCase();
    if (!s) return "active";
    // accept Hebrew labels and legacy English
    if (s === "פעיל" || s === "active") return "active";
    if (s === "בוטל" || s === "cancelled" || s === "canceled") return "cancelled";
    if (s === "שוחלף" || s === "swapped") return "swapped";
    if (s === "ממתין לביטול" || s === "pending_cancel" || s === "pending") return "pending_cancel";
    return s;
  };
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

  
  const fetchWithTimeout = async (url, options = {}, timeoutMs = 8000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try{
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      return res;
    } finally {
      clearTimeout(t);
    }
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

  // ---------------------------
  // Auth (Premium Login)
  // ---------------------------
  const Auth = {
    current: null, // { name, role }

    init() {
      this._els = {
        wrap: $("#lcLogin"),
        form: $("#lcLoginForm"),
        user: $("#lcLoginUser"),
        pin: $("#lcLoginPin"),
        remember: $("#lcLoginRemember"),
        err: $("#lcLoginError")
      };

      // Show login immediately to avoid any UI flash
      try {
        if (this._els.wrap) this._els.wrap.setAttribute("aria-hidden", "false");
        document.body.classList.add("lcAuthLock");
      } catch (_) {}

      // Attempt restore session (only if user chose remember)
      const restored = this._restoreSession();
      if (restored) {
        this.current = restored;
        this.unlock();
      } else {
        this.lock();
      }

      on(this._els.form, "submit", (e) => {
        e.preventDefault();
        this._loginSubmit();
      });
    },

    lock() {
      try {
        document.body.classList.add("lcAuthLock");
        if (this._els.wrap) this._els.wrap.setAttribute("aria-hidden", "false");
        setTimeout(() => { try { this._els.user?.focus?.(); } catch (_) {} }, 50);
      } catch (_) {}
      try { UI?.renderAuthPill?.(); } catch (_) {}
    },

    unlock() {
      try {
        document.body.classList.remove("lcAuthLock");
        if (this._els.wrap) this._els.wrap.setAttribute("aria-hidden", "true");
      } catch (_) {}
    },

    isAdmin() {
      return !!(this.current && this.current.role === "admin");
    },

    _restoreSession() {
      try {
        const raw = localStorage.getItem(LS_SESSION_KEY);
        if (!raw) return null;
        const s = JSON.parse(raw);
        const name = safeTrim(s?.name);
        const role = safeTrim(s?.role) || "agent";
        if (!name) return null;
        return { name, role };
      } catch (_) {
        return null;
      }
    },

    _saveSession(cur) {
      try {
        if (!cur) return;
        localStorage.setItem(LS_SESSION_KEY, JSON.stringify({ name: cur.name, role: cur.role }));
      } catch (_) {}
    },

    _clearSession() {
      try { localStorage.removeItem(LS_SESSION_KEY); } catch (_) {}
    },

    logout() {
      this.current = null;
      this._clearSession();
      this.lock();
      // keep app state loaded; just hide it behind auth
    },

    _setError(msg) {
      try { if (this._els.err) this._els.err.textContent = msg ? String(msg) : ""; } catch (_) {}
    },

    _loginSubmit() {
      const username = safeTrim(this._els.user?.value);
      const pin = safeTrim(this._els.pin?.value);
      const remember = !!this._els.remember?.checked;

      this._setError("");
      if (!username) return this._setError("נא להזין שם משתמש");
      if (!pin) return this._setError("נא להזין קוד כניסה");

      // Admin (editable via Users screen)
      const adminAuth = State.data?.meta?.adminAuth || { username: "מנהל מערכת", pin: "1234", active: true };
      if (adminAuth.active !== false && username === safeTrim(adminAuth.username) && pin === safeTrim(adminAuth.pin)) {
        this.current = { name: "מנהל מערכת", role: "admin" };
        if (remember) this._saveSession(this.current); else this._clearSession();
        this.unlock();
        UI?.applyRoleUI?.();
        UI?.renderAll?.();
        UI?.renderAuthPill?.();
        return;
      }

      // Agent: match by agent.username (preferred) or agent.name (fallback)
      const agents = Array.isArray(State.data?.agents) ? State.data.agents : [];
      const matched = agents.find(a => safeTrim(a?.username) === username) || agents.find(a => safeTrim(a?.name) === username);
      if (!matched) return this._setError("שם משתמש לא נמצא");
      if (matched.active === false) return this._setError("המשתמש מושבת");

      const expected = safeTrim(matched.pin) || "0000";
      if (pin !== expected) return this._setError("קוד כניסה שגוי");

      this.current = { name: matched.name, role: "agent" };
      if (remember) this._saveSession(this.current); else this._clearSession();
      this.unlock();
      UI?.applyRoleUI?.();
      UI?.renderAll?.();
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

    // admin auth (editable via Users screen)
const defAdmin = { username: "מנהל מערכת", pin: "1234", active: true };
const rawAdmin = (s && s.meta && s.meta.adminAuth) ? s.meta.adminAuth : {};
out.meta.adminAuth = {
  username: safeTrim(rawAdmin.username) || defAdmin.username,
  pin: safeTrim(rawAdmin.pin) || defAdmin.pin,
  active: (rawAdmin.active === false) ? false : true
};

// agents (system users: role=agent)
out.agents = (out.agents || []).map((a, idx) => {
  const name = safeTrim(a?.name) || "נציג";
  const username = safeTrim(a?.username) || safeTrim(a?.user) || name; // backward friendly
  const pin = safeTrim(a?.pin) || safeTrim(a?.pass) || "0000";
  const active = (a?.active === false) ? false : true;
  return {
    id: safeTrim(a?.id) || ("a_" + idx),
    name,
    username,
    pin,
    active
  };
}).filter(a => a.name);

if (!out.agents.length) {
  // keep defaults, but ensure schema
  out.agents = (base.agents || []).map((a, idx) => ({
    id: safeTrim(a?.id) || ("a_" + idx),
    name: safeTrim(a?.name) || "נציג",
    username: safeTrim(a?.username) || safeTrim(a?.name) || "נציג",
    pin: safeTrim(a?.pin) || "0000",
    active: (a?.active === false) ? false : true
  }));
}


    // customers
    out.customers = (out.customers || []).map((c) => ({
      id: safeTrim(c?.id) || uid(),
      firstName: safeTrim(c?.firstName),
      lastName: safeTrim(c?.lastName),
      phone: safeTrim(c?.phone),
      idNumber: safeTrim(c?.idNumber),
      address: safeTrim(c?.address),
      email: safeTrim(c?.email),
      assignedAgent: safeTrim(c?.assignedAgent) || "",
      
      smoker: safeTrim(c?.smoker),
      birthDate: safeTrim(c?.birthDate),
      occupation: safeTrim(c?.occupation),
      heightCm: Number(c?.heightCm || 0),
      weightKg: Number(c?.weightKg || 0),
      hmo: safeTrim(c?.hmo),
      supplemental: safeTrim(c?.supplemental),
      idIssueDate: safeTrim(c?.idIssueDate),
      monthlyPremium: Number(c?.monthlyPremium || 0),
      notes: safeTrim(c?.notes),
      // My Flow (optional fields)
      nextAction: safeTrim(c?.nextAction),
      dueAt: safeTrim(c?.dueAt),
      createdAt: safeTrim(c?.createdAt) || nowISO(),
      updatedAt: safeTrim(c?.updatedAt) || nowISO(),
      policies: Array.isArray(c?.policies) ? c.policies.map((p) => ({
        id: safeTrim(p?.id) || ("p_" + uid()),
        policyNumber: safeTrim(p?.policyNumber) || safeTrim(p?.number),
        type: safeTrim(p?.type),
        company: safeTrim(p?.company),
        premium: Number(p?.premium || 0),
        status: normPolicyStatus(p?.status) || "active",
        renewAt: safeTrim(p?.renewAt),
        cancelReason: safeTrim(p?.cancelReason),
        cancelTemplate: safeTrim(p?.cancelTemplate),
        pendingCancelAt: safeTrim(p?.pendingCancelAt),
        cancelledAt: safeTrim(p?.cancelledAt),
        swappedAt: safeTrim(p?.swappedAt)
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
      try {
      if (!this.gsUrl) return { ok: false, error: "אין כתובת Web App" };
      const url = new URL(this.gsUrl);
      url.searchParams.set("action", "get");
      const res = await fetchWithTimeout(url.toString(), { method: "GET" });
      const json = await res.json();
      if (!json || json.ok !== true) return { ok: false, error: "שגיאת get" };
      return { ok: true, payload: normalizeState(json.payload || {}), at: json.at || nowISO() };
      } catch (e) {
        return { ok:false, error: String(e?.message || e) };
      }
    },

    async saveSheets(state) {
      try {
      if (!this.gsUrl) return { ok: false, error: "אין כתובת Web App" };
      const url = new URL(this.gsUrl);
      url.searchParams.set("action", "put");
      const res = await fetchWithTimeout(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ payload: state })
      });
      const json = await res.json();
      if (!json || json.ok !== true) return { ok: false, error: "שגיאת put" };
      return { ok: true, at: json.at || nowISO() };
      } catch (e) {
        return { ok:false, error: String(e?.message || e) };
      }
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
      UI.renderSyncStatus("עודכן אוטומטית", "ok", 1500);
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
      // auth pill
      this.els.userPill = $("#lcUserPill");
      this.els.userPillText = $("#lcUserPillText");
      this.els.btnLogout = $("#btnLogout");
      on(this.els.btnLogout, "click", () => {
        try { Auth.logout(); } catch (_) {}
        try { this.renderAuthPill(); } catch (_) {}
        try { this.goView("dashboard"); } catch (_) {}
      });
      this.els.btnSearch = $("#btnSearch");

      // my flow (cards)
      this.els.myFlowAgent = $("#myFlowAgent");
      this.els.myFlowCards = $("#myFlowCards");
      this.els.viewMyFlow = $("#view-myflow");

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
      this.els.cfBirthDate = $("#cfBirthDate");
      this.els.cfSmoker = $("#cfSmoker");
      this.els.cfOccupation = $("#cfOccupation");
      this.els.cfHeight = $("#cfHeight");
      this.els.cfWeight = $("#cfWeight");
      this.els.cfHmo = $("#cfHmo");
      this.els.cfSupplemental = $("#cfSupplemental");
      this.els.cfIdIssueDate = $("#cfIdIssueDate");
      this.els.cfBmi = $("#cfBmi");
      this.els.cfTotalPremium = $("#cfTotalPremium");
      this.els.cfActiveCount = $("#cfActiveCount");
      this.els.cfAgentSelect = $("#cfAgentSelect");
      this.els.cfPoliciesTbody = $("#cfPoliciesTbody");

      // policy modal
      this.els.modalPolicy = $("#modalPolicy");
      this.els.modalPolicyAction = $("#modalPolicyAction");
      this.els.policyActionTitle = $("#policyActionTitle");
      this.els.policyActionSub = $("#policyActionSub");
      this.els.btnPolicyActionConfirm = $("#btnPolicyActionConfirm");
      this.els.cancelFlow = $("#cancelFlow");
      this.els.swapFlow = $("#swapFlow");
      this.els.cancelPolicyList = $("#cancelPolicyList");
      this.els.cancelSelectedSummary = $("#cancelSelectedSummary");
      this.els.cancelReason = $("#cancelReason");
      this.els.cancelPostponeAt = $("#cancelPostponeAt");
      this.els.cancelTemplate = $("#cancelTemplate");
      this.els.policyForm = $("#policyForm");
      this.els.btnAddPolicy = $("#btnAddPolicy");
      this.els.btnEditCustomer = $("#btnEditCustomer");

      // settings
      this.els.gsUrl = $("#gsUrl");
      this.els.btnTestConn = $("#btnTestConn");
      this.els.btnSyncNow = $("#btnSyncNow");

      // users (admin)
      this.els.usersTbody = $("#usersTbody");
      this.els.btnAddUser = $("#btnAddUser");
      this.els.usersSearch = $("#usersSearch");
      this.els.usersFilter = $("#usersFilter");
// users editor modal (admin)
this.els.modalUserEdit = $("#modalUserEdit");
this.els.userEditForm = $("#userEditForm");
this.els.userEditTitle = $("#userEditTitle");
this.els.userEditKind = $("#userEditKind");
this.els.userEditId = $("#userEditId");
this.els.userEditName = $("#userEditName");
this.els.userEditUsername = $("#userEditUsername");
this.els.userEditPin = $("#userEditPin");
this.els.userEditActive = $("#userEditActive");
this.els.userEditErr = $("#userEditError");
this.els.btnUserEditSave = $("#btnUserEditSave");

      // allow editing GS URL (recovery / multi-deploy)
      on(this.els.gsUrl, "change", () => {
        const v = safeTrim(this.els.gsUrl?.value);
        if(!v) return;
        Storage.gsUrl = v;
        try{ localStorage.setItem(LS_GS_URL_KEY, v); }catch(_){ }
        UI.renderSyncStatus("URL עודכן", "warn", 1600);
      });


      // Topbar
      on($("#btnNewCustomer"), "click", () => this.openModal());

      // Nav
      $$(".nav__item").forEach(btn => {
        on(btn, "click", () => this.goView(btn.dataset.view));
      });

      // My Flow interactions (scoped)
      on(this.els.myFlowAgent, "change", () => {
        const v = safeTrim(this.els.myFlowAgent?.value);
        if (v) {
          try { localStorage.setItem(LS_ACTIVE_AGENT_KEY, v); } catch (_) {}
          this.renderMyFlow();
        }
      });

      on(this.els.viewMyFlow, "click", (e) => {
        const chip = e?.target?.closest?.(".lcChip");
        if (chip) {
          const sla = safeTrim(chip.dataset.sla) || "all";
          this._myFlowSla = sla;
          $$(".lcChip", this.els.viewMyFlow).forEach(b => b.classList.toggle("is-active", b === chip));
          this.renderMyFlow();
          return;
        }
        const btn = e?.target?.closest?.("button[data-open-customer]");
        if (btn) {
          const id = safeTrim(btn.dataset.openCustomer);
          if (id) this.openCustomerFull(id);
        }
      });

      // Customer file: add new policy button
      on(this.els.btnAddPolicy, "click", () => {
        // Works inside customerFull; policyForm uses current customerFull.dataset.customerId
        this.openPolicyModal();
      });

      // Customer file: edit personal details
      on(this.els.btnEditCustomer, "click", () => {
        const id = safeTrim(this.els.customerFull?.dataset?.customerId);
        if(!id){ notify("לא נבחר לקוח לעריכה.", "warn"); return; }
        this.openCustomerEdit(id);
      });

      // Customer file: change assigned agent (all users)
      on(this.els.cfAgentSelect, "change", async () => {
        try {
          if (!Auth.current) {
            notify("צריך להתחבר כדי לשנות נציג מטפל.", "warn");
            // revert select to current
            const id = safeTrim(this.els.customerFull?.dataset?.customerId);
            const c = (State.data.customers || []).find(x => x.id === id);
            if (c) this.els.cfAgentSelect.value = c.assignedAgent || "";
            return;
          }

          const customerId = safeTrim(this.els.customerFull?.dataset?.customerId);
          const c = (State.data.customers || []).find(x => x.id === customerId);
          if (!c) return;

          const newAgent = safeTrim(this.els.cfAgentSelect?.value);
          if (!newAgent) return;

          c.assignedAgent = newAgent;
          c.updatedAt = nowISO();

          // persist
          const r = await App.save("שינוי נציג מטפל");
          if (!r.ok) {
            notify("שמירה נכשלה: " + (r.error || "שגיאה"), "error");
          }

          // refresh key areas
          this.renderAll();
        } catch (_) {}
      });

      // Close handlers (scoped close: do NOT drop back to dashboard when closing policy cancel window)
      $$("[data-close='1']").forEach(el => on(el, "click", () => {
        // If the close button belongs to a specific overlay/modal, close only that one.
        if (el.closest("#modalPolicyAction")) return this.closePolicyActionModal();
        if (el.closest("#modalPolicy")) return this.closePolicyModal();
        if (el.closest("#modalCustomer")) return this.closeModal();
        if (el.closest("#modalUserEdit")) return this.closeUserEditModal();
        if (el.closest("#customerFull")) return this.closeCustomerFull();
        // Fallback
        this.closeOverlays();
      }));

      // Policy action confirm (cancel / swap)
      // Note: index.html currently contains two confirm buttons with the same id in the policy-action modal.
      // We bind via delegation so whichever one is clicked will work.
      on(this.els.modalPolicyAction, "click", async (e) => {
        const btn = e?.target?.closest?.("#btnPolicyActionConfirm");
        if (!btn) return;
        if (btn) btn.disabled = true;
        const action = safeTrim(this.els.modalPolicyAction?.dataset?.action);
        const pid = safeTrim(this.els.modalPolicyAction?.dataset?.policyId);
        if (!action || !pid) return;
        try { await this._applyPolicyAction(action, pid); } finally { if (btn) btn.disabled = false; }
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
        const submitBtn = this.els.customerForm?.querySelector?.("button[type='submit']");
        if (submitBtn) submitBtn.disabled = true;
        try {


        const fd = new FormData(this.els.customerForm);
        const editId = safeTrim(this.els.modalCustomer?.dataset?.editId);
        const fallbackAgent = (State.data.agents && State.data.agents[0]) ? State.data.agents[0].name : "";

        const incoming = {
          firstName: safeTrim(fd.get("firstName")),
          lastName: safeTrim(fd.get("lastName")),
          phone: safeTrim(fd.get("phone")),
          idNumber: safeTrim(fd.get("idNumber")),
          address: safeTrim(fd.get("address")),
          email: safeTrim(fd.get("email")),
          assignedAgent: safeTrim(fd.get("assignedAgent")) || fallbackAgent || "",

          // פרופיל לקוח (חדש)
          smoker: safeTrim(fd.get("smoker")),
          birthDate: safeTrim(fd.get("birthDate")),
          occupation: safeTrim(fd.get("occupation")),
          heightCm: Number(fd.get("heightCm") || 0),
          weightKg: Number(fd.get("weightKg") || 0),
          hmo: safeTrim(fd.get("hmo")),
          supplemental: safeTrim(fd.get("supplemental")),
          idIssueDate: safeTrim(fd.get("idIssueDate"))
        };

        if (!incoming.firstName || !incoming.lastName || !incoming.phone) {
          notify("נא למלא שם פרטי, שם משפחה וטלפון.", "warn");
          return;
        }

        if (editId) {
          const c = State.data.customers.find(x => x.id === editId);
          if(!c){ notify("לקוח לעריכה לא נמצא.", "error"); return; }
          Object.assign(c, incoming);
          c.updatedAt = nowISO();
          State.data.activity.unshift({ at: nowISO(), text: `עודכנו פרטי לקוח: ${c.firstName} ${c.lastName}` });
          State.data.meta.updatedAt = nowISO();

          const r = await App.save("עודכנו פרטי לקוח");
          if (!r.ok) {
            notify("שמירה נכשלה: " + (r.error || "שגיאה"), "error");
            return;
          }

          this.closeModal();
          this.openCustomerFull(c.id);
          this.renderAll();
          return;
        }

        const customer = {
          id: uid(),
          ...incoming,
          monthlyPremium: 0,
          notes: "",
          policies: [],
          createdAt: nowISO(),
          updatedAt: nowISO()
        };

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
        this.renderAll();        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }

      });

      // Policy modal submit
            on(this.els.policyForm, "submit", async (e) => {
        e.preventDefault();
        const submitBtn = this.els.policyForm?.querySelector?.("button[type='submit']");
        if (submitBtn) submitBtn.disabled = true;
        try {


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
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
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
        const b = this.els.btnTestConn;
        if (b) b.disabled = true;
        try {
          const r = await App.testConnection();
        notify(r.ok ? "חיבור תקין ✔" : ("חיבור נכשל: " + (r.error || "שגיאה")), r.ok ? "info" : "error");
        if (r.ok) UI.renderSyncStatus("חיבור תקין", "ok", 1800);
        } finally {
          if (b) b.disabled = false;
        }
      });

      on(this.els.btnSyncNow, "click", async () => {
        const b = this.els.btnSyncNow;
        if (b) b.disabled = true;
        try {
          UI.renderSyncStatus("מסתנכרן…", "warn", 0);
          const r = await App.syncNow();
        notify(r.ok ? "סנכרון בוצע ✔" : ("סנכרון נכשל: " + (r.error || "שגיאה")), r.ok ? "info" : "error");
        } finally {
          if (b) b.disabled = false;
        }
      });
          // Premium UX: tabs + progress for new customer form
      setupCustomerFormUX(this);

      // Role-based UI (admin/agent)
      this.applyRoleUI();
},

    applyRoleUI(){
      // Admin-only: Users management
      try {
        const navUsers = $("#navUsers");
        if (navUsers) navUsers.style.display = Auth.isAdmin() ? "" : "none";
      } catch (_) {}

      // If agent logged in: lock active agent and prevent Users screen
      try {
        if (Auth.current && Auth.current.role === "agent") {
          // lock selector value to current agent
          try { localStorage.setItem(LS_ACTIVE_AGENT_KEY, safeTrim(Auth.current.name)); } catch (_) {}
        }
      } catch (_) {}
    },

    goView(view) {
      // prevent non-admin access
      if (view === "users" && !Auth.isAdmin()) {
        notify("אין הרשאה למסך ניהול משתמשים.", "warn");
        view = "dashboard";
      }
      $$(".nav__item").forEach(b => b.classList.toggle("is-active", b.dataset.view === view));
      $$(".view").forEach(v => v.classList.remove("is-visible"));
      const el = $("#view-" + view);
      if (el) el.classList.add("is-visible");

      const titles = {
        dashboard: "דשבורד",
        customers: "לקוחות",
        myflow: "התהליכים שלי",
        esign: "החתמת לקוח",
        settings: "הגדרות מערכת",
        users: "ניהול משתמשים"
      };
      if (this.els.pageTitle) this.els.pageTitle.textContent = titles[view] || "LEAD CORE";

      document.body.classList.toggle("view-customers-active", view === "customers");
      document.body.classList.toggle("view-dashboard-active", view === "dashboard");
      document.body.classList.toggle("view-myflow-active", view === "myflow");
      document.body.classList.toggle("view-esign-active", view === "esign");
      document.body.classList.toggle("view-settings-active", view === "settings");
      document.body.classList.toggle("view-users-active", view === "users");

      // ensure role-based UI is applied when switching views
      this.applyRoleUI();

      if (view === "myflow") this.renderMyFlow();
      if (view === "users") this.renderUsers();
    },

    _myFlowSla: "all",

    _getActiveAgentName(){
      // If logged in as agent, lock MyFlow to the current user
      if (Auth.current && Auth.current.role === "agent") {
        return safeTrim(Auth.current.name);
      }
      const agents = State.data.agents || [];
      const fallback = agents[0] ? agents[0].name : "";
      let v = "";
      try { v = safeTrim(localStorage.getItem(LS_ACTIVE_AGENT_KEY)); } catch (_) { v = ""; }
      if (!v) return fallback;
      if (agents.some(a => a && a.name === v)) return v;
      return fallback;
    },

    _parseDateSafe(v){
      const s = safeTrim(v);
      if (!s) return null;
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    },

    _sameDay(a, b){
      return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    },

    _slaBucket(dueAt){
      const due = this._parseDateSafe(dueAt);
      if (!due) return "green";
      const now = new Date();
      // compare by date (not time)
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
      if (dueDay.getTime() < today.getTime()) return "red";
      if (dueDay.getTime() === today.getTime()) return "amber";
      return "green";
    },

    _slaLabel(bucket){
      if (bucket === "red") return "חורג";
      if (bucket === "amber") return "היום";
      return "עתידי";
    },

    renderMyFlow(){
      if (!this.els.myFlowCards || !this.els.viewMyFlow) return;

      const agents = State.data.agents || [];
      const activeAgent = this._getActiveAgentName();

      // populate agent selector
      if (this.els.myFlowAgent) {
        this.els.myFlowAgent.innerHTML = agents.map(a =>
          `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`
        ).join("");
        if (activeAgent) this.els.myFlowAgent.value = activeAgent;

        // If agent logged in, hide selector (locked to current user)
        if (Auth.current && Auth.current.role === "agent") {
          this.els.myFlowAgent.disabled = true;
          this.els.myFlowAgent.style.display = "none";
        } else {
          this.els.myFlowAgent.disabled = false;
          this.els.myFlowAgent.style.display = "";
        }
      }

      const customers = Array.isArray(State.data.customers) ? State.data.customers : [];

      const items = customers
        .filter(c => safeTrim(c.assignedAgent) && safeTrim(c.assignedAgent) === activeAgent)
        .map(c => {
          const fullName = safeTrim(`${c.firstName || ""} ${c.lastName || ""}`) || "לקוח ללא שם";
          const bucket = this._slaBucket(c.dueAt);
          const due = this._parseDateSafe(c.dueAt);
          return {
            id: c.id,
            name: fullName,
            phone: c.phone || "",
            nextAction: c.nextAction || "מעקב לקוח",
            dueAt: c.dueAt || "",
            dueTs: due ? due.getTime() : Number.POSITIVE_INFINITY,
            sla: bucket,
            slaRank: bucket === "red" ? 0 : bucket === "amber" ? 1 : 2
          };
        })
        .filter(it => this._myFlowSla === "all" ? true : it.sla === this._myFlowSla)
        .sort((a, b) => (a.slaRank - b.slaRank) || (a.dueTs - b.dueTs) || a.name.localeCompare(b.name, "he"));

      if (!items.length) {
        this.els.myFlowCards.innerHTML = `<div class="emptyState" style="padding:10px">
          <div class="emptyState__icon">⭐</div>
          <div class="emptyState__title">אין תהליכים להצגה</div>
          <div class="emptyState__text">בחר נציג או שייך לקוחות לנציג כדי להתחיל.</div>
        </div>`;
        return;
      }

      const fmtDue = (v) => {
        const d = this._parseDateSafe(v);
        if (!d) return "—";
        try { return d.toLocaleDateString("he-IL"); } catch (_) { return String(v).slice(0, 10); }
      };

      this.els.myFlowCards.innerHTML = items.map(it => {
        const barClass = it.sla === "red" ? "sla-red" : it.sla === "amber" ? "sla-amber" : "sla-green";
        return `
          <article class="lcFlowCard" data-id="${escapeHtml(it.id)}">
            <div class="lcFlowCard__bar ${barClass}"></div>
            <div class="lcFlowCard__body">
              <div class="lcFlowCard__top">
                <div>
                  <div class="lcFlowCard__name">${escapeHtml(it.name)}</div>
                  <div class="lcFlowCard__meta">${escapeHtml(it.nextAction)} • יעד: ${escapeHtml(fmtDue(it.dueAt))}</div>
                </div>
                <div class="lcFlowCard__tag">${escapeHtml(this._slaLabel(it.sla))}</div>
              </div>
              <div class="lcFlowCard__bottom">
                <div class="lcFlowCard__phone">${escapeHtml(it.phone)}</div>
                <button class="lcFlowBtn" type="button" data-open-customer="${escapeHtml(it.id)}">פתח תיק</button>
              </div>
            </div>
          </article>
        `;
      }).join("");
    },


    openCustomerEdit(customerId){
      const c = State.data.customers.find(x => x.id === customerId);
      if(!c) return;
      if(!this.els.modalCustomer || !this.els.customerForm) return;

      // mark edit mode
      this.els.modalCustomer.dataset.editId = customerId;

      // set title
      const titleEl = document.querySelector("#modalTitle");
      if(titleEl) titleEl.textContent = "עדכון פרטי לקוח";

      // populate fields
      this.els.customerForm.reset();
      const set = (name, val) => {
        const el = this.els.customerForm.querySelector(`[name="${name}"]`);
        if(el) el.value = (val ?? "");
      };
      set("firstName", c.firstName);
      set("lastName", c.lastName);
      set("phone", c.phone);
      set("idNumber", c.idNumber);
      set("address", c.address);
      set("email", c.email);


      // פרופיל לקוח (חדש)
      set("smoker", c.smoker);
      set("birthDate", c.birthDate);
      set("occupation", c.occupation);
      set("heightCm", c.heightCm || "");
      set("weightKg", c.weightKg || "");
      set("hmo", c.hmo);
      set("supplemental", c.supplemental);
      set("idIssueDate", c.idIssueDate);

      // agents dropdown
      if (this.els.newAssignedAgent) {
        const agents = State.data.agents || [];
        this.els.newAssignedAgent.innerHTML = agents.map(a => `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`).join("");
        this.els.newAssignedAgent.value = c.assignedAgent || (agents[0]?.name || "");
      }

      this.els.modalCustomer.setAttribute("aria-hidden","false");
      setTimeout(() => {
        try { this.els.customerForm.querySelector("input[name='firstName']")?.focus(); } catch(_) {}
      }, 50);
    },

    openModal() {
      if (!this.els.modalCustomer || !this.els.customerForm) return;
      // clear edit mode
      delete this.els.modalCustomer.dataset.editId;
      const titleEl = document.querySelector("#modalTitle");
      if(titleEl) titleEl.textContent = "הקמת לקוח חדש";
      this.els.customerForm.reset();

      // agents dropdown
      if (this.els.newAssignedAgent) {
        const agents = State.data.agents || [];
        this.els.newAssignedAgent.innerHTML = agents.map(a =>
          `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`
        ).join("");
      }

      this.els.modalCustomer.classList.add("is-open");
      try { this.customerFormUX && this.customerFormUX.reset && this.customerFormUX.reset(); } catch(_){}

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

// extra profile fields
if (this.els.cfBirthDate) this.els.cfBirthDate.textContent = (c.birthDate || "—");

// age from birthDate (YYYY-MM-DD)
if (this.els.cfAge) {
  const bd = (c.birthDate || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(bd)) {
    const [y,m,d] = bd.split("-").map(Number);
    const dob = new Date(y, (m||1)-1, d||1);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const md = (now.getMonth() - dob.getMonth());
    if (md < 0 || (md === 0 && now.getDate() < dob.getDate())) age--;
    this.els.cfAge.textContent = (Number.isFinite(age) && age >= 0) ? String(age) : "—";
  } else {
    this.els.cfAge.textContent = "—";
  }
}
if (this.els.cfSmoker) this.els.cfSmoker.textContent = (c.smoker || "—");
if (this.els.cfOccupation) this.els.cfOccupation.textContent = (c.occupation || "—");
if (this.els.cfHeight) this.els.cfHeight.textContent = (c.heightCm ? (String(c.heightCm) + " ס״מ") : "—");
if (this.els.cfWeight) this.els.cfWeight.textContent = (c.weightKg ? (String(c.weightKg) + " ק״ג") : "—");

// BMI (kg / m^2) from heightCm + weightKg
if (this.els.cfBmi) {
  const hCm = Number(c.heightCm || 0);
  const wKg = Number(c.weightKg || 0);
  if (hCm > 0 && wKg > 0) {
    const m = hCm / 100;
    const bmi = wKg / (m * m);
    this.els.cfBmi.textContent = Number.isFinite(bmi) ? bmi.toFixed(1) : "—";
  } else {
    this.els.cfBmi.textContent = "—";
  }
}
if (this.els.cfHmo) this.els.cfHmo.textContent = (c.hmo || "—");
if (this.els.cfSupplemental) this.els.cfSupplemental.textContent = (c.supplemental || "—");
if (this.els.cfIdIssueDate) this.els.cfIdIssueDate.textContent = (c.idIssueDate || "—");

      // agent select
      if (this.els.cfAgentSelect) {
        const agents = State.data.agents || [];
        this.els.cfAgentSelect.innerHTML = agents.map(a =>
          `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`
        ).join("");
        const fallback = agents[0]?.name || "";
        if (!c.assignedAgent && fallback) c.assignedAgent = fallback;
        this.els.cfAgentSelect.value = c.assignedAgent || fallback || "";

        // All users can change assignment (requires logged-in user)
        this.els.cfAgentSelect.disabled = !Auth.current;
      }
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

      const customerId = safeTrim(this.els.customerFull?.dataset?.customerId);
      const c = (State.data.customers || []).find(x => x.id === customerId);

      this.els.modalPolicyAction.dataset.action = action || "";
      this.els.modalPolicyAction.dataset.policyId = policyId || "";

      // title + subtitle
      if (this.els.policyActionTitle) {
        this.els.policyActionTitle.textContent = action === "cancel" ? "ביטול פוליסה" : "שחלוף פוליסה";
      }
      if (this.els.policyActionSub) {
        this.els.policyActionSub.textContent = policyLabel ? (`פוליסה שנלחצה: ${policyLabel}`) : "—";
      }

      // toggle flows
      if (this.els.cancelFlow) this.els.cancelFlow.style.display = action === "cancel" ? "block" : "none";
      if (this.els.swapFlow) this.els.swapFlow.style.display = action === "swap" ? "block" : "none";

      // reset cancel inputs
      if (action === "cancel") {
        try {
          if (this.els.cancelReason) this.els.cancelReason.value = "";
          if (this.els.cancelPostponeAt) this.els.cancelPostponeAt.value = "";
          if (this.els.cancelTemplate) this.els.cancelTemplate.value = "";
        } catch (_) {}

        // render list
        const list = (c && Array.isArray(c.policies)) ? c.policies.slice() : [];
        const canCancel = list.filter(p => normPolicyStatus(p.status) === "active" || normPolicyStatus(p.status) === "pending_cancel");

        const pickHtml = canCancel.map(p => {
          const id = escapeHtml(p.id);
          const title = escapeHtml(`${p.type || ""} • ${p.company || ""}`.trim() || "פוליסה");
          const num = escapeHtml(p.policyNumber || p.id);
          const prem = fmtMoney(p.premium || 0);
          const pending = safeTrim(p.pendingCancelAt) ? (`<span class="badge">ממתין: ${escapeHtml(p.pendingCancelAt)}</span>`) : "";
          return `
            <label class="policyPick">
              <input type="radio" name="cancelPick" value="${id}" ${p.id===policyId ? "checked":""}/>
              <div class="policyPick__main">
                <div class="policyPick__title">${title}</div>
                <div class="policyPick__meta">
                  <span>מס' פוליסה: ${num}</span>
                  <span>פרמיה: ${prem}</span>
                  ${pending}
                </div>
              </div>
            </label>
          `;
        }).join("") || `<div class="muted">אין פוליסות פעילות לביטול.</div>`;

        if (this.els.cancelPolicyList) this.els.cancelPolicyList.innerHTML = pickHtml;

        // update selected summary helper
        const syncSelected = () => {
          const chosen = this.els.cancelPolicyList?.querySelector("input[name='cancelPick']:checked")?.value || "";
          this.els.modalPolicyAction.dataset.policyId = chosen || "";
          const pol = canCancel.find(x => x.id === chosen);
          const label = pol ? `${pol.type || ""} ${pol.company || ""}`.trim() : "";
          const num = pol ? (pol.policyNumber || pol.id) : "";
          if (this.els.cancelSelectedSummary) {
            this.els.cancelSelectedSummary.textContent = pol ? (`${label} • ${num}`) : "לא נבחרה פוליסה";
          }
        };

        // bind once per open
        try {
          $$("input[name='cancelPick']", this.els.cancelPolicyList).forEach(r => {
            on(r, "change", syncSelected);
          });
        } catch (_) {}

        syncSelected();
      }

      // confirm button styling
      if (this.els.btnPolicyActionConfirm) {
        this.els.btnPolicyActionConfirm.textContent = action === "cancel" ? "אישור ביטול" : "המשך שחלוף";
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
      if (document.body.classList.contains("view-myflow-active")) this.renderMyFlow();
      if (document.body.classList.contains("view-users-active")) this.renderUsers();
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

    renderUsers() {
      if (!this.els.usersTbody) return;
      if (!Auth.isAdmin()) {
        this.els.usersTbody.innerHTML = `<tr><td colspan="4" class="muted" style="padding:18px">אין הרשאה לצפייה</td></tr>`;
        return;
      }

      const q = safeTrim(this.els.usersSearch?.value || "").toLowerCase();
      const filter = safeTrim(this.els.usersFilter?.value || "all");

      const adminAuth = State.data?.meta?.adminAuth || { username: "מנהל מערכת", pin: "1234", active: true };
      const agents = Array.isArray(State.data.agents) ? State.data.agents : [];

      const rows = [
        {
          kind: "admin",
          id: "admin",
          name: "מנהל מערכת",
          username: safeTrim(adminAuth.username) || "מנהל מערכת",
          role: "Admin",
          active: adminAuth.active !== false
        }
      ].concat(agents.map(a => ({
        kind: "agent",
        id: safeTrim(a.id),
        name: safeTrim(a.name),
        username: safeTrim(a.username) || safeTrim(a.name),
        role: "נציג/סוכן",
        active: a.active !== false
      })));

      const visible = rows
        .filter(r => r.name)
        .filter(r => !q ? true : (r.name.toLowerCase().includes(q) || (r.username || "").toLowerCase().includes(q)))
        .filter(r => {
          if (filter === "active") return r.active;
          if (filter === "disabled") return !r.active;
          return true;
        });

      this.els.usersTbody.innerHTML = visible.map(r => {
        const status = r.active ? "פעיל" : "מושבת";
        const actions = `
          <div class="lcUsers__rowActions">
            <button class="btn btn--sm" type="button" data-uact="edit" data-ukind="${escapeHtml(r.kind)}" data-uid="${escapeHtml(r.id)}">עריכת התחברות</button>
            ${r.kind === "agent" ? `<button class="btn btn--sm ${r.active ? "btn--danger" : ""}" type="button" data-uact="toggle" data-uid="${escapeHtml(r.id)}">${r.active ? "השבת" : "הפעל"}</button>` : ``}
          </div>
        `;
        return `
          <tr>
            <td>
              <div class="lcUsers__name">${escapeHtml(r.name)}</div>
              <div class="muted" style="font-size:12px">שם משתמש: ${escapeHtml(r.username || "")}</div>
            </td>
            <td>${escapeHtml(r.role)}</td>
            <td>${escapeHtml(status)}</td>
            <td style="text-align:left">${actions}</td>
          </tr>
        `;
      }).join("") || `<tr><td colspan="4" class="muted" style="padding:18px">אין משתמשים להצגה</td></tr>`;

      // Bind interactions (guard against duplicate binding)
      if (!this._usersBound) {
        this._usersBound = true;
        on(this.els.usersSearch, "input", () => this.renderUsers());
        on(this.els.usersFilter, "change", () => this.renderUsers());
        on(this.els.btnAddUser, "click", () => this.openUserEditModal({ kind: "agent", mode: "create" }));

        // delegation for row actions
        on(this.els.usersTbody, "click", (e) => {
          const btn = e.target?.closest?.("[data-uact]");
          if (!btn) return;
          const act = btn.getAttribute("data-uact");
          const kind = btn.getAttribute("data-ukind") || "agent";
          const uid = btn.getAttribute("data-uid") || "";
          if (act === "edit") return this.openUserEditModal({ kind, id: uid, mode: "edit" });
          if (act === "toggle") return this.toggleAgentActive(uid);
        });

        // Save from modal
        on(this.els.userEditForm, "submit", (e) => {
          e.preventDefault();
          this.saveUserEditFromModal();
        });
        on(this.els.btnUserEditSave, "click", () => this.saveUserEditFromModal());
      }
    },

openUserEditModal({ kind="agent", id="", mode="edit" }={}) {
  if (!this.els.modalUserEdit) return;
  if (!Auth.isAdmin()) return;

  this._userEditCtx = { kind, id, mode };

  // reset
  try { this.els.userEditForm?.reset?.(); } catch(_) {}
  if (this.els.userEditErr) this.els.userEditErr.textContent = "";

  const isAdmin = (kind === "admin");

  // title
  if (this.els.userEditTitle) this.els.userEditTitle.textContent = isAdmin ? "עריכת מנהל מערכת" : (mode === "create" ? "הקמת משתמש חדש" : "עריכת משתמש");
  if (this.els.userEditKind) this.els.userEditKind.value = kind;
  if (this.els.userEditId) this.els.userEditId.value = id || "";

  // fill values
  if (isAdmin) {
    const adminAuth = State.data?.meta?.adminAuth || { username:"מנהל מערכת", pin:"1234", active:true };
    if (this.els.userEditName) this.els.userEditName.value = "מנהל מערכת";
    if (this.els.userEditUsername) this.els.userEditUsername.value = safeTrim(adminAuth.username) || "מנהל מערכת";
    if (this.els.userEditPin) this.els.userEditPin.value = safeTrim(adminAuth.pin) || "";
    if (this.els.userEditActive) this.els.userEditActive.checked = (adminAuth.active !== false);
  } else {
    const agents = Array.isArray(State.data.agents) ? State.data.agents : [];
    const a = (mode === "create") ? null : agents.find(x => safeTrim(x.id) === safeTrim(id));
    if (this.els.userEditName) this.els.userEditName.value = a ? safeTrim(a.name) : "";
    if (this.els.userEditUsername) this.els.userEditUsername.value = a ? (safeTrim(a.username) || safeTrim(a.name)) : "";
    if (this.els.userEditPin) this.els.userEditPin.value = a ? (safeTrim(a.pin) || "0000") : "";
    if (this.els.userEditActive) this.els.userEditActive.checked = a ? (a.active !== false) : true;
  }

  // UI toggles (admin doesn't edit "name")
  try {
    this.els.modalUserEdit.querySelectorAll("[data-only-agent]").forEach(el => {
      el.style.display = isAdmin ? "none" : "";
    });
    this.els.modalUserEdit.querySelectorAll("[data-only-admin]").forEach(el => {
      el.style.display = isAdmin ? "" : "none";
    });
  } catch(_) {}

  this.els.modalUserEdit.classList.add("is-open");
  this.els.modalUserEdit.setAttribute("aria-hidden", "false");
  setTimeout(() => { try { this.els.userEditUsername?.focus?.(); } catch(_) {} }, 50);
},

closeUserEditModal() {
  if (!this.els.modalUserEdit) return;
  this.els.modalUserEdit.classList.remove("is-open");
  this.els.modalUserEdit.setAttribute("aria-hidden", "true");
  this._userEditCtx = null;
},

async toggleAgentActive(agentId) {
  if (!Auth.isAdmin()) return;
  const id = safeTrim(agentId);
  if (!id) return;
  const agents = Array.isArray(State.data.agents) ? State.data.agents : [];
  const a = agents.find(x => safeTrim(x.id) === id);
  if (!a) return;

  a.active = !(a.active !== false);
  a.updatedAt = nowISO();

  const r = await App.save("שינוי סטטוס משתמש");
  if (!r.ok) notify("שמירה נכשלה: " + (r.error || "שגיאה"), "error");
  this.renderUsers();
},

async saveUserEditFromModal() {
  if (!Auth.isAdmin()) return;
  const ctx = this._userEditCtx || { kind:"agent", mode:"edit", id:"" };
  const kind = ctx.kind || safeTrim(this.els.userEditKind?.value) || "agent";
  const isAdmin = (kind === "admin");
  const id = safeTrim(ctx.id || this.els.userEditId?.value);

  const name = safeTrim(this.els.userEditName?.value);
  const username = safeTrim(this.els.userEditUsername?.value);
  const pin = safeTrim(this.els.userEditPin?.value);
  const active = !!this.els.userEditActive?.checked;

  const setErr = (msg) => { if (this.els.userEditErr) this.els.userEditErr.textContent = msg || ""; };

  setErr("");
  if (!username) return setErr("נא להזין שם משתמש");
  if (!pin) return setErr("נא להזין סיסמה/קוד");

  // avoid collisions
  const agents = Array.isArray(State.data.agents) ? State.data.agents : [];
  const adminAuth = State.data?.meta?.adminAuth || { username:"מנהל מערכת", pin:"1234", active:true };
  const adminUser = safeTrim(adminAuth.username) || "מנהל מערכת";

  const takenByAdmin = (!isAdmin && username === adminUser);
  if (takenByAdmin) return setErr("שם משתמש תפוס (מנהל מערכת)");

  const takenByAgent = agents.some(a => safeTrim(a.username) === username && safeTrim(a.id) !== id);
  if (takenByAgent) return setErr("שם משתמש תפוס (קיים אצל נציג אחר)");

  if (isAdmin) {
    State.data.meta ||= {};
    State.data.meta.adminAuth = { username, pin, active };
  } else {
    if (!name) return setErr("נא להזין שם נציג");
    if (ctx.mode === "create") {
      const newAgent = {
        id: uid(),
        name,
        username,
        pin,
        active: active !== false,
        createdAt: nowISO(),
        updatedAt: nowISO()
      };
      agents.push(newAgent);
      State.data.agents = agents;
    } else {
      const a = agents.find(x => safeTrim(x.id) === id);
      if (!a) return setErr("המשתמש לא נמצא");
      a.name = name;
      a.username = username;
      a.pin = pin;
      a.active = active !== false;
      a.updatedAt = nowISO();
    }
  }

  const r = await App.save("עדכון משתמשים");
  if (!r.ok) {
    setErr("שמירה נכשלה: " + (r.error || "שגיאה"));
    return;
  }

  this.closeUserEditModal();
  this.renderUsers();
  this.applyRoleUI();
},

    renderPolicies() {
      const id = safeTrim(this.els.customerFull?.dataset?.customerId);
      const c = (State.data.customers || []).find(x => x.id === id);
      if (!c) return;

      c.policies ||= [];
      const list = c.policies.slice().map(p => ({...p, status: normPolicyStatus(p.status)}));

      const active = list.filter(p => normPolicyStatus(p.status) === "active");
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
            <td>${escapeHtml(p.type || "")}${(p.status && p.status!=="active") ? ('<div class="muted small">סטטוס: ' + escapeHtml(normPolicyStatus(p.status)==="cancelled"?"בוטל":(normPolicyStatus(p.status)==="swapped"?"שוחלף":"ממתין לביטול")) + '</div>') : ""}</td>
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

    renderSyncStatus(extraText, level = null, flashMs = 0) {
      // level: "ok" | "warn" | "err" (null keeps previous)
      this._syncLevel = level || this._syncLevel || (Storage.gsUrl ? "ok" : "err");

      const dot = this.els.syncDot;
      const txt = this.els.syncText;
      const last = this.els.lastSyncText;

      if (txt) txt.textContent = "מצב: Google Sheets";

      if (dot) {
        dot.classList.remove("ok", "warn", "err", "busy");
        dot.classList.add(this._syncLevel);
        // subtle pulse only while syncing
        const syncing = /מסתנכרן|טוען|שומר/.test(String(extraText || ""));
        if (syncing) dot.classList.add("busy");
      }

      const updatedAt = State.data.meta?.updatedAt;
      const base = updatedAt
        ? ("עודכן: " + new Date(updatedAt).toLocaleString("he-IL"))
        : "לא סונכרן עדיין";

      const line = (extraText ? (extraText + " • ") : "") + base;

      if (last) last.textContent = line;

      // flash & revert
      if (flashMs && last) {
        clearTimeout(this._syncTimer);
        this._syncTimer = setTimeout(() => {
          // re-render base line, keep current level
          this.renderSyncStatus("", this._syncLevel, 0);
        }, Math.max(300, Number(flashMs) || 0));
      }
    }
  };

  // ---------------------------
  // App Controller (Sheets-only)
  // ---------------------------
  
  // ---------------------------
  // Premium UX • New Customer Form (Tabs + Progress)
  // ---------------------------
  function setupCustomerFormUX(UI){
    try{
      const form = UI && UI.els && UI.els.customerForm;
      if(!form) return;

      const tabs = Array.from(form.querySelectorAll(".lcTab"));
      const steps = Array.from(form.querySelectorAll(".lcStep"));
      const prevBtn = form.querySelector("#custPrevBtn");
      const nextBtn = form.querySelector("#custNextBtn");
      const bar = form.querySelector("#custProgressBar");
      const txt = form.querySelector("#custProgressText");

      const important = [
        "firstName","lastName","phone","idNumber","birthDate",
        "email","address","smoker","occupation","heightCm","weightKg",
        "hmo","supplemental","idIssueDate","assignedAgent"
      ];

      function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }

      function getStep(){
        const s = Number(form.dataset.step || 1);
        return clamp(isFinite(s)?s:1, 1, Math.max(1, steps.length));
      }

      function setActiveStep(step){
        step = clamp(step, 1, Math.max(1, steps.length));
        form.dataset.step = String(step);

        steps.forEach(sec => sec.classList.toggle("is-active", String(sec.dataset.step) === String(step)));
        tabs.forEach(btn => {
          const isOn = String(btn.dataset.step) === String(step);
          btn.classList.toggle("is-active", isOn);
          btn.setAttribute("aria-selected", isOn ? "true" : "false");
        });

        if(prevBtn) prevBtn.disabled = (step <= 1);
        if(nextBtn){
          const isLast = (step >= steps.length);
          nextBtn.textContent = isLast ? "סיום" : "הבא";
        }
      }

      function validateStep(step){
        // validate required inputs/selects inside that step only
        const sec = steps.find(s => String(s.dataset.step) === String(step));
        if(!sec) return true;

        const requiredEls = Array.from(sec.querySelectorAll("input[required], select[required], textarea[required]"));
        for(const el of requiredEls){
          const v = (el.value || "").trim();
          if(!v){
            try{ el.focus(); } catch(_){}
            if (typeof notify === "function") notify("נא למלא את כל שדות החובה בשלב הזה.", "warn");
            return false;
          }
        }
        return true;
      }

      function updateProgress(){
        const fd = new FormData(form);
        let filled = 0;
        let total = 0;

        for(const name of important){
          total++;
          const v = (fd.get(name) || "").toString().trim();
          if(v) filled++;
        }

        const pct = total ? Math.round((filled/total)*100) : 0;
        if(bar) bar.style.width = pct + "%";
        if(txt) txt.textContent = "השלמה: " + pct + "%";
      }

      function go(step){
        setActiveStep(step);
        // ensure active step is visible in scroll
        try{
          const sec = steps.find(s => s.classList.contains("is-active"));
          sec && sec.scrollIntoView({ block: "start", behavior: "smooth" });
        } catch(_){}
      }

      // events
      tabs.forEach(btn => {
        on(btn, "click", () => {
          const step = Number(btn.dataset.step || 1);
          // allow jumping forward only if current step required fields are filled
          const cur = getStep();
          if(step > cur && !validateStep(cur)) return;
          go(step);
        });
      });

      if(prevBtn) on(prevBtn, "click", () => go(getStep() - 1));

      if(nextBtn) on(nextBtn, "click", () => {
        const cur = getStep();
        if(cur >= steps.length){
          // on last step, guide user to save
          if (typeof notify === "function") notify("מעולה! אפשר ללחוץ עכשיו על 'שמירה'.", "ok");
          return;
        }
        if(!validateStep(cur)) return;
        go(cur + 1);
      });

      on(form, "input", updateProgress);
      on(form, "change", updateProgress);

      // public API
      UI.customerFormUX = {
        reset(){
          setActiveStep(1);
          updateProgress();
        },
        go(step){ go(step); },
        update(){ updateProgress(); }
      };

      // initial
      UI.customerFormUX.reset();

    }catch(_){}
  }

const App = {
    _saveInFlight: false,

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
        UI.renderSyncStatus("מחובר", "ok", 1200);
      } else {
        const b = Storage.loadBackup();
        if (b) {
          State.data = b;
          UI.renderSyncStatus("אין חיבור • מוצג גיבוי", "warn", 3500);
        } else {
          State.data = defaultState();
          UI.renderSyncStatus("אין חיבור", "err", 3500);
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
        UI.renderSyncStatus("אין חיבור ל-Sheets", "err", 2500);
        return { ok: false, error: "אין URL ל-Web App" };
      }

      // Prevent double-save / double-click
      if (this._saveInFlight) {
        UI.renderSyncStatus("שמירה כבר בתהליך", "warn", 1800);
        return { ok: false, error: "שמירה כבר בתהליך" };
      }

      // stamp update
      State.data.meta ||= {};
      State.data.meta.updatedAt = nowISO();
      if (activityText) State.data.activity.unshift({ at: nowISO(), text: activityText });

      Storage._busy = true;
      this._saveInFlight = true;

      // show syncing state
      UI.renderSyncStatus("מסתנכרן…", "warn", 0);

      try {
        const r = await Storage.saveSheets(State.data);
        if (r && r.ok) {
          Storage._lastRemoteAt = r.at || Storage._lastRemoteAt;
          Storage.saveBackup(State.data);

          // Elegant success line (no popup)
          UI.renderSyncStatus("נשמר בהצלחה", "ok", 2500);
          return r;
        }

        UI.renderSyncStatus("שמירה נכשלה", "err", 3500);
        return r || { ok: false, error: "שמירה נכשלה" };
      } catch (e) {
        UI.renderSyncStatus("שמירה נכשלה", "err", 3500);
        return { ok: false, error: String(e?.message || e) };
      } finally {
        Storage._busy = false;
        this._saveInFlight = false;
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
        UI.renderSyncStatus("סונכרן", "ok", 1800);
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
      Auth.init();
      try { UI.renderAuthPill(); } catch (_) {}
      await App.boot();
      // Apply role-based UI again after state load
      UI.applyRoleUI();
    } catch (e) {
      console.error("LEAD_CORE boot error:", e);
      notify("שגיאה בעליית המערכת. פתח קונסול (F12) לפרטים.", "error");
    }
  });

  // Debug
  window.LEAD_CORE = { App, State, Storage, UI };
})();
