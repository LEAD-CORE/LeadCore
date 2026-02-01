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

  const nowISO = () => new Date().toISOString();
  const fmtMoney = (n) => {
    const x = Number(n || 0);
    return "₪" + x.toLocaleString("he-IL");
  };

  
  // ---------------------------
  // Client File helpers (תיק לקוח)
  // ---------------------------
  const ensureCustomerExtras = (c) => {
    c.policies ||= [];
    c.documents ||= [];
    c.timeline ||= [];
    c.tasks ||= [];
    // normalize arrays
    if (!Array.isArray(c.policies)) c.policies = [];
    if (!Array.isArray(c.documents)) c.documents = [];
    if (!Array.isArray(c.timeline)) c.timeline = [];
    if (!Array.isArray(c.tasks)) c.tasks = [];
    return c;
  };

  const computeCustomerPremium = (c) => {
    ensureCustomerExtras(c);
    const hasPolicies = c.policies.length > 0;
    if (!hasPolicies) return Number(c.monthlyPremium || 0) || 0;

    return c.policies
      .filter(p => (p.status || "פעילה") === "פעילה")
      .reduce((sum, p) => sum + Number(p.monthlyPremium || 0), 0);
  };

  const makeId = (prefix = "id") =>
    `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;

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
      this.els.customersSearch = $("#customersSearch") || $("#globalSearch");
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
      // Drawer tabs (Client File)
      this.els.drawerTabs = $("#drawerTabs");
      this.els.drawerPoliciesTbody = $("#drawerPoliciesTbody");
      this.els.drawerDocsList = $("#drawerDocsList");
      this.els.drawerTimeline = $("#drawerTimeline");
      this.els.drawerTasksList = $("#drawerTasksList");
      this.els.btnAddPolicy = $("#btnAddPolicy");
      this.els.btnAddDoc = $("#btnAddDoc");
      this.els.btnAddLog = $("#btnAddLog");
      this.els.btnAddTask = $("#btnAddTask");


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
          monthlyPremium: Number(fd.get("monthlyPremium") || 0),
          notes: safeTrim(fd.get("notes")),
          policies: [],
          documents: [],
          timeline: [],
          tasks: [],
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
        /* נשמר בהצלחה */
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
      ensureCustomerExtras(c);
      this.els.drawerPremium.textContent = fmtMoney(computeCustomerPremium(c));
      this.els.drawerName.textContent = `${c.firstName} ${c.lastName}`;
      this.els.drawerPhone.textContent = c.phone || "—";
      this.els.drawerId.textContent = c.idNumber || "—";
      this.els.drawerNotes.textContent = c.notes || "—";

      // store "current"
      this.els.drawerCustomer.dataset.customerId = c.id;
      // Render tabs content
      this.renderDrawerTabs(c);


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
    // ---------------------------
    // Drawer Tabs (תיק לקוח)
    // ---------------------------
    switchDrawerTab(key) {
      if (!this.els.drawerTabs) return;
      $$(".tab", this.els.drawerTabs).forEach(b => {
        b.classList.toggle("is-active", b.dataset.tab === key);
      });
      ["policies","docs","timeline","tasks"].forEach(k => {
        const pane = $("#tab-" + k);
        if (!pane) return;
        pane.classList.toggle("is-active", k === key);
      });
    },

    renderDrawerTabs(customer) {
      ensureCustomerExtras(customer);

      // Tabs click
      if (this.els.drawerTabs && !this.els.drawerTabs.dataset.wired) {
        this.els.drawerTabs.dataset.wired = "1";
        this.els.drawerTabs.addEventListener("click", (e) => {
          const btn = e.target.closest(".tab");
          if (!btn) return;
          this.switchDrawerTab(btn.dataset.tab);
        });
      }

      // Buttons
      if (this.els.btnAddPolicy && !this.els.btnAddPolicy.dataset.wired) {
        this.els.btnAddPolicy.dataset.wired = "1";
        this.els.btnAddPolicy.addEventListener("click", () => {
          const type = prompt("סוג ביטוח (רכב/דירה/בריאות/חיים/נסיעות/עסק/אחר):", "רכב");
          if (type === null) return;
          const company = prompt("חברה:", "הראל");
          if (company === null) return;
          const policyNumber = prompt("מס׳ פוליסה (אופציונלי):", "") ?? "";
          const status = prompt("סטטוס (פעילה/בהצעה/בוטלה/הסתיימה):", "פעילה");
          if (status === null) return;
          const prem = Number(String(prompt("פרמיה חודשית (מספר):", "0") ?? "0").replace(/[^\d.]/g,"")) || 0;

          customer.policies.unshift({
            id: makeId("pol"),
            type: safeTrim(type) || "אחר",
            company: safeTrim(company),
            policyNumber: safeTrim(policyNumber),
            status: safeTrim(status) || "פעילה",
            monthlyPremium: prem
          });
          State.data.meta.updatedAt = nowISO();
          this.renderDrawerTabs(customer);
          this.els.drawerPremium.textContent = fmtMoney(computeCustomerPremium(customer));
        });
      }

      if (this.els.btnAddDoc && !this.els.btnAddDoc.dataset.wired) {
        this.els.btnAddDoc.dataset.wired = "1";
        this.els.btnAddDoc.addEventListener("click", () => {
          const name = prompt("שם מסמך:", "מסמך חדש");
          if (!name) return;
          const url = prompt("קישור למסמך (URL):", "") ?? "";
          const status = prompt("סטטוס (טיוטה/נשלח/נחתם):", "טיוטה");
          if (status === null) return;

          customer.documents.unshift({
            id: makeId("doc"),
            name: safeTrim(name),
            url: safeTrim(url),
            status: safeTrim(status) || "טיוטה",
            at: nowISO()
          });
          State.data.activity.unshift({ at: nowISO(), text: `נוסף מסמך ללקוח: ${customer.firstName} ${customer.lastName}` });
          State.data.meta.updatedAt = nowISO();
          this.renderDrawerTabs(customer);
        });
      }

      if (this.els.btnAddLog && !this.els.btnAddLog.dataset.wired) {
        this.els.btnAddLog.dataset.wired = "1";
        this.els.btnAddLog.addEventListener("click", () => {
          const type = prompt("סוג תיעוד (שיחה/וואטסאפ/מייל/פגישה/הערה):", "שיחה");
          if (type === null) return;
          const text = prompt("סיכום קצר:", "");
          if (!text) return;

          customer.timeline.unshift({
            id: makeId("log"),
            type: safeTrim(type) || "הערה",
            at: nowISO(),
            text: safeTrim(text)
          });
          State.data.activity.unshift({ at: nowISO(), text: `תועד ${type} עם ${customer.firstName} ${customer.lastName}` });
          State.data.meta.updatedAt = nowISO();
          this.renderDrawerTabs(customer);
        });
      }

      if (this.els.btnAddTask && !this.els.btnAddTask.dataset.wired) {
        this.els.btnAddTask.dataset.wired = "1";
        this.els.btnAddTask.addEventListener("click", () => {
          const action = prompt("פעולה הבאה (חזרה ללקוח/שליחת הצעה/מסמכים/מעקב/אחר):", "חזרה ללקוח");
          if (!action) return;
          const due = prompt("תאריך יעד (YYYY-MM-DD):", new Date(Date.now()+86400000).toISOString().slice(0,10));
          if (due === null) return;

          customer.tasks.unshift({
            id: makeId("task"),
            action: safeTrim(action),
            due: safeTrim(due),
            status: "פתוח",
            at: nowISO()
          });
          State.data.meta.updatedAt = nowISO();
          this.renderDrawerTabs(customer);
        });
      }

      // Render Policies
      if (this.els.drawerPoliciesTbody) {
        const rows = customer.policies.map(p => `
          <tr data-id="${escapeHtml(p.id)}">
            <td><input value="${escapeHtml(p.type||"")}" data-k="type" /></td>
            <td><input value="${escapeHtml(p.company||"")}" data-k="company" /></td>
            <td><input value="${escapeHtml(p.policyNumber||"")}" data-k="policyNumber" /></td>
            <td>
              <select data-k="status">
                ${["פעילה","בהצעה","בוטלה","הסתיימה"].map(s => `<option ${s===p.status?"selected":""}>${s}</option>`).join("")}
              </select>
            </td>
            <td><input inputmode="numeric" value="${escapeHtml(String(p.monthlyPremium ?? ""))}" data-k="monthlyPremium" /></td>
            <td style="text-align:left">
              <button class="btn iconBtn iconBtn--danger" type="button" data-del="${escapeHtml(p.id)}">מחק</button>
            </td>
          </tr>
        `).join("");

        this.els.drawerPoliciesTbody.innerHTML = rows || `<tr><td colspan="6" class="muted">אין ביטוחים. לחץ “הוסף ביטוח”.</td></tr>`;

        if (!this.els.drawerPoliciesTbody.dataset.wired) {
          this.els.drawerPoliciesTbody.dataset.wired = "1";
          this.els.drawerPoliciesTbody.addEventListener("input", (e) => {
            const tr = e.target.closest("tr[data-id]");
            if (!tr) return;
            const id = tr.dataset.id;
            const key = e.target.getAttribute("data-k");
            if (!key) return;
            const pol = customer.policies.find(x => x.id === id);
            if (!pol) return;
            if (key === "monthlyPremium") {
              pol.monthlyPremium = Number(String(e.target.value||"0").replace(/[^\d.]/g,"")) || 0;
            } else {
              pol[key] = safeTrim(e.target.value);
            }
            State.data.meta.updatedAt = nowISO();
            this.els.drawerPremium.textContent = fmtMoney(computeCustomerPremium(customer));
          });

          this.els.drawerPoliciesTbody.addEventListener("change", (e) => {
            const tr = e.target.closest("tr[data-id]");
            if (!tr) return;
            const id = tr.dataset.id;
            const key = e.target.getAttribute("data-k");
            if (!key) return;
            const pol = customer.policies.find(x => x.id === id);
            if (!pol) return;
            pol[key] = safeTrim(e.target.value);
            State.data.meta.updatedAt = nowISO();
            this.els.drawerPremium.textContent = fmtMoney(computeCustomerPremium(customer));
          });

          this.els.drawerPoliciesTbody.addEventListener("click", (e) => {
            const del = e.target.closest("[data-del]");
            if (!del) return;
            const id = del.dataset.del;
            customer.policies = customer.policies.filter(x => x.id !== id);
            State.data.meta.updatedAt = nowISO();
            this.renderDrawerTabs(customer);
            this.els.drawerPremium.textContent = fmtMoney(computeCustomerPremium(customer));
          });
        }
      }

      // Render Docs
      if (this.els.drawerDocsList) {
        this.els.drawerDocsList.innerHTML = customer.documents.map(d => `
          <div class="listItem">
            <div class="listItem__top">
              <div class="listItem__title">${escapeHtml(d.name||"מסמך")}</div>
              <span class="badge">${escapeHtml(d.status||"")}</span>
            </div>
            <div class="listItem__sub">${escapeHtml(d.url || "")}</div>
            <div class="listItem__actions">
              <button class="btn" type="button" data-open-doc="${escapeHtml(d.id)}">פתח</button>
              <button class="btn iconBtn iconBtn--danger" type="button" data-del-doc="${escapeHtml(d.id)}">מחק</button>
            </div>
          </div>
        `).join("") || `<div class="muted">אין מסמכים.</div>`;

        if (!this.els.drawerDocsList.dataset.wired) {
          this.els.drawerDocsList.dataset.wired = "1";
          this.els.drawerDocsList.addEventListener("click", (e) => {
            const openBtn = e.target.closest("[data-open-doc]");
            if (openBtn) {
              const id = openBtn.dataset.openDoc;
              const d = customer.documents.find(x => x.id === id);
              if (d?.url) window.open(d.url, "_blank", "noopener,noreferrer");
              return;
            }
            const delBtn = e.target.closest("[data-del-doc]");
            if (delBtn) {
              const id = delBtn.dataset.delDoc;
              customer.documents = customer.documents.filter(x => x.id !== id);
              State.data.meta.updatedAt = nowISO();
              this.renderDrawerTabs(customer);
              return;
            }
          });
        }
      }

      // Render Timeline
      if (this.els.drawerTimeline) {
        this.els.drawerTimeline.innerHTML = customer.timeline.slice(0, 12).map(l => `
          <div class="listItem">
            <div class="listItem__top">
              <div class="listItem__title">${escapeHtml(l.type || "הערה")}</div>
              <div class="muted">${escapeHtml(new Date(l.at || nowISO()).toLocaleString("he-IL"))}</div>
            </div>
            <div class="listItem__sub">${escapeHtml(l.text || "")}</div>
          </div>
        `).join("") || `<div class="muted">אין היסטוריה.</div>`;
      }

      // Render Tasks
      if (this.els.drawerTasksList) {
        this.els.drawerTasksList.innerHTML = customer.tasks.map(t => `
          <div class="listItem">
            <div class="listItem__top">
              <div class="listItem__title">${escapeHtml(t.action || "משימה")}</div>
              <span class="badge">${escapeHtml(t.status || "פתוח")}</span>
            </div>
            <div class="listItem__sub">יעד: ${escapeHtml(t.due || "—")}</div>
            <div class="listItem__actions">
              <button class="btn" type="button" data-done-task="${escapeHtml(t.id)}">סמן בוצע</button>
              <button class="btn iconBtn iconBtn--danger" type="button" data-del-task="${escapeHtml(t.id)}">מחק</button>
            </div>
          </div>
        `).join("") || `<div class="muted">אין משימות.</div>`;

        if (!this.els.drawerTasksList.dataset.wired) {
          this.els.drawerTasksList.dataset.wired = "1";
          this.els.drawerTasksList.addEventListener("click", (e) => {
            const done = e.target.closest("[data-done-task]");
            if (done) {
              const id = done.dataset.doneTask;
              const t = customer.tasks.find(x => x.id === id);
              if (t) t.status = "בוצע";
              State.data.meta.updatedAt = nowISO();
              this.renderDrawerTabs(customer);
              return;
            }
            const del = e.target.closest("[data-del-task]");
            if (del) {
              const id = del.dataset.delTask;
              customer.tasks = customer.tasks.filter(x => x.id !== id);
              State.data.meta.updatedAt = nowISO();
              this.renderDrawerTabs(customer);
              return;
            }
          });
        }
      }

      // Default active tab
      this.switchDrawerTab($(".tab.is-active", this.els.drawerTabs)?.dataset.tab || "policies");
    },



    renderAll() {
      this.renderDashboard();
      this.renderCustomers();
      this.renderSyncStatus();
    },

    renderDashboard() {
      const customers = State.data.customers;
      const totalPremium = customers.reduce((sum, c) => sum + computeCustomerPremium(c), 0);

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
          <td><span class="badge">${fmtMoney(computeCustomerPremium(c))}</span></td>
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
    UI.init();
    await App.boot();
  });

  // Expose a minimal namespace for debugging without polluting global scope too much
  window.LEAD_CORE = { App, State, Storage, UI };
})();
