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
    customers: [],
    agents: [
      { id: "a_1", name: "יובל מנדלסון" },
      { id: "a_2", name: "דנה כהן" },
      { id: "a_3", name: "אור מנהל" }
    ],
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
      agents: Array.isArray(s?.agents) ? s.agents : base.agents,
      activity: Array.isArray(s?.activity) ? s.activity : base.activity
    };
    // normalize customer objects
    
out.customers = out.customers.map((c) => {
      const policies = Array.isArray(c?.policies) ? c.policies : [];
      return {
        id: safeTrim(c.id) || uid(),
        firstName: safeTrim(c.firstName),
        lastName: safeTrim(c.lastName),
        phone: safeTrim(c.phone),
        idNumber: safeTrim(c.idNumber),
        monthlyPremium: Number(c.monthlyPremium || 0),
        notes: safeTrim(c.notes),
        assignedAgentId: safeTrim(c.assignedAgentId),
        policies: policies.map((p) => ({
          id: safeTrim(p.id) || ("p_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16)),
          type: safeTrim(p.type),
          company: safeTrim(p.company),
          premium: Number(p.premium || 0),
          status: safeTrim(p.status) || "פעיל",
          renewAt: safeTrim(p.renewAt)
        })),
        createdAt: safeTrim(c.createdAt) || nowISO(),
        updatedAt: safeTrim(c.updatedAt) || nowISO()
      };
    });

    // normalize agents
    out.agents = (out.agents || []).map(a => ({ id: safeTrim(a.id) || uid(), name: safeTrim(a.name) })).filter(a => a.name);
    if(out.agents.length === 0){ out.agents = defaultState().agents; }

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
      this.els.drawerCustomer = $("#drawerCustomer");

      // Fullscreen Customer
      this.els.customerFull = $("#customerFull");
      this.els.cfTitle = $("#cfTitle");
      this.els.cfPhone = $("#cfPhone");
      this.els.cfId = $("#cfId");
      this.els.cfAgentSelect = $("#cfAgentSelect");
      this.els.cfTotalPremium = $("#cfTotalPremium");
      this.els.cfAssignedAgent = $("#cfAssignedAgent");
      this.els.cfActiveCount = $("#cfActiveCount");
      this.els.cfOnlyActive = $("#cfOnlyActive");
      this.els.cfFilterCompany = $("#cfFilterCompany");
      this.els.cfFilterType = $("#cfFilterType");
      this.els.cfPoliciesTbody = $("#cfPoliciesTbody");
      this.els.cfBtnSave = $("#cfBtnSave");

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
          monthlyPremium: 0,
          notes: "",
          assignedAgentId: (State.data.agents && State.data.agents[0] ? State.data.agents[0].id : ""),
          policies: [],
          createdAt: nowISO(),
          updatedAt: nowISO()
        };

        if (!customer.firstName || !customer.lastName || !customer.phone) {
          notify("נא למלא שם פרטי, שם משפחה וטלפון.");
          return;
        }

        State.data.customers.unshift(customer);
        State.data.activity.unshift({ at: nowISO(), text: `נוצר לקוח חדש: ${customer.firstName} ${customer.lastName}` });
        State.data.meta.updatedAt = nowISO();

        await App.save("נשמר לקוח");
        this.closeModal();
        this.openCustomerFull(customer.id);
        this.renderAll();
      });

      // Drawer save
      this.els.btnSaveCustomer.addEventListener("click", async () => {
        await App.save("נשמר תיק לקוח");
        notify("נשמר ✔");
        this.renderAll();
      });

      // Fullscreen save + filters
      on(this.els.cfBtnSave, "click", async () => {
        await App.save("נשמר תיק לקוח");
        notify("נשמר ✔");
        this.renderAll();
        this.renderCustomerFull(); // refresh totals
      });

      const reRenderPolicies = () => this.renderCustomerFull();
      on(this.els.cfOnlyActive, "change", reRenderPolicies);
      on(this.els.cfFilterCompany, "change", reRenderPolicies);
      on(this.els.cfFilterType, "change", reRenderPolicies);
      on(this.els.cfAgentSelect, "change", async () => {
        const currentId = this.els.customerFull?.dataset?.customerId;
        const c = State.data.customers.find(x => x.id === currentId);
        if(!c) return;
        c.assignedAgentId = safeTrim(this.els.cfAgentSelect.value);
        c.updatedAt = nowISO();
        State.data.activity.unshift({ at: nowISO(), text: `שונה נציג מטפל ללקוח: ${c.firstName} ${c.lastName}` });
        await App.save();
        this.renderCustomerFull();
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
      this.els.modalCustomer.classList.add("is-open");
      this.els.modalCustomer.setAttribute("aria-hidden", "false");
      // focus first input
      setTimeout(() => this.els.customerForm.querySelector("input[name='firstName']").focus(), 50);
    },

    closeModal() {
      this.els.modalCustomer.classList.remove("is-open");
      this.els.modalCustomer.setAttribute("aria-hidden", "true");
    },


    openCustomerFull(customerId) {
      const c = State.data.customers.find(x => x.id === customerId);
      if (!c) return;

      // store current
      this.els.customerFull.dataset.customerId = c.id;

      // header
      this.els.cfTitle.textContent = `${c.firstName} ${c.lastName}`.trim() || "—";
      this.els.cfPhone.textContent = c.phone || "—";
      this.els.cfId.textContent = c.idNumber || "—";

      // agents dropdown
      const agents = Array.isArray(State.data.agents) ? State.data.agents : [];
      this.els.cfAgentSelect.innerHTML = agents.map(a => `
        <option value="${escapeHtml(a.id)}">${escapeHtml(a.name)}</option>
      `).join("") || `<option value="">—</option>`;
      // default if missing
      if (!c.assignedAgentId && agents[0]) c.assignedAgentId = agents[0].id;
      this.els.cfAgentSelect.value = c.assignedAgentId || (agents[0]?.id || "");

      this.els.customerFull.classList.add("is-open");
      this.els.customerFull.setAttribute("aria-hidden", "false");

      this.renderCustomerFull();
    },

    renderCustomerFull() {
      const currentId = this.els.customerFull?.dataset?.customerId;
      const c = State.data.customers.find(x => x.id === currentId);
      if (!c) return;

      const agents = Array.isArray(State.data.agents) ? State.data.agents : [];
      const agentName = agents.find(a => a.id === c.assignedAgentId)?.name || "—";
      this.els.cfAssignedAgent.textContent = agentName;

      const onlyActive = !!this.els.cfOnlyActive?.checked;
      const fCompany = safeTrim(this.els.cfFilterCompany?.value);
      const fType = safeTrim(this.els.cfFilterType?.value);

      const policies = Array.isArray(c.policies) ? c.policies : [];

      // build filter options from policies
      const companies = Array.from(new Set(policies.map(p => safeTrim(p.company)).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'he'));
      const types = Array.from(new Set(policies.map(p => safeTrim(p.type)).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'he'));

      // preserve current selections
      const prevCompany = this.els.cfFilterCompany.value;
      const prevType = this.els.cfFilterType.value;

      this.els.cfFilterCompany.innerHTML = `<option value="">כל החברות</option>` + companies.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
      this.els.cfFilterType.innerHTML = `<option value="">כל הסוגים</option>` + types.map(x => `<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");

      // restore if still exists
      if (companies.includes(prevCompany)) this.els.cfFilterCompany.value = prevCompany;
      if (types.includes(prevType)) this.els.cfFilterType.value = prevType;

      const filtered = policies.filter(p => {
        const status = safeTrim(p.status) || "פעיל";
        if (onlyActive && status !== "פעיל") return false;
        if (fCompany && safeTrim(p.company) !== fCompany) return false;
        if (fType && safeTrim(p.type) !== fType) return false;
        return true;
      });

      // totals
      const total = filtered.reduce((sum, p) => {
        const status = safeTrim(p.status) || "פעיל";
        if (status === "בוטל") return sum; // never count canceled
        return sum + Number(p.premium || 0);
      }, 0);

      const activeCount = policies.filter(p => (safeTrim(p.status) || "פעיל") === "פעיל").length;

      this.els.cfTotalPremium.textContent = fmtMoney(total);
      this.els.cfActiveCount.textContent = String(activeCount);

      // table
      this.els.cfPoliciesTbody.innerHTML = (filtered.map(p => {
        const status = safeTrim(p.status) || "פעיל";
        const badgeClass = status === "פעיל" ? "badge--ok" : status === "בהצעה" ? "badge--warn" : "badge--err";
        const renew = safeTrim(p.renewAt);
        const renewTxt = renew ? new Date(renew).toLocaleDateString("he-IL") : "—";
        return `
          <tr>
            <td>${escapeHtml(p.type || "—")}</td>
            <td>${escapeHtml(p.company || "—")}</td>
            <td><span class="badge">${fmtMoney(p.premium || 0)}</span></td>
            <td><span class="badge ${badgeClass}">${escapeHtml(status)}</span></td>
            <td>${escapeHtml(renewTxt)}</td>
          </tr>
        `;
      }).join("")) || `
        <tr><td colspan="5" class="muted" style="padding:18px">אין ביטוחים להצגה. (בשלב הבא נוסיף “+ הוסף ביטוח”)</td></tr>
      `;
    },

    closeCustomerFull() {
      if(!this.els.customerFull) return;
      this.els.customerFull.classList.remove("is-open");
      this.els.customerFull.setAttribute("aria-hidden", "true");
      this.els.customerFull.dataset.customerId = "";
    },

    // Backward compatibility (drawer) - kept but unused
    openDrawer(customerId) { this.openCustomerFull(customerId); },


    closeDrawer() {
      // legacy drawer close
      this.els.drawerCustomer.classList.remove("is-open");
      this.els.drawerCustomer.setAttribute("aria-hidden", "true");
      this.els.drawerCustomer.dataset.customerId = "";
    },

    closeOverlays() {
      this.closeModal();
      this.closeDrawer();
      this.closeCustomerFull();
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
      const currentId = UI.els.customerFull?.dataset?.customerId || UI.els.drawerCustomer.dataset.customerId;
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
