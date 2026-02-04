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
  const showToast = () => {}; 

// ---------------------------
// Save Overlay (6s countdown) – no popups
// ---------------------------
function showSaveOverlay_({ title = "יוצר תיק לקוח…", sub = "אנא המתן, המערכת שומרת ומסנכרנת…", seconds = 6 } = {}){
  const el = document.getElementById("saveOverlay");
  const titleEl = document.getElementById("saveOverlayTitle");
  const subEl = document.getElementById("saveOverlaySub");
  const secsEl = document.getElementById("saveOverlaySecs");
  if(!el) return { stop(){} };

  try{
    if(titleEl) titleEl.textContent = title;
    if(subEl) subEl.textContent = sub;
    if(secsEl) secsEl.textContent = String(Math.max(0, Number(seconds)||0));
    el.classList.add("is-open");
    el.setAttribute("aria-hidden","false");
  }catch(_){}

  let left = Math.max(0, Number(seconds)||0);
  let t = null;

  const tick = () => {
    left = Math.max(0, left - 1);
    try{ if(secsEl) secsEl.textContent = String(left); }catch(_){}
    if(left <= 0){
      // keep spinner, freeze at 0
      clearInterval(t); t = null;
    }
  };

  if(left > 0){
    t = setInterval(tick, 1000);
  }

  return {
    stop(){
      try{
        if(t) clearInterval(t);
        el.classList.remove("is-open");
        el.setAttribute("aria-hidden","true");
      }catch(_){}
    }
  };
}
// no-op

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
    .replaceAll("'", "&#039;")// ---------------------------
// Styled Confirm Modal (Premium, no browser confirm)
// ---------------------------
function ensureConfirmModal_(){
  let el = document.getElementById("confirmModal");
  if(el) return el;

  el = document.createElement("div");
  el.className = "modal";
  el.id = "confirmModal";
  el.setAttribute("aria-hidden","true");

  el.innerHTML = `
    <div class="modal__backdrop" data-confirm-close="1"></div>
    <div class="modal__panel" role="dialog" aria-modal="true" aria-labelledby="confirmTitle">
      <div class="modal__head">
        <div>
          <div class="modal__kicker">LEAD CORE</div>
          <div class="modal__title" id="confirmTitle">אישור פעולה</div>
        </div>
        <button class="iconBtn" data-confirm-close="1" aria-label="סגור">✕</button>
      </div>
      <div class="modal__body" style="padding:16px 16px 8px">
        <div id="confirmMsg" style="font-weight:900; font-size:16px">האם אתה בטוח?</div>
        <div class="muted" id="confirmSub" style="margin-top:6px; font-size:13px">הפעולה תתבצע רק לאחר אישור.</div>
      </div>
      <div class="modal__foot" style="justify-content:flex-start">
        <button class="btn" id="confirmCancelBtn" type="button">ביטול</button>
        <button class="btn btn--danger" id="confirmOkBtn" type="button">כן, בטל</button>
      </div>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function openConfirmModal_({ title, message, sub, okText, cancelText }){
  return new Promise((resolve) => {
    const el = ensureConfirmModal_();
    const titleEl = el.querySelector("#confirmTitle");
    const msgEl = el.querySelector("#confirmMsg");
    const subEl = el.querySelector("#confirmSub");
    const okBtn = el.querySelector("#confirmOkBtn");
    const cancelBtn = el.querySelector("#confirmCancelBtn");

    if(titleEl) titleEl.textContent = title || "אישור פעולה";
    if(msgEl) msgEl.textContent = message || "האם אתה בטוח?";
    if(subEl) subEl.textContent = sub || "הפעולה תתבצע רק לאחר אישור.";
    if(okBtn) okBtn.textContent = okText || "אישור";
    if(cancelBtn) cancelBtn.textContent = cancelText || "ביטול";

    let done = false;
    const close = (val) => {
      if(done) return;
      done = true;
      try{
        el.classList.remove("is-open");
        el.setAttribute("aria-hidden","true");
      }catch(_){}
      cleanup();
      resolve(!!val);
    };

    const onBackdrop = (e) => {
      if(e?.target?.matches?.("[data-confirm-close='1']")) close(false);
    };
    const onEsc = (e) => { if(e?.key === "Escape") close(false); };
    const onOk = () => close(true);
    const onCancel = () => close(false);

    const cleanup = () => {
      el.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onEsc);
      okBtn && okBtn.removeEventListener("click", onOk);
      cancelBtn && cancelBtn.removeEventListener("click", onCancel);
    };

    el.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onEsc);
    okBtn && okBtn.addEventListener("click", onOk);
    cancelBtn && cancelBtn.addEventListener("click", onCancel);

    el.classList.add("is-open");
    el.setAttribute("aria-hidden","false");
  });
}

;

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
      

// נציג מטפל מתחת לשם המבוטח (תצוגה בלבד)
try{
  const agentLine = document.getElementById("cfAgentUnderName");
  if(agentLine){
    agentLine.textContent = c && c.assignedAgent ? `נציג מטפל: ${c.assignedAgent}` : "";
  }
}catch(_){}
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

      // Topbar
      on($("#btnNewCustomer"), "click", () => this.openModal());

      // Nav
      $$(".nav__item").forEach(btn => {
        on(btn, "click", () => this.goView(btn.dataset.view));
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

      // Close handlers (scoped close: do NOT drop back to dashboard when closing policy cancel window)
      $$("[data-close='1']").forEach(el => on(el, "click", () => {
        // If the close button belongs to a specific overlay/modal, close only that one.
        if (el.closest("#modalPolicyAction")) return this.closePolicyActionModal();
        if (el.closest("#modalPolicy")) return this.closePolicyModal();
        if (el.closest("#modalCustomer")) return this.closeModal();
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

        const action = safeTrim(this.els.modalPolicyAction?.dataset?.action);
        const pid = safeTrim(this.els.modalPolicyAction?.dataset?.policyId);
        if (!action || !pid) return;

        // Premium confirm for cancellation
        if (action === "cancel") {
          const ok = await openConfirmModal_({
            title: "אישור ביטול פוליסה",
            message: "האם אתה בטוח שברצונך לבטל ביטוח זה?",
            sub: "",
            okText: "כן, בטל פוליסה",
            cancelText: "לא, חזור"
          });
          if (!ok) return;
        }

        if (btn) btn.disabled = true;
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
        
        // הצגת מסך שמירה (6 שניות)
        const saveOvCtl = showSaveOverlay_({ title: "יוצר תיק לקוח…", seconds: 6 });
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
          try{ saveOvCtl && saveOvCtl.stop && saveOvCtl.stop(); }catch(_){ }
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
      document.body.classList.toggle("view-dashboard-active", view === "dashboard");
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
      await App.boot();
    } catch (e) {
      console.error("LEAD_CORE boot error:", e);
      notify("שגיאה בעליית המערכת. פתח קונסול (F12) לפרטים.", "error");
    }
  });

  // Debug
  window.LEAD_CORE = { App, State, Storage, UI };
})();
