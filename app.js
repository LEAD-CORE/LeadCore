/* LEAD CORE • Premium CRM
   מבנה מודולרי כדי שלא “ידרוס” קוד בעת הוספת פיצ’רים.
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

  // Confirm replacement: double-click within 5s (no browser confirm)
  const confirmReset = (() => {
    let armedAt = 0;
    return (msg) => {
      const now = Date.now();
      if(now - armedAt <= 5000){
        armedAt = 0;
        return true;
      }
      armedAt = now;
      notify(msg || "לחץ שוב לאישור (5 שניות)", "warn");
      return false;
    };
  })();

  const showToast = () => {}; // no-op


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
    lastError: "",

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

      try{
        const url = new URL(this.gsUrl);
        url.searchParams.set("action", "get");

        const res = await fetch(url.toString(), { method: "GET", cache: "no-store", redirect: "follow" });
        if(!res.ok){
          return { ok:false, error: `שגיאת שרת (${res.status})` };
        }

        const ct = (res.headers.get("content-type") || "").toLowerCase();
        const txt = await res.text();

        // Apps Script sometimes returns an HTML login page when not deployed as "Anyone"
        if (ct.includes("text/html") || txt.trim().startsWith("<!DOCTYPE") || txt.trim().startsWith("<html")) {
          return { ok:false, error:"ה-Web App מחזיר HTML (כנראה הרשאות/פריסה לא פתוחה)" };
        }

        let json;
        try { json = JSON.parse(txt); } catch { return { ok:false, error:"תגובה לא JSON (בדוק URL/הרשאות)" }; }

        if (!json || json.ok !== true) return { ok: false, error: "שגיאת get" };

        const payload = normalizeState(json.payload || {});
        return { ok: true, payload, at: json.at || nowISO() };
      }catch(e){
        return { ok:false, error: String(e?.message || e) };
      }
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
      const r = (this.mode === "sheets") ? await this.loadSheets() : { ok:true, payload: this.loadLocal(), at: nowISO() };
      this.lastError = r.ok ? "" : (r.error || "שגיאה");
      return r;
    },

    async save(state) {
      const r = (this.mode === "sheets") ? await this.saveSheets(state) : this.saveLocal(state);
      this.lastError = r.ok ? "" : (r.error || "שגיאה");
      return r;
    }
  };

  function normalizeState(s) {
    const base = defaultState();
    const out = {
      meta: { ...(s?.meta || {}) },
      agents: Array.isArray(s?.agents) ? s.agents : [{ id: "a_yuval", name: "יובל מנדלסון" }],
      customers: Array.isArray(s?.customers) ? s.customers : [],
      activity: Array.isArray(s?.activity) ? s.activity : base.activity
    };
        // normalize agents
    out.agents = (out.agents || []).map((a, idx) => ({
      id: safeTrim(a.id) || ("a_" + idx),
      name: safeTrim(a.name) || "נציג"
    })).filter(a => a.name);

    if(out.agents.length === 0){
      out.agents = [{ id: "a_yuval", name: "יובל מנדלסון" }];
    }

// normalize customer objects
    out.customers = out.customers.map((c) => ({
      id: safeTrim(c.id) || uid(),
      firstName: safeTrim(c.firstName),
      lastName: safeTrim(c.lastName),
      phone: safeTrim(c.phone),
      idNumber: safeTrim(c.idNumber),
      assignedAgent: safeTrim(c.assignedAgent) || "",
      monthlyPremium: Number(c.monthlyPremium || 0),
      notes: safeTrim(c.notes),
      createdAt: safeTrim(c.createdAt) || nowISO(),
      updatedAt: safeTrim(c.updatedAt) || nowISO(),
      assignedAgent: safeTrim(c.assignedAgent),
      policies: Array.isArray(c.policies) ? c.policies.map((p) => ({
        id: safeTrim(p.id) || ("p_" + uid()),
        type: safeTrim(p.type),
        company: safeTrim(p.company),
        premium: Number(p.premium || 0),
        status: safeTrim(p.status) || "פעיל",
        renewAt: safeTrim(p.renewAt)
      })) : []
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
      this.els.globalSearch = $("#globalSearch");
      this.els.btnSearch = $("#btnSearch");

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
      this.els.newAssignedAgent = $("#newAssignedAgent");
      this.els.drawerCustomer = $("#drawerCustomer");

      this.els.drawerTitle = $("#drawerTitle");
      this.els.drawerPremium = $("#drawerPremium");
      this.els.drawerName = $("#drawerName");
      this.els.drawerPhone = $("#drawerPhone");
      this.els.drawerId = $("#drawerId");
      this.els.drawerNotes = $("#drawerNotes");
      this.els.btnSaveCustomer = $("#btnSaveCustomer");

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
      this.els.btnAddPolicy = $("#btnAddPolicy");

      // Policy modal
      this.els.modalPolicy = $("#modalPolicy");
      this.els.policyForm = $("#policyForm");

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
on(this.els.globalSearch, "input", () => {
  if (!document.body.classList.contains("view-customers-active")) return;
  this.renderCustomers();
});
      if (this.els.customersSearch) this.els.customersSearch.addEventListener("input", () => this.renderCustomers());

// Search button: move matching customer(s) to top in Customers list
on(this.els.btnSearch, "click", () => {
  this.goView("customers");
  this.renderCustomers();
});

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
          assignedAgent: safeTrim(fd.get("assignedAgent")),
          monthlyPremium: 0,
          notes: "",
          policies: [],
          createdAt: nowISO(),
          updatedAt: nowISO()
        };

        if (!customer.firstName || !customer.lastName || !customer.phone) {
          notify("נא למלא שם פרטי, שם משפחה וטלפון.");
          return;
        }

        // ensure assigned agent defaults to first agent (no free text)
        const fallbackAgent = (State.data.agents && State.data.agents[0]) ? safeTrim(State.data.agents[0].name) : "";
        if (!safeTrim(customer.assignedAgent) && fallbackAgent) customer.assignedAgent = fallbackAgent;


        State.data.customers.unshift(customer);
        State.data.activity.unshift({ at: nowISO(), text: `נוצר לקוח חדש: ${customer.firstName} ${customer.lastName}` });
        State.data.meta.updatedAt = nowISO();

        const r = await App.save("נשמר לקוח");
        if (!r.ok) {
          notify("שמירה נכשלה – בדוק URL והרשאות Web App.", "error");
          return;
        }
        this.closeModal();
        this.openCustomerFull(customer.id);
        this.renderAll();
      });

      // Drawer save
      this.els.btnSaveCustomer.addEventListener("click", async () => {
        const r = await App.save("נשמר תיק לקוח");
        if (!r.ok) { notify("שמירה נכשלה – בדוק חיבור ל-Google Sheets.", "error"); return; }
        notify("נשמר ✔");
        this.renderAll();
      });


      on(this.els.btnAddPolicyInline, "click", async () => {
        const id = safeTrim(this.els.customerFull?.dataset?.customerId);
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;

        const company = safeTrim(this.els.cfAddCompany?.value);
        const type = safeTrim(this.els.cfAddType?.value);
        const premium = Number(String(this.els.cfAddPremium?.value || "").replace(/[^\d.]/g, "")) || 0;
        const renewAt = safeTrim(this.els.cfAddRenew?.value);

        if (!company || !type || !premium) {
          notify("נא לבחור חברה, סוג ביטוח ולהכניס פרמיה חודשית.");
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

        // ניקוי השורה להוספה
        try {
          if (this.els.cfAddCompany) this.els.cfAddCompany.selectedIndex = 0;
          if (this.els.cfAddType) this.els.cfAddType.selectedIndex = 0;
          if (this.els.cfAddPremium) this.els.cfAddPremium.value = "";
          if (this.els.cfAddRenew) this.els.cfAddRenew.value = "";
        } catch(_) {}

        c.updatedAt = nowISO();
        this.renderPolicies();
        const r = await App.save("נוסף ביטוח ללקוח");
        if (!r.ok) { notify("שמירה נכשלה – בדוק חיבור ל-Google Sheets.", "error"); return; }
        this.renderAll();
      });

      on(this.els.cfAgentSelect, "change", async () => {
        const id = safeTrim(this.els.customerFull?.dataset?.customerId);
        const c = State.data.customers.find(x => x.id === id);
        if (!c) return;
        const next = safeTrim(this.els.cfAgentSelect.value);
        if (next === safeTrim(c.assignedAgent)) return;
        c.assignedAgent = next;
        c.updatedAt = nowISO();
        const r = await App.save("עודכן נציג מטפל");
        if (!r.ok) { notify("שמירה נכשלה – בדוק חיבור ל-Google Sheets.", "error"); return; }
        this.renderAll();
      });

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
          notify("נא למלא סוג, חברה ופרמיה.");
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

        c.updatedAt = nowISO();
        this.closePolicyModal();
        this.renderPolicies();
        const r = await App.save("נוסף ביטוח ללקוח");
        if (!r.ok) { notify("שמירה נכשלה – בדוק חיבור ל-Google Sheets.", "error"); return; }
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
        notify(r.ok ? "חיבור תקין ✔" : ("חיבור נכשל: " + (r.error || "שגיאה")));
      });

      this.els.btnSyncNow.addEventListener("click", async () => {
        const r = await App.syncNow();
        notify(r.ok ? "סנכרון בוצע ✔" : ("סנכרון נכשל: " + (r.error || "שגיאה")));
      });

      this.els.btnResetLocal.addEventListener("click", () => {
        if(!confirmReset("לאפס את ה-Local?")){
        try{
          const b=document.getElementById("btnResetLocal");
          if(b){
            const old=b.dataset.oldLabel || b.textContent;
            b.dataset.oldLabel = old;
            b.textContent = "לחץ שוב לאישור (5ש׳)";
            clearTimeout(b.__lcT);
            b.__lcT=setTimeout(()=>{ b.textContent=b.dataset.oldLabel||"איפוס Local"; }, 5200);
          }
        }catch(_){}
        return;
      }
        localStorage.removeItem(Storage.localKey);
        State.set(defaultState());
        this.renderAll();
        notify("אופס Local בוצע.");
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

      // populate agents dropdown (new customer)
      if (this.els.newAssignedAgent) {
        this.els.newAssignedAgent.innerHTML = (State.data.agents || []).map(a =>
          `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`
        ).join("");
      }
      this.els.modalCustomer.classList.add("is-open");
      this.els.modalCustomer.setAttribute("aria-hidden", "false");
      // focus first input
      setTimeout(() => this.els.customerForm.querySelector("input[name='firstName']").focus(), 50);
    },

    closeModal() {
      this.els.modalCustomer.classList.remove("is-open");
      this.els.modalCustomer.setAttribute("aria-hidden", "true");
    },


    // ---------- Customer File (Full Screen) ----------
    openCustomerFull(customerId) {
      const c = State.data.customers.find(x => x.id === customerId);
      if (!c || !this.els.customerFull) return;

      this.els.customerFull.dataset.customerId = c.id;

      this.els.cfName.textContent = `${c.firstName} ${c.lastName}`.trim() || "—";
      this.els.cfPhone.textContent = c.phone || "—";
      this.els.cfId.textContent = c.idNumber || "—";

            // agent select (no free text)
      if (this.els.cfAgentSelect) {
        this.els.cfAgentSelect.innerHTML = (State.data.agents || []).map(a =>
          `<option value="${escapeHtml(a.name)}">${escapeHtml(a.name)}</option>`
        ).join("");

        const fallback = (State.data.agents && State.data.agents[0]) ? State.data.agents[0].name : "";
        if (!c.assignedAgent && fallback) c.assignedAgent = fallback;

        // Ensure the select reflects current assignment
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

    // ---------- Policy Modal ----------
    openPolicyModal() {
      if (!this.els.modalPolicy) return;
      if (this.els.policyForm) this.els.policyForm.reset();
      this.els.modalPolicy.classList.add("is-open");
      this.els.modalPolicy.setAttribute("aria-hidden", "false");
      setTimeout(() => {
        try {
          const el = this.els.policyForm?.querySelector("[name='type']");
          if (el) el.focus();
        } catch(_) {}
      }, 50);
    },

    closePolicyModal() {
      if (!this.els.modalPolicy) return;
      this.els.modalPolicy.classList.remove("is-open");
      this.els.modalPolicy.setAttribute("aria-hidden", "true");
    },

    renderPolicies() {
      const id = safeTrim(this.els.customerFull?.dataset?.customerId);
      const c = State.data.customers.find(x => x.id === id);
      if (!c) return;

      c.policies ||= [];

      // כרגע מציגים את כל הביטוחים (סטטוס נשמר פנימית לשלב הבא)
      const list = c.policies.slice();

      const total = list.reduce((s,p)=> s + Number(p.premium||0), 0);
      const activeCount = list.length;

      // Sync old field used elsewhere
      c.monthlyPremium = total;

      if (this.els.cfTotalPremium) this.els.cfTotalPremium.textContent = fmtMoney(total);
      if (this.els.cfActiveCount) this.els.cfActiveCount.textContent = String(activeCount);
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
        btn.addEventListener("click", async () => {
          const pid = btn.dataset.delpol;
          c.policies = (c.policies || []).filter(x => x.id !== pid);
          c.updatedAt = nowISO();
          this.renderPolicies();
          const r = await App.save("נמחק ביטוח מהלקוח");
          if (!r.ok) { notify("שמירה נכשלה – בדוק חיבור ל-Google Sheets.", "error"); return; }
          this.renderAll();
        });
      });
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
      this.closePolicyModal();
      this.closeCustomerFull();
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

      // Keep original order index so non-matching customers don't "shuffle"
      const scored = State.data.customers.map((c, idx) => {
        const name = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
        const phone = String(c.phone || "").toLowerCase();
        const idn = String(c.idNumber || "").toLowerCase();
        const hay = `${name} ${phone} ${idn}`.trim();

        let score = 0;
        if (q) {
          // Strongest: startsWith on name/phone/id
          if (name.startsWith(q) || phone.startsWith(q) || idn.startsWith(q)) score = 300;
          // Next: includes anywhere
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

      // bind open buttons
      $$("button[data-open]", this.els.customersTbody).forEach(btn => {
        btn.addEventListener("click", () => this.openCustomerFull(btn.dataset.open));
      });
    },

    renderSyncStatus() {
      const dot = this.els.syncDot;
      const txt = this.els.syncText;
      const last = this.els.lastSyncText;

      const modeLabel = Storage.mode === "sheets" ? "Google Sheets" : "Local";
      txt.textContent = `מצב: ${modeLabel}`;

      dot.classList.remove("ok","warn","err");

      // Error has highest priority
      if (safeTrim(Storage.lastError)) {
        dot.classList.add("err");
        last.textContent = "שגיאה: " + Storage.lastError;
        return;
      }

      if (Storage.mode === "local") {
        dot.classList.add("ok");
      } else {
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
      Storage.mode = localStorage.getItem("LEAD_CORE_MODE") || "sheets";

      if (Storage.mode !== "local" && Storage.mode !== "sheets") Storage.mode = "sheets";
      // hard default: prefer Google Sheets unless user explicitly chose local
      // (keeps cross-computer consistency)
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
        Storage.lastError = r.error || "בעיה בחיבור ל-Sheets";
        State.data.activity.unshift({ at: nowISO(), text: "המערכת עלתה ב-Local (בעיה בחיבור ל-Sheets)." });
      }

      UI.renderAll();
      UI.goView("dashboard");
    },

    async save(activityText) {
      State.data.meta.updatedAt = nowISO();
      if (activityText) State.data.activity.unshift({ at: nowISO(), text: activityText });

      // Guard: do not allow "Sheets" operations without a Web App URL
      if (Storage.mode === "sheets" && !safeTrim(Storage.gsUrl)) {
        const err = { ok: false, error: "אין כתובת Web App" };
        Storage.lastError = err.error;
        State.data.activity.unshift({ at: nowISO(), text: "שמירה נחסמה: חסר URL של Web App (Google Sheets)." });
        UI.renderSyncStatus();
        return err;
      }

      // If drawer open, update from "current"
      const currentId = UI.els.drawerCustomer.dataset.customerId;
      if (currentId) {
        const c = State.data.customers.find(x => x.id === currentId);
        if (c) c.updatedAt = nowISO();
      }

      try{
        const r = await Storage.save(State.data);
        if (!r.ok) {
          State.data.activity.unshift({ at: nowISO(), text: "שמירה נכשלה: " + (r.error || "שגיאה") });
        }
        UI.renderSyncStatus();
        return r;
      }catch(e){
        const msg = String(e?.message || e);
        Storage.lastError = msg;
        State.data.activity.unshift({ at: nowISO(), text: "שמירה נכשלה (חריגה): " + msg });
        UI.renderSyncStatus();
        return { ok:false, error: msg };
      }
    },

    async setMode(mode) {
      Storage.mode = mode;
      localStorage.setItem("LEAD_CORE_MODE", mode);

      if (mode === "sheets" && !safeTrim(Storage.gsUrl)) {
        notify("שים לב: מצב Google Sheets נבחר אבל חסר URL של Web App.", "warn");
      }

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
          notify("לא ניתן לטעון מ-Sheets: " + (r.error || "שגיאה"));
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
      notify("שגיאה בעליית המערכת. פתח קונסול (F12) לפרטים.");
    }
  });

  // Expose a minimal namespace for debugging without polluting global scope too much
  window.LEAD_CORE = { App, State, Storage, UI };
})();
