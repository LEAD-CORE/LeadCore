/* LeadCore — Minimal Clean Build
   נשארו רק:
   - לקוחות + יצירת לקוח חדש
   - ניהול משתמשים
   - הגדרות מערכת
   נשמר חיבור ל-Google Sheets (action=get/put)
*/
(() => {
  "use strict";

  // ---------- Helpers ----------
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const nowISO = () => new Date().toISOString();
  const uid = (p="id") => `${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  const safeTrim = (v) => (v == null ? "" : String(v)).trim();

  // ---------- Storage (Sheets) ----------
  const LS_BACKUP = "lc_backup_v1";
  const LS_SETTINGS = "lc_settings_v1";

  const DEFAULT_GS_URL = "https://script.google.com/macros/s/AKfycbzIfQh5_eUCScWtQxbf8qS978mNB1VXj0WW6wAY3XCVlEDE_JV9gm-FL1T5UKZw5wDURA/exec";

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 12000) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try{
      return await fetch(url, { ...options, signal: ctrl.signal });
    } finally { clearTimeout(t); }
  };

  const Storage = {
    gsUrl: DEFAULT_GS_URL,

    saveBackup(state){
      try{ localStorage.setItem(LS_BACKUP, JSON.stringify(state)); }catch(_){}
    },
    loadBackup(){
      try{
        const raw = localStorage.getItem(LS_BACKUP);
        if(!raw) return null;
        return JSON.parse(raw);
      }catch(_){ return null; }
    },

    async loadSheets(){
      if(!this.gsUrl) return { ok:false, error:"אין כתובת Web App" };
      try{
        const url = new URL(this.gsUrl);
        url.searchParams.set("action","get");
        const res = await fetchWithTimeout(url.toString(), { method:"GET" });
        const json = await res.json();
        if(!json || json.ok !== true) return { ok:false, error:"שגיאת get" };
        return { ok:true, payload: json.payload || {}, at: json.at || nowISO() };
      }catch(e){
        return { ok:false, error: String(e?.message || e) };
      }
    },

    async saveSheets(state){
      if(!this.gsUrl) return { ok:false, error:"אין כתובת Web App" };
      try{
        const url = new URL(this.gsUrl);
        url.searchParams.set("action","put");
        const res = await fetchWithTimeout(url.toString(), {
          method:"POST",
          headers:{ "Content-Type":"text/plain;charset=utf-8" },
          body: JSON.stringify({ payload: state })
        });
        const json = await res.json();
        if(!json || json.ok !== true) return { ok:false, error:"שגיאת put" };
        return { ok:true, at: json.at || nowISO() };
      }catch(e){
        return { ok:false, error: String(e?.message || e) };
      }
    }
  };

  // ---------- State ----------
  const defaultState = () => ({
    meta: { updatedAt: null },
    settings: { appName: "LeadCore", notes: "" },
    users: [
      { id: "admin", name: "מנהל", role: "admin" }
    ],
    customers: []
  });

  const normalize = (raw) => {
    const s = raw && typeof raw === "object" ? raw : {};
    const out = defaultState();
    if(s.meta && typeof s.meta === "object") out.meta = { ...out.meta, ...s.meta };
    if(s.settings && typeof s.settings === "object") out.settings = { ...out.settings, ...s.settings };
    if(Array.isArray(s.users)) out.users = s.users.map(u => ({
      id: safeTrim(u.id) || uid("u"),
      name: safeTrim(u.name) || "ללא שם",
      role: (u.role === "admin" ? "admin" : "agent")
    }));
    if(Array.isArray(s.customers)) out.customers = s.customers.map(c => ({
      id: safeTrim(c.id) || uid("c"),
      firstName: safeTrim(c.firstName),
      lastName: safeTrim(c.lastName),
      idNumber: safeTrim(c.idNumber),
      phone: safeTrim(c.phone),
      email: safeTrim(c.email),
      agentId: safeTrim(c.agentId),
      notes: safeTrim(c.notes),
      createdAt: c.createdAt || nowISO(),
      updatedAt: c.updatedAt || nowISO()
    }));
    return out;
  };

  const State = {
    data: defaultState(),
    set(next){
      this.data = normalize(next);
      this.data.meta.updatedAt = nowISO();
      Storage.saveBackup(this.data);
      UI.renderAll();
    }
  };

  // ---------- UI ----------
  const UI = {
    els: {},
    init(){
      this.els = {
        navBtns: $$(".navBtn"),
        views: $$(".view"),
        syncStatus: $("#syncStatus"),
        syncMeta: $("#syncMeta"),
        btnSync: $("#btnSync"),

        // customers
        qCustomers: $("#qCustomers"),
        btnNewCustomer: $("#btnNewCustomer"),
        tblCustomers: $("#tblCustomers tbody"),
        customersEmpty: $("#customersEmpty"),

        // users
        btnNewUser: $("#btnNewUser"),
        tblUsers: $("#tblUsers tbody"),
        usersEmpty: $("#usersEmpty"),

        // settings
        setAppName: $("#setAppName"),
        setGsUrl: $("#setGsUrl"),
        setNotes: $("#setNotes"),
        btnSaveSettings: $("#btnSaveSettings"),
        btnResetLocal: $("#btnResetLocal"),

        // modal
        modal: $("#modal"),
        modalClose: $("#modalClose"),
        modalTitle: $("#modalTitle"),
        modalBody: $("#modalBody"),
        modalFoot: $("#modalFoot"),
      };

      this.bindNav();
      this.bindActions();
      this.renderAll();
    },

    bindNav(){
      this.els.navBtns.forEach(btn => {
        btn.addEventListener("click", () => {
          const view = btn.dataset.view;
          this.els.navBtns.forEach(b => b.classList.toggle("is-active", b === btn));
          this.els.views.forEach(v => v.classList.toggle("is-active", v.id === `view-${view}`));
        });
      });
    },

    bindActions(){
      this.els.btnSync.addEventListener("click", () => App.syncNow());

      // customers
      this.els.btnNewCustomer.addEventListener("click", () => Modals.openCustomer());
      this.els.qCustomers.addEventListener("input", () => this.renderCustomers());

      // users
      this.els.btnNewUser.addEventListener("click", () => Modals.openUser());

      // settings
      this.els.btnSaveSettings.addEventListener("click", () => {
        const next = structuredClone(State.data);
        next.settings.appName = safeTrim(this.els.setAppName.value) || "LeadCore";
        next.settings.notes = safeTrim(this.els.setNotes.value);
        const url = safeTrim(this.els.setGsUrl.value) || DEFAULT_GS_URL;
        Storage.gsUrl = url; // keep sheets connection
        saveLocalSettings({ gsUrl: url });
        State.set(next);
      });

      this.els.btnResetLocal.addEventListener("click", () => {
        try{ localStorage.removeItem(LS_BACKUP); }catch(_){}
        alert("נמחק גיבוי מקומי. החיבור לגוגל נשמר.");
      });

      // modal close
      this.els.modalClose.addEventListener("click", () => this.closeModal());
      this.els.modal.addEventListener("click", (e) => {
        if(e.target === this.els.modal) this.closeModal();
      });
      document.addEventListener("keydown", (e) => {
        if(e.key === "Escape") this.closeModal();
      });
    },

    openModal({ title, body, foot }){
      this.els.modalTitle.textContent = title || "";
      this.els.modalBody.innerHTML = "";
      this.els.modalFoot.innerHTML = "";
      if(body) this.els.modalBody.append(body);
      if(foot) this.els.modalFoot.append(foot);
      this.els.modal.classList.add("is-open");
      this.els.modal.setAttribute("aria-hidden","false");
    },

    closeModal(){
      this.els.modal.classList.remove("is-open");
      this.els.modal.setAttribute("aria-hidden","true");
    },

    setSync(statusText, metaText){
      this.els.syncStatus.textContent = statusText || "";
      this.els.syncMeta.textContent = metaText || "";
    },

    renderAll(){
      document.title = State.data.settings.appName || "LeadCore";
      this.renderCustomers();
      this.renderUsers();
      this.renderSettings();
    },

    renderCustomers(){
      const q = safeTrim(this.els.qCustomers.value).toLowerCase();
      const rows = State.data.customers
        .slice()
        .sort((a,b)=> (b.updatedAt||"").localeCompare(a.updatedAt||""))
        .filter(c => {
          if(!q) return true;
          const blob = `${c.firstName} ${c.lastName} ${c.idNumber} ${c.phone} ${c.email}`.toLowerCase();
          return blob.includes(q);
        });

      this.els.tblCustomers.innerHTML = "";
      rows.forEach(c => {
        const tr = document.createElement("tr");
        const name = `${c.firstName||""} ${c.lastName||""}`.trim() || "ללא שם";
        const agent = (State.data.users.find(u => u.id === c.agentId)?.name) || "";
        tr.innerHTML = `
          <td>${escapeHtml(name)}</td>
          <td>${escapeHtml(c.idNumber||"")}</td>
          <td>${escapeHtml(c.phone||"")}</td>
          <td>${escapeHtml(c.email||"")}</td>
          <td>${escapeHtml(agent)}</td>
          <td>
            <button class="btn btnGhost" data-act="edit">עריכה</button>
            <button class="btn" data-act="del">מחיקה</button>
          </td>
        `;
        tr.querySelector('[data-act="edit"]').addEventListener("click", () => Modals.openCustomer(c));
        tr.querySelector('[data-act="del"]').addEventListener("click", () => App.deleteCustomer(c.id));
        this.els.tblCustomers.append(tr);
      });

      const isEmpty = rows.length === 0;
      this.els.customersEmpty.style.display = isEmpty ? "block" : "none";
    },

    renderUsers(){
      const rows = State.data.users.slice().sort((a,b)=> a.name.localeCompare(b.name,"he"));
      this.els.tblUsers.innerHTML = "";
      rows.forEach(u => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td>${escapeHtml(u.name)}</td>
          <td>${u.role === "admin" ? "admin" : "agent"}</td>
          <td>${escapeHtml(u.id)}</td>
          <td>
            <button class="btn btnGhost" data-act="edit">עריכה</button>
            <button class="btn" data-act="del">מחיקה</button>
          </td>
        `;
        tr.querySelector('[data-act="edit"]').addEventListener("click", () => Modals.openUser(u));
        tr.querySelector('[data-act="del"]').addEventListener("click", () => App.deleteUser(u.id));
        this.els.tblUsers.append(tr);
      });
      this.els.usersEmpty.style.display = rows.length ? "none" : "block";
    },

    renderSettings(){
      this.els.setAppName.value = State.data.settings.appName || "LeadCore";
      this.els.setNotes.value = State.data.settings.notes || "";
      this.els.setGsUrl.value = Storage.gsUrl || DEFAULT_GS_URL;
    }
  };

  // ---------- Modals ----------
  const Modals = {
    openCustomer(customer=null){
      const isEdit = !!customer;
      const c = customer ? { ...customer } : {
        id: uid("c"),
        firstName:"", lastName:"", idNumber:"", phone:"", email:"", agentId:"", notes:"",
        createdAt: nowISO(), updatedAt: nowISO()
      };

      const body = document.createElement("div");
      body.className = "form";
      body.innerHTML = `
        <div class="field"><label>שם פרטי</label><input class="input" id="cFirst" value="${escapeAttr(c.firstName)}"></div>
        <div class="field"><label>שם משפחה</label><input class="input" id="cLast" value="${escapeAttr(c.lastName)}"></div>
        <div class="field"><label>תעודת זהות</label><input class="input" id="cIdn" value="${escapeAttr(c.idNumber)}"></div>
        <div class="field"><label>טלפון</label><input class="input" id="cPhone" value="${escapeAttr(c.phone)}"></div>
        <div class="field"><label>מייל</label><input class="input" id="cEmail" value="${escapeAttr(c.email)}"></div>
        <div class="field"><label>נציג מטפל</label>
          <select class="input" id="cAgent">
            <option value="">—</option>
            ${State.data.users.map(u => `<option value="${escapeAttr(u.id)}" ${u.id===c.agentId ? "selected":""}>${escapeHtml(u.name)} (${u.role})</option>`).join("")}
          </select>
        </div>
        <div class="field"><label>הערות</label><textarea class="input" id="cNotes" rows="4">${escapeHtml(c.notes||"")}</textarea></div>
      `;

      const foot = document.createElement("div");
      const btnSave = document.createElement("button");
      btnSave.className = "btn btnPrimary";
      btnSave.type = "button";
      btnSave.textContent = isEdit ? "שמור שינויים" : "צור לקוח";
      btnSave.addEventListener("click", async () => {
        c.firstName = safeTrim($("#cFirst", body).value);
        c.lastName = safeTrim($("#cLast", body).value);
        c.idNumber = safeTrim($("#cIdn", body).value);
        c.phone = safeTrim($("#cPhone", body).value);
        c.email = safeTrim($("#cEmail", body).value);
        c.agentId = safeTrim($("#cAgent", body).value);
        c.notes = safeTrim($("#cNotes", body).value);
        c.updatedAt = nowISO();

        App.upsertCustomer(c);
        UI.closeModal();
        await App.persist();
      });

      const btnCancel = document.createElement("button");
      btnCancel.className = "btn btnGhost";
      btnCancel.type = "button";
      btnCancel.textContent = "ביטול";
      btnCancel.addEventListener("click", () => UI.closeModal());

      foot.append(btnSave, btnCancel);
      UI.openModal({ title: isEdit ? "עריכת לקוח" : "יצירת לקוח חדש", body, foot });
    },

    openUser(user=null){
      const isEdit = !!user;
      const u = user ? { ...user } : { id: uid("u"), name:"", role:"agent" };

      const body = document.createElement("div");
      body.className = "form";
      body.innerHTML = `
        <div class="field"><label>שם נציג</label><input class="input" id="uName" value="${escapeAttr(u.name)}"></div>
        <div class="field"><label>תפקיד</label>
          <select class="input" id="uRole">
            <option value="agent" ${u.role!=="admin" ? "selected":""}>agent</option>
            <option value="admin" ${u.role==="admin" ? "selected":""}>admin</option>
          </select>
        </div>
        <div class="field"><label>ID (קבוע)</label><input class="input" id="uId" value="${escapeAttr(u.id)}" ${isEdit ? "readonly":""}></div>
      `;

      const foot = document.createElement("div");
      const btnSave = document.createElement("button");
      btnSave.className = "btn btnPrimary";
      btnSave.type = "button";
      btnSave.textContent = isEdit ? "שמור" : "צור נציג";
      btnSave.addEventListener("click", async () => {
        u.name = safeTrim($("#uName", body).value) || "ללא שם";
        u.role = ($("#uRole", body).value === "admin") ? "admin" : "agent";
        u.id = safeTrim($("#uId", body).value) || uid("u");
        App.upsertUser(u);
        UI.closeModal();
        await App.persist();
      });

      const btnCancel = document.createElement("button");
      btnCancel.className = "btn btnGhost";
      btnCancel.type = "button";
      btnCancel.textContent = "ביטול";
      btnCancel.addEventListener("click", () => UI.closeModal());

      foot.append(btnSave, btnCancel);
      UI.openModal({ title: isEdit ? "עריכת נציג" : "נציג חדש", body, foot });
    }
  };

  // ---------- App ----------
  const App = {
    async boot(){
      // load local settings for gsUrl
      const local = loadLocalSettings();
      if(local?.gsUrl) Storage.gsUrl = local.gsUrl;

      // try sheets first
      UI.setSync("טוען…", "");
      const r = await Storage.loadSheets();
      if(r.ok){
        State.set(r.payload);
        UI.setSync("מחובר", `עודכן: ${formatShort(r.at)}`);
      }else{
        // fallback to local backup
        const b = Storage.loadBackup();
        if(b){
          State.set(b);
          UI.setSync("עובד מקומית", "לא ניתן להתחבר ל‑Sheets (נשמר חיבור).");
        }else{
          State.set(defaultState());
          UI.setSync("לא מחובר", "אין נתונים עדיין.");
        }
      }
    },

    async syncNow(){
      UI.setSync("מסתנכרן…", "");
      const r = await Storage.loadSheets();
      if(r.ok){
        State.set(r.payload);
        UI.setSync("מחובר", `עודכן: ${formatShort(r.at)}`);
      }else{
        UI.setSync("שגיאת סנכרון", r.error || "שגיאה");
        alert("סנכרון נכשל: " + (r.error || "שגיאה"));
      }
    },

    async persist(){
      const state = State.data;
      UI.setSync("שומר…", "");
      const r = await Storage.saveSheets(state);
      if(r.ok){
        UI.setSync("מחובר", `נשמר: ${formatShort(r.at)}`);
      }else{
        UI.setSync("שגיאת שמירה", r.error || "שגיאה");
        alert("שמירה ל‑Sheets נכשלה: " + (r.error || "שגיאה"));
      }
    },

    upsertCustomer(c){
      const next = structuredClone(State.data);
      const idx = next.customers.findIndex(x => x.id === c.id);
      if(idx >= 0) next.customers[idx] = c;
      else next.customers.push(c);
      State.set(next);
    },

    deleteCustomer(id){
      if(!confirm("למחוק לקוח?")) return;
      const next = structuredClone(State.data);
      next.customers = next.customers.filter(c => c.id !== id);
      State.set(next);
      this.persist();
    },

    upsertUser(u){
      const next = structuredClone(State.data);
      const idx = next.users.findIndex(x => x.id === u.id);
      if(idx >= 0) next.users[idx] = u;
      else next.users.push(u);
      // keep customers agentId valid
      next.customers = next.customers.map(c => (c.agentId === u.id ? c : c));
      State.set(next);
    },

    deleteUser(id){
      if(id === "admin"){
        alert("לא ניתן למחוק admin.");
        return;
      }
      if(!confirm("למחוק נציג?")) return;
      const next = structuredClone(State.data);
      next.users = next.users.filter(u => u.id !== id);
      // detach from customers
      next.customers = next.customers.map(c => (c.agentId === id ? { ...c, agentId:"", updatedAt: nowISO() } : c));
      State.set(next);
      this.persist();
    }
  };

  // ---------- Local settings ----------
  function loadLocalSettings(){
    try{
      const raw = localStorage.getItem(LS_SETTINGS);
      return raw ? JSON.parse(raw) : null;
    }catch(_){ return null; }
  }
  function saveLocalSettings(obj){
    try{ localStorage.setItem(LS_SETTINGS, JSON.stringify(obj||{})); }catch(_){}
  }

  // ---------- Formatting / escaping ----------
  function formatShort(iso){
    try{
      const d = new Date(iso);
      return d.toLocaleString("he-IL");
    }catch(_){ return iso || ""; }
  }
  function escapeHtml(s){
    return String(s ?? "").replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
  }
  function escapeAttr(s){ return escapeHtml(s).replace(/\n/g," "); }

  // ---------- Start ----------
  window.addEventListener("DOMContentLoaded", () => {
    UI.init();
    App.boot();
  });
})();
