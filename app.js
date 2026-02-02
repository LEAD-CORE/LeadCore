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

  // Safe event binding (prevents "frozen app" if an element id changes)
  const on = (el, evt, fn, opts) => {
    if (!el) return false;
    on(el, evt, fn, opts);
    return true;
  };

  const nowISO = () => new Date().toISOString();
  const fmtMoney = (n) => {
    const x = Number(n || 0);
    return "₪" + x.toLocaleString("he-IL");
  };


  // Premium helper: prefer active policies sum, fallback to legacy monthlyPremium
  const customerTotalPremium = (c) => {
    const policies = Array.isArray(c?.policies) ? c.policies : [];
    const active = policies.filter(p => String(p.status || "active") !== "inactive");
    const sum = active.reduce((s, p) => s + Number(p.monthlyPremium || 0), 0);
    return sum > 0 ? sum : Number(c?.monthlyPremium || 0);
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
    out.customers = out.customers.map((c) => {
      const policiesIn = Array.isArray(c?.policies) ? c.policies : [];
      const docsIn = Array.isArray(c?.documents) ? c.documents : [];
      const timelineIn = Array.isArray(c?.timeline) ? c.timeline : [];
      const tasksIn = Array.isArray(c?.tasks) ? c.tasks : [];

      const customer = {
        id: safeTrim(c.id) || uid(),
        firstName: safeTrim(c.firstName),
        lastName: safeTrim(c.lastName),
        phone: safeTrim(c.phone),
        idNumber: safeTrim(c.idNumber),
        // legacy
        monthlyPremium: Number(c.monthlyPremium || 0),
        notes: safeTrim(c.notes),
        createdAt: safeTrim(c.createdAt) || nowISO(),
        updatedAt: safeTrim(c.updatedAt) || nowISO(),
        // extended
        policies: policiesIn.map(p => ({
          id: safeTrim(p.id) || uid(),
          type: safeTrim(p.type),
          company: safeTrim(p.company),
          status: safeTrim(p.status) || "active", // active | inactive
          monthlyPremium: Number(p.monthlyPremium || 0),
          createdAt: safeTrim(p.createdAt) || nowISO()
        })),
        documents: docsIn.map(d => ({
          id: safeTrim(d.id) || uid(),
          name: safeTrim(d.name) || "מסמך",
          url: safeTrim(d.url),
          at: safeTrim(d.at) || nowISO()
        })),
        timeline: timelineIn.map(t => ({
          id: safeTrim(t.id) || uid(),
          text: safeTrim(t.text),
          at: safeTrim(t.at) || nowISO()
        })),
        tasks: tasksIn.map(t => ({
          id: safeTrim(t.id) || uid(),
          text: safeTrim(t.text),
          done: Boolean(t.done),
          at: safeTrim(t.at) || nowISO()
        }))
      };

      return customer;
    });
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

      // Work panel elements
      this.els.drawerTotalPremium = $("#drawerTotalPremium");
      this.els.drawerPremiumSub = $("#drawerPremiumSub");

      this.els.drawerPhoneInput = $("#drawerPhoneInput");
      this.els.drawerIdInput = $("#drawerIdInput");

      this.els.drawerTabs = $$(".tabBtn", this.els.drawerCustomer);
      this.els.drawerPanes = $$(".wp__pane", this.els.drawerCustomer);

      this.els.policiesRows = $("#policiesRows");
      this.els.btnDrawerAddPolicy = $("#btnDrawerAddPolicy");
      this.els.btnAddPolicyTop = $("#btnAddPolicyTop");

      this.els.taskText = $("#taskText");
      this.els.btnDrawerAddTask = $("#btnDrawerAddTask");
      this.els.btnAddTaskTop = $("#btnAddTaskTop");
      this.els.btnTaskAdd = $("#btnTaskAdd");
      this.els.tasksList = $("#tasksList");

      this.els.logText = $("#logText");
      this.els.btnDrawerAddLog = $("#btnDrawerAddLog");
      this.els.btnLogAdd = $("#btnLogAdd");
      this.els.timelineList = $("#timelineList");

      this.els.docName = $("#docName");
      this.els.docUrl = $("#docUrl");
      this.els.btnAddDocTop = $("#btnAddDocTop");
      this.els.btnDocAdd = $("#btnDocAdd");
      this.els.docsList = $("#docsList");

      this.els.drawerDirtyHint = $("#drawerDirtyHint");
      this.els.btnSaveCustomer = $("#btnSaveCustomer");

      // Settings
      this.els.modeLocal = $("#modeLocal");
      this.els.modeSheets = $("#modeSheets");
      this.els.gsUrl = $("#gsUrl");
      this.els.btnTestConn = $("#btnTestConn");
      this.els.btnSyncNow = $("#btnSyncNow");
      this.els.btnResetLocal = $("#btnResetLocal");

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
      if (this.els.customersSearch) on(this.els.customersSearch, "input", () => this.renderCustomers());

      // Form submit
      on(this.els.customerForm, "submit", async (e) => {
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
          updatedAt: nowISO(),
          policies: [],
          documents: [],
          timeline: [],
          tasks: []
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
      on(this.els.btnSaveCustomer, "click", async () => {
        // Pull editable fields into state
        const id = UI.els.drawerCustomer.dataset.customerId;
        const c = State.data.customers.find(x => x.id === id);
        if (c) {
          c.phone = safeTrim(UI.els.drawerPhoneInput.value);
          c.idNumber = safeTrim(UI.els.drawerIdInput.value);
          c.updatedAt = nowISO();
        }

        await App.save("נשמר תיק לקוח");
        UI.clearDrawerDirty();
        UI.renderAll();
      });

      // Drawer tabs
      this.els.drawerTabs.forEach(b => {
        on(b, "click", () => this.setDrawerTab(b.dataset.tab));
      });

      // Drawer quick actions
      on(this.els.btnDrawerAddPolicy, "click", () => { this.addPolicy(); this.setDrawerTab("policies"); });
      on(this.els.btnAddPolicyTop, "click", () => this.addPolicy());

      on(this.els.btnDrawerAddTask, "click", () => { this.setDrawerTab("tasks"); this.els.taskText.focus(); });
      on(this.els.btnAddTaskTop, "click", () => { this.setDrawerTab("tasks"); this.els.taskText.focus(); });
      on(this.els.btnTaskAdd, "click", () => this.addTask());

      on(this.els.btnDrawerAddLog, "click", () => { this.setDrawerTab("timeline"); this.els.logText.focus(); });
      on(this.els.btnLogAdd, "click", () => this.addLog());

      on(this.els.btnAddDocTop, "click", () => { this.setDrawerTab("docs"); this.els.docName.focus(); });
      on(this.els.btnDocAdd, "click", () => this.addDoc());

      // Drawer editable fields -> mark dirty
      on(this.els.drawerPhoneInput, "input", () => this.markDrawerDirty());
      on(this.els.drawerIdInput, "input", () => this.markDrawerDirty());

      // Delegation: policies edits + deletions
      on(this.els.policiesRows, "input", (e) => {
        const row = e.target.closest(".polRow");
        if (!row) return;
        const polId = row.dataset.pol;
        const field = e.target.dataset.field;
        if (!field) return;
        const id = this.els.drawerCustomer.dataset.customerId;
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;
        const p = (c.policies || []).find(x => x.id === polId);
        if (!p) return;

        if (field === "monthlyPremium") {
          p.monthlyPremium = Number(String(e.target.value || "0").replace(/[^0-9.]/g, "")) || 0;
        } else {
          p[field] = safeTrim(e.target.value);
        }
        this.renderDrawerTotals(c);
        this.markDrawerDirty();
      });

      on(this.els.policiesRows, "click", (e) => {
        const btn = e.target.closest("[data-act]");
        if (!btn) return;
        const act = btn.dataset.act;
        const row = btn.closest(".polRow");
        const polId = row?.dataset.pol;
        const id = this.els.drawerCustomer.dataset.customerId;
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;

        if (act === "delPol" && polId) {
          c.policies = (c.policies || []).filter(x => x.id !== polId);
          this.renderPolicies(c);
          this.renderDrawerTotals(c);
          this.markDrawerDirty();
        }
      });

      // Delegation: tasks + logs + docs
      on(this.els.tasksList, "click", (e) => {
        const id = this.els.drawerCustomer.dataset.customerId;
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;

        const item = e.target.closest("[data-task]");
        const actBtn = e.target.closest("[data-act]");
        if (!item) return;
        const taskId = item.dataset.task;

        if (e.target.matches('input[type="checkbox"][data-act="toggleTask"]')) {
          const t = (c.tasks || []).find(x => x.id === taskId);
          if (t) t.done = e.target.checked;
          this.markDrawerDirty();
          return;
        }
        if (actBtn?.dataset.act === "delTask") {
          c.tasks = (c.tasks || []).filter(x => x.id !== taskId);
          this.renderTasks(c);
          this.markDrawerDirty();
        }
      });

      on(this.els.timelineList, "click", (e) => {
        const id = this.els.drawerCustomer.dataset.customerId;
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;

        const item = e.target.closest("[data-log]");
        const actBtn = e.target.closest("[data-act]");
        if (!item) return;
        const logId = item.dataset.log;

        if (actBtn?.dataset.act === "delLog") {
          c.timeline = (c.timeline || []).filter(x => x.id !== logId);
          this.renderTimeline(c);
          this.markDrawerDirty();
        }
      });

      on(this.els.docsList, "click", (e) => {
        const id = this.els.drawerCustomer.dataset.customerId;
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;

        const item = e.target.closest("[data-doc]");
        const actBtn = e.target.closest("[data-act]");
        if (!item) return;
        const docId = item.dataset.doc;

        if (actBtn?.dataset.act === "delDoc") {
          c.documents = (c.documents || []).filter(x => x.id !== docId);
          this.renderDocs(c);
          this.markDrawerDirty();
        }
      });

      // Settings
      on(this.els.modeLocal, "click", () => App.setMode("local"));
      on(this.els.modeSheets, "click", () => App.setMode("sheets"));

      on(this.els.gsUrl, "change", () => {
        Storage.gsUrl = safeTrim(this.els.gsUrl.value);
        localStorage.setItem("LEAD_CORE_GS_URL", Storage.gsUrl);
      });

      on(this.els.btnTestConn, "click", async () => {
        const r = await App.testConnection();
        alert(r.ok ? "חיבור תקין ✔" : ("חיבור נכשל: " + (r.error || "שגיאה")));
      });

      on(this.els.btnSyncNow, "click", async () => {
        const r = await App.syncNow();
        alert(r.ok ? "סנכרון בוצע ✔" : ("סנכרון נכשל: " + (r.error || "שגיאה")));
      });

      on(this.els.btnResetLocal, "click", () => {
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

      // Ensure extended arrays exist
      c.policies ||= [];
      c.documents ||= [];
      c.timeline ||= [];
      c.tasks ||= [];

      this.els.drawerTitle.textContent = `${c.firstName} ${c.lastName}`.trim() || "תיק לקוח";

      // Fill editable fields
      this.els.drawerPhoneInput.value = c.phone || "";
      this.els.drawerIdInput.value = c.idNumber || "";

      // Render sections
      this.renderPolicies(c);
      this.renderTasks(c);
      this.renderTimeline(c);
      this.renderDocs(c);
      this.renderDrawerTotals(c);

      // default tab
      this.setDrawerTab("policies");

      // store "current"
      this.els.drawerCustomer.dataset.customerId = c.id;

      this.els.drawerCustomer.classList.add("is-open");
      this.els.drawerCustomer.setAttribute("aria-hidden", "false");
    },

    

    setDrawerTab(tab) {
      // tabs
      this.els.drawerTabs.forEach(b => {
        const on = b.dataset.tab === tab;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      this.els.drawerPanes.forEach(p => p.classList.toggle("is-active", p.dataset.pane === tab));
    },

    markDrawerDirty() {
      if (this.els.drawerDirtyHint) this.els.drawerDirtyHint.textContent = "יש שינויים שלא נשמרו.";
      this.els.btnSaveCustomer.classList.add("is-dirty");
    },

    clearDrawerDirty() {
      if (this.els.drawerDirtyHint) this.els.drawerDirtyHint.textContent = "השינויים נשמרו.";
      this.els.btnSaveCustomer.classList.remove("is-dirty");
    },

    renderDrawerTotals(c) {
      const total = customerTotalPremium(c);
      this.els.drawerTotalPremium.textContent = fmtMoney(total);
      // hint
      const hasPolicies = Array.isArray(c.policies) && c.policies.length > 0;
      this.els.drawerPremiumSub.textContent = hasPolicies ? "לפי פוליסות פעילות" : "לפי פרמיה (ישן)";
    },

    renderPolicies(c) {
      const rows = (c.policies || []).map(p => `
        <div class="polRow" data-pol="${p.id}">
          <div>
            <input class="input input--compact" data-field="type" value="${escapeHtml(p.type || "")}" placeholder="לדוגמה: רכב" />
          </div>
          <div>
            <input class="input input--compact" data-field="company" value="${escapeHtml(p.company || "")}" placeholder="חברה" />
          </div>
          <div>
            <select class="input input--compact" data-field="status">
              <option value="active" ${p.status === "active" ? "selected" : ""}>פעילה</option>
              <option value="inactive" ${p.status === "inactive" ? "selected" : ""}>לא פעילה</option>
            </select>
          </div>
          <div class="t-right">
            <input class="input input--compact t-right" data-field="monthlyPremium" inputmode="decimal" value="${escapeHtml(String(p.monthlyPremium ?? ""))}" placeholder="0" />
          </div>
          <div class="t-right">
            <button class="iconBtn iconBtn--danger" data-act="delPol" title="מחיקה">🗑</button>
          </div>
        </div>
      `).join("");

      this.els.policiesRows.innerHTML = rows || `<div class="muted" style="padding:12px">אין פוליסות עדיין. לחץ “הוסף” כדי להתחיל.</div>`;
    },

    renderTasks(c) {
      const items = (c.tasks || []).slice().reverse().map(t => `
        <div class="listItem" data-task="${t.id}">
          <label class="chk">
            <input type="checkbox" data-act="toggleTask" ${t.done ? "checked" : ""}/>
            <span>${escapeHtml(t.text || "")}</span>
          </label>
          <button class="iconBtn iconBtn--danger" data-act="delTask">🗑</button>
        </div>
      `).join("");
      this.els.tasksList.innerHTML = items || `<div class="muted" style="padding:12px">אין משימות.</div>`;
    },

    renderTimeline(c) {
      const items = (c.timeline || []).slice().reverse().map(t => `
        <div class="listItem" data-log="${t.id}">
          <div>
            <div class="small">${escapeHtml(t.text || "")}</div>
            <div class="muted small">${new Date(t.at).toLocaleString("he-IL")}</div>
          </div>
          <button class="iconBtn iconBtn--danger" data-act="delLog">🗑</button>
        </div>
      `).join("");
      this.els.timelineList.innerHTML = items || `<div class="muted" style="padding:12px">אין תיעוד.</div>`;
    },

    renderDocs(c) {
      const items = (c.documents || []).slice().reverse().map(d => `
        <div class="listItem" data-doc="${d.id}">
          <div>
            <div class="small">${escapeHtml(d.name || "מסמך")}</div>
            <div class="muted small">${escapeHtml(d.url || "")}</div>
          </div>
          <div class="row" style="gap:8px; justify-content:flex-end">
            <a class="btn btn--sm" href="${escapeHtml(d.url || "#")}" target="_blank" rel="noopener">פתח</a>
            <button class="iconBtn iconBtn--danger" data-act="delDoc">🗑</button>
          </div>
        </div>
      `).join("");
      this.els.docsList.innerHTML = items || `<div class="muted" style="padding:12px">אין מסמכים.</div>`;
    },

    addPolicy() {
      const id = this.els.drawerCustomer.dataset.customerId;
      const c = State.data.customers.find(x => x.id === id);
      if (!c) return;
      c.policies ||= [];
      c.policies.push({ id: uid(), type: "", company: "", status: "active", monthlyPremium: 0, createdAt: nowISO() });
      this.renderPolicies(c);
      this.renderDrawerTotals(c);
      this.markDrawerDirty();
    },

    addTask() {
      const id = this.els.drawerCustomer.dataset.customerId;
      const c = State.data.customers.find(x => x.id === id);
      if (!c) return;
      const text = safeTrim(this.els.taskText.value);
      if (!text) return;
      c.tasks ||= [];
      c.tasks.push({ id: uid(), text, done:false, at: nowISO() });
      this.els.taskText.value = "";
      this.renderTasks(c);
      this.markDrawerDirty();
    },

    addLog() {
      const id = this.els.drawerCustomer.dataset.customerId;
      const c = State.data.customers.find(x => x.id === id);
      if (!c) return;
      const text = safeTrim(this.els.logText.value);
      if (!text) return;
      c.timeline ||= [];
      c.timeline.push({ id: uid(), text, at: nowISO() });
      this.els.logText.value = "";
      this.renderTimeline(c);
      this.markDrawerDirty();
    },

    addDoc() {
      const id = this.els.drawerCustomer.dataset.customerId;
      const c = State.data.customers.find(x => x.id === id);
      if (!c) return;
      const name = safeTrim(this.els.docName.value) || "מסמך";
      const url = safeTrim(this.els.docUrl.value);
      if (!url) return;
      c.documents ||= [];
      c.documents.push({ id: uid(), name, url, at: nowISO() });
      this.els.docName.value = "";
      this.els.docUrl.value = "";
      this.renderDocs(c);
      this.markDrawerDirty();
    },
closeDrawer() {
      this.els.drawerCustomer.classList.remove("is-open");
      this.els.drawerCustomer.setAttribute("aria-hidden", "true");
      this.els.drawerCustomer.dataset.customerId = "";
      this.clearDrawerDirty();
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
      const totalPremium = customers.reduce((sum, c) => sum + customerTotalPremium(c), 0);

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
      const q = safeTrim(this.els.customersSearch?.value).toLowerCase();
      const list = State.data.customers.filter(c => {
        if (!q) return true;
        const hay = `${c.firstName} ${c.lastName} ${c.phone} ${c.idNumber}`.toLowerCase();
        return hay.includes(q);
      });

      this.els.customersTbody.innerHTML = list.map(c => `
        <tr>
          <td>${escapeHtml(c.firstName)} ${escapeHtml(c.lastName)}</td>
          <td>${escapeHtml(c.phone || "")}</td>
          <td>${escapeHtml(c.idNumber || "")}</td>
          <td><span class="badge">${fmtMoney(customerTotalPremium(c))}</span></td>
          <td style="text-align:left">
            <button class="btn" data-open="${c.id}">פתח תיק</button>
          </td>
        </tr>
      `).join("") || `
        <tr><td colspan="5" class="muted" style="padding:18px">אין לקוחות להצגה</td></tr>
      `;

      // bind open buttons
      $$("button[data-open]", this.els.customersTbody).forEach(btn => {
        on(btn, "click", () => this.openDrawer(btn.dataset.open));
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
    try{
      UI.init();
      await App.boot();
    }catch(e){
      console.error("BOOT ERROR:", e);
      alert("שגיאת טעינה במערכת (בדוק Console). אם תרצה, שלח צילום מסך של השגיאה ואני אתקן מיד.");
    }
  });

  // Expose a minimal namespace for debugging without polluting global scope too much
  window.LEAD_CORE = { App, State, Storage, UI };
})();
