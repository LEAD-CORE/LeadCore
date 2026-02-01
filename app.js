/* LeadUp • Premium CRM (Client File) • build 2026-02-02
   Safe-by-design: adds client file module without breaking core storage.
*/
(() => {
  'use strict';

  // ===== Utilities =====
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const nowIso = () => new Date().toISOString();
  const uid = (p='id') => `${p}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  const cleanDigits = (s) => String(s ?? '').replace(/\D+/g,'');
  const fmtPhone = (p) => {
    const d = cleanDigits(p);
    if(!d) return '';
    // keep as user typed if not standard length
    return d;
  };
  const fmtMoney = (n) => {
    const x = Number(n);
    if(!Number.isFinite(x)) return '—';
    return x.toLocaleString('he-IL', { style:'currency', currency:'ILS', maximumFractionDigits:0 });
  };
  const toast = (msg, type='ok') => {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden','ok','err');
    t.classList.add(type==='ok' ? 'ok' : 'err');
    setTimeout(() => t.classList.add('hidden'), 1800);
  };
  const parsePremium = (v) => {
    const s = String(v ?? '').replace(/[^\d.]/g,'');
    const n = Number(s);
    return Number.isFinite(n) ? n : 0;
  };

  // ===== Storage / Sync =====
  const LS_KEY = 'leadupr_crm_state_v1';
  const CFG_KEY = 'leadupr_crm_cfg_v1';

  const defaultCfg = () => ({
    mode: 'local', // 'local' | 'gsheets'
    gsUrl: ''
  });

  const defaultState = () => ({
    version: 1,
    updatedAt: nowIso(),
    agents: [
      { agentId:'a1', name:'נציג דמו 1' },
      { agentId:'a2', name:'נציג דמו 2' },
      { agentId:'a3', name:'נציג דמו 3' },
    ],
    clients: [
      {
        clientId:'c_demo1',
        firstName:'דניאל',
        lastName:'כהן',
        nationalId:'123456789',
        phone:'0501234567',
        phone2:'',
        email:'daniel@example.com',
        address:'תל אביב',
        birthDate:'1992-06-15',
        status:'לקוח פעיל',
        ownerAgentId:'a1',
        source:'הפניה',
        notes:'לקוח ותיק, מעוניין בהרחבת בריאות.',
        createdAt: nowIso()
      },
      {
        clientId:'c_demo2',
        firstName:'נועה',
        lastName:'לוי',
        nationalId:'234567890',
        phone:'0527654321',
        phone2:'',
        email:'noa@example.com',
        address:'חיפה',
        birthDate:'1988-01-03',
        status:'ליד',
        ownerAgentId:'a2',
        source:'פייסבוק',
        notes:'לבקש אישור להצעה.',
        createdAt: nowIso()
      },
    ],
    policies: [
      { policyId:'p1', clientId:'c_demo1', type:'בריאות', company:'הראל', policyNumber:'H-99123', status:'פעילה', monthlyPremium: 240, startDate:'2021-01-01', endDate:'', note:'' },
      { policyId:'p2', clientId:'c_demo1', type:'רכב', company:'כלל', policyNumber:'C-22018', status:'פעילה', monthlyPremium: 310, startDate:'2024-03-01', endDate:'2026-02-28', note:'חידוש בקרוב' },
      { policyId:'p3', clientId:'c_demo2', type:'חיים', company:'מגדל', policyNumber:'', status:'בהצעה', monthlyPremium: 190, startDate:'', endDate:'', note:'ממתין להחלטה' },
    ],
    tasks: [
      { taskId:'t1', clientId:'c_demo2', actionType:'חזרה ללקוח', dueDate: new Date(Date.now()+86400000).toISOString().slice(0,10), ownerAgentId:'a2', status:'פתוח' },
    ],
    timeline: [
      { logId:'l1', clientId:'c_demo1', type:'שיחה', dateTime: nowIso(), summary:'עדכן כתובת. ביקש הצעה לביטוח בריאות משלים.' },
      { logId:'l2', clientId:'c_demo2', type:'וואטסאפ', dateTime: nowIso(), summary:'נשלחה הצעה ראשונית, מחכה לחזרה.' },
    ],
    docs: [
      { docId:'d1', clientId:'c_demo2', name:'הצעת ביטוח חיים', url:'', status:'נשלח', createdAt: nowIso(), signedAt:'' }
    ]
  });

  const loadCfg = () => {
    try{
      const raw = localStorage.getItem(CFG_KEY);
      if(!raw) return defaultCfg();
      const x = JSON.parse(raw);
      return { ...defaultCfg(), ...x };
    }catch{
      return defaultCfg();
    }
  };

  const saveCfg = (cfg) => localStorage.setItem(CFG_KEY, JSON.stringify(cfg));

  const normalizeState = (s) => {
    const base = defaultState();
    const out = { ...base, ...(s||{}) };

    // arrays
    for(const k of ['agents','clients','policies','tasks','timeline','docs']){
      if(!Array.isArray(out[k])) out[k] = [];
    }
    // ensure ids exist
    out.clients = out.clients.map(c => ({
      clientId: c.clientId || uid('c'),
      firstName: c.firstName || '',
      lastName: c.lastName || '',
      nationalId: cleanDigits(c.nationalId || ''),
      phone: fmtPhone(c.phone || ''),
      phone2: fmtPhone(c.phone2 || ''),
      email: c.email || '',
      address: c.address || '',
      birthDate: c.birthDate || '',
      status: c.status || 'ליד',
      ownerAgentId: c.ownerAgentId || (out.agents[0]?.agentId || ''),
      source: c.source || '',
      notes: c.notes || '',
      createdAt: c.createdAt || nowIso()
    }));

    out.policies = out.policies.map(p => ({
      policyId: p.policyId || uid('p'),
      clientId: p.clientId || '',
      type: p.type || 'אחר',
      company: p.company || '',
      policyNumber: p.policyNumber || '',
      status: p.status || 'פעילה',
      monthlyPremium: Number.isFinite(Number(p.monthlyPremium)) ? Number(p.monthlyPremium) : 0,
      startDate: p.startDate || '',
      endDate: p.endDate || '',
      note: p.note || ''
    }));

    out.tasks = out.tasks.map(t => ({
      taskId: t.taskId || uid('t'),
      clientId: t.clientId || '',
      actionType: t.actionType || 'חזרה ללקוח',
      dueDate: t.dueDate || '',
      ownerAgentId: t.ownerAgentId || '',
      status: t.status || 'פתוח'
    }));

    out.timeline = out.timeline.map(l => ({
      logId: l.logId || uid('l'),
      clientId: l.clientId || '',
      type: l.type || 'הערה',
      dateTime: l.dateTime || nowIso(),
      summary: l.summary || ''
    }));

    out.docs = out.docs.map(d => ({
      docId: d.docId || uid('d'),
      clientId: d.clientId || '',
      name: d.name || '',
      url: d.url || '',
      status: d.status || 'טיוטה',
      createdAt: d.createdAt || nowIso(),
      signedAt: d.signedAt || ''
    }));

    out.updatedAt = out.updatedAt || nowIso();
    out.version = out.version || 1;
    return out;
  };

  const loadLocalState = () => {
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return defaultState();
      return normalizeState(JSON.parse(raw));
    }catch{
      return defaultState();
    }
  };

  const saveLocalState = (state) => {
    const out = { ...state, updatedAt: nowIso() };
    localStorage.setItem(LS_KEY, JSON.stringify(out));
    return out;
  };

  // Apps Script WebApp contract:
  // GET  ?action=get  => {ok:true, payload: <state>}
  // POST ?action=set  body: {payload:<state>} => {ok:true}
  async function gsGet(url){
    const u = new URL(url);
    u.searchParams.set('action','get');
    const r = await fetch(u.toString(), { method:'GET' });
    const j = await r.json();
    if(!j || !j.ok) throw new Error(j?.error || 'get_failed');
    return normalizeState(j.payload || {});
  }
  async function gsSet(url, state){
    const u = new URL(url);
    u.searchParams.set('action','set');
    const r = await fetch(u.toString(), {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ payload: state })
    });
    const j = await r.json();
    if(!j || !j.ok) throw new Error(j?.error || 'set_failed');
    return true;
  }

  // ===== App State =====
  let cfg = loadCfg();
  let state = loadLocalState();
  let currentView = 'clients';
  let currentClientId = null;

  // ===== UI Wiring =====
  const els = {
    viewClients: $('#viewClients'),
    viewClientFile: $('#viewClientFile'),
    viewTasks: $('#viewTasks'),
    viewDocs: $('#viewDocs'),
    pageTitle: $('#pageTitle'),
    pageHint: $('#pageHint'),
    qSearch: $('#qSearch'),
    syncBadge: $('#syncBadge'),
    syncText: $('#syncText'),
    btnNewClient: $('#btnNewClient'),
    btnSettings: $('#btnSettings'),
    modalNewClient: $('#modalNewClient'),
    modalSettings: $('#modalSettings'),
    modalPolicies: $('#modalPolicies'),
    modalTimeline: $('#modalTimeline'),
    modalDoc: $('#modalDoc'),
    modalViewer: $('#modalViewer'),
    viewerFrame: $('#viewerFrame'),
    ownerAgentSelect: $('#ownerAgentSelect'),
    modeSelect: $('#modeSelect'),
    gsUrl: $('#gsUrl'),
    btnSaveSettings: $('#btnSaveSettings'),
    policiesEditor: $('#policiesEditor'),
    btnAddPolicyRow: $('#btnAddPolicyRow'),
    btnSavePolicies: $('#btnSavePolicies'),
  };

  const setSyncBadge = (mode, ok=null) => {
    els.syncText.textContent = mode === 'gsheets' ? 'Google Sheets' : 'Local';
    const dot = $('.dot', els.syncBadge);
    dot.style.background = ok === false ? 'var(--bad)' : (mode === 'gsheets' ? 'var(--warn)' : 'var(--good)');
    dot.style.boxShadow = ok === false ? '0 0 0 3px rgba(255,107,107,.14)' :
                    (mode === 'gsheets' ? '0 0 0 3px rgba(255,204,102,.14)' : '0 0 0 3px rgba(53,208,127,.14)');
  };

  const openModal = (id) => {
    const m = $('#'+id);
    m.classList.remove('hidden');
    m.setAttribute('aria-hidden','false');
  };
  const closeModal = (id) => {
    const m = $('#'+id);
    m.classList.add('hidden');
    m.setAttribute('aria-hidden','true');
  };

  function setView(view){
    currentView = view;
    // nav
    $$('.navItem').forEach(b => b.classList.toggle('active', b.dataset.view === view));
    // views
    els.viewClients.classList.toggle('hidden', view !== 'clients');
    els.viewClientFile.classList.toggle('hidden', view !== 'clientFile');
    els.viewTasks.classList.toggle('hidden', view !== 'tasks');
    els.viewDocs.classList.toggle('hidden', view !== 'docs');

    if(view === 'clients'){
      els.pageTitle.textContent = 'הלקוחות שלי';
      els.pageHint.textContent = 'חיפוש מהיר • פתיחת תיק לקוח • תמונת מצב מלאה';
      renderClients();
    }else if(view === 'clientFile'){
      els.pageTitle.textContent = 'תיק לקוח';
      els.pageHint.textContent = 'פרטים • ביטוחים • פרמיות • היסטוריה • מסמכים';
      renderClientFile(currentClientId);
    }else if(view === 'tasks'){
      els.pageTitle.textContent = 'משימות';
      els.pageHint.textContent = 'פעולות פתוחות לנציגים';
      renderTasks();
    }else if(view === 'docs'){
      els.pageTitle.textContent = 'מסמכים';
      els.pageHint.textContent = 'מסמכי לקוחות • סטטוסים • צפייה פנימית';
      renderDocs();
    }
  }

  // ===== Core Actions =====
  async function loadFromRemoteIfNeeded(){
    if(cfg.mode !== 'gsheets') return;
    const url = (cfg.gsUrl || '').trim();
    if(!url){
      setSyncBadge('gsheets', false);
      toast('חסר Web App URL בהגדרות', 'err');
      return;
    }
    try{
      const remote = await gsGet(url);
      state = remote;
      saveLocalState(state); // keep local cache
      setSyncBadge('gsheets', true);
      toast('סנכרון הושלם', 'ok');
    }catch(err){
      console.error(err);
      setSyncBadge('gsheets', false);
      toast('סנכרון נכשל', 'err');
    }
  }

  async function saveAll(){
    state = saveLocalState(state);
    if(cfg.mode !== 'gsheets') return true;

    const url = (cfg.gsUrl || '').trim();
    if(!url){
      setSyncBadge('gsheets', false);
      toast('חסר Web App URL בהגדרות', 'err');
      return false;
    }
    try{
      await gsSet(url, state);
      setSyncBadge('gsheets', true);
      toast('נשמר בהצלחה', 'ok');
      return true;
    }catch(err){
      console.error(err);
      setSyncBadge('gsheets', false);
      toast('שמירה נכשלה', 'err');
      return false;
    }
  }

  function findAgentName(agentId){
    return state.agents.find(a => a.agentId === agentId)?.name || '—';
  }

  function findClient(clientId){
    return state.clients.find(c => c.clientId === clientId) || null;
  }

  function statusBadgeClass(status){
    if(status === 'לקוח פעיל') return 'good';
    if(status === 'ליד') return 'warn';
    if(status === 'קפוא') return 'warn';
    if(status === 'ארכיון') return 'bad';
    return '';
  }

  // ===== Render: Clients =====
  function renderClients(){
    const q = (els.qSearch.value || '').trim();
    const qd = cleanDigits(q);
    const ql = q.toLowerCase();

    let list = state.clients.slice().sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
    if(q){
      list = list.filter(c => {
        const name = `${c.firstName} ${c.lastName}`.trim().toLowerCase();
        const nid = cleanDigits(c.nationalId);
        const p1 = cleanDigits(c.phone);
        const p2 = cleanDigits(c.phone2);
        return name.includes(ql) ||
               (qd && (nid.includes(qd) || p1.includes(qd) || p2.includes(qd)));
      });
    }

    const cards = list.map(c => {
      const full = `${c.firstName} ${c.lastName}`.trim() || 'ללא שם';
      const agent = findAgentName(c.ownerAgentId);
      const pol = state.policies.filter(p => p.clientId === c.clientId);
      const total = computeMonthlyTotal(pol);

      return `
      <div class="card">
        <div class="cardTop">
          <div>
            <div class="cardTitle">${escapeHtml(full)}</div>
            <div class="cardMeta">ת״ז: ${escapeHtml(c.nationalId || '—')} • טלפון: ${escapeHtml(c.phone || '—')}</div>
            <div class="cardMeta">נציג: ${escapeHtml(agent)} • סה״כ פרמיה: <b>${fmtMoney(total)}</b></div>
          </div>
          <div class="badge ${statusBadgeClass(c.status)}">${escapeHtml(c.status || '—')}</div>
        </div>
        <div class="cardActions">
          <button class="smallBtn" data-open="${c.clientId}">פתח תיק לקוח</button>
          <button class="smallBtn" data-call="${escapeAttr(c.phone || '')}">📞 חיוג</button>
          <button class="smallBtn" data-wa="${escapeAttr(c.phone || '')}">💬 וואטסאפ</button>
          <button class="smallBtn" data-mail="${escapeAttr(c.email || '')}">✉️ מייל</button>
        </div>
      </div>`;
    }).join('');

    els.viewClients.innerHTML = `
      <div class="cards">${cards || `<div class="card">לא נמצאו לקוחות.</div>`}</div>
    `;

    // events
    $$('[data-open]', els.viewClients).forEach(btn => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-open');
      openClientFile(id);
    }));
    $$('[data-call]', els.viewClients).forEach(btn => btn.addEventListener('click', () => dial(btn.getAttribute('data-call'))));
    $$('[data-wa]', els.viewClients).forEach(btn => btn.addEventListener('click', () => whatsapp(btn.getAttribute('data-wa'))));
    $$('[data-mail]', els.viewClients).forEach(btn => btn.addEventListener('click', () => email(btn.getAttribute('data-mail'))));
  }

  // ===== Client File =====
  function computeMonthlyTotal(policies){
    return policies
      .filter(p => (p.status || '') === 'פעילה')
      .reduce((sum,p) => sum + (Number(p.monthlyPremium) || 0), 0);
  }

  function openClientFile(clientId){
    currentClientId = clientId;
    setView('clientFile');
  }

  function renderClientFile(clientId){
    const c = findClient(clientId);
    if(!c){
      els.viewClientFile.innerHTML = `<div class="card">לקוח לא נמצא.</div>`;
      return;
    }
    const full = `${c.firstName} ${c.lastName}`.trim() || 'ללא שם';
    const agent = findAgentName(c.ownerAgentId);

    const policies = state.policies.filter(p => p.clientId === c.clientId);
    const total = computeMonthlyTotal(policies);

    const tasks = state.tasks.filter(t => t.clientId === c.clientId).sort((a,b) => (a.dueDate||'').localeCompare(b.dueDate||''));
    const tl = state.timeline.filter(l => l.clientId === c.clientId).sort((a,b) => (b.dateTime||'').localeCompare(a.dateTime||''));
    const docs = state.docs.filter(d => d.clientId === c.clientId).sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));

    const policiesRows = policies.map(p => `
      <tr>
        <td>${escapeHtml(p.type)}</td>
        <td>${escapeHtml(p.company)}</td>
        <td>${escapeHtml(p.policyNumber || '—')}</td>
        <td>${escapeHtml(p.status)}</td>
        <td>${fmtMoney(p.monthlyPremium)}</td>
      </tr>
    `).join('');

    const taskRows = tasks.map(t => `
      <div class="logItem">
        <div class="logTop">
          <div class="logType">${escapeHtml(t.actionType)} <span class="smallMuted">(${escapeHtml(t.status)})</span></div>
          <div class="logTime">יעד: ${escapeHtml(t.dueDate || '—')} • בעלים: ${escapeHtml(findAgentName(t.ownerAgentId))}</div>
        </div>
      </div>
    `).join('');

    const timelineRows = tl.slice(0,8).map(l => `
      <div class="logItem">
        <div class="logTop">
          <div class="logType">${escapeHtml(l.type)}</div>
          <div class="logTime">${escapeHtml(fmtDateTime(l.dateTime))}</div>
        </div>
        <div class="logSummary">${escapeHtml(l.summary)}</div>
      </div>
    `).join('');

    const docsRows = docs.map(d => `
      <div class="logItem">
        <div class="logTop">
          <div class="logType">${escapeHtml(d.name)} <span class="smallMuted">(${escapeHtml(d.status)})</span></div>
          <div class="logTime">${escapeHtml(fmtDateTime(d.createdAt))}</div>
        </div>
        <div class="cardActions" style="margin-top:10px">
          <button class="smallBtn" data-viewdoc="${escapeAttr(d.docId)}">פתח</button>
          <button class="smallBtn" data-copy="${escapeAttr(d.url||'')}">העתק קישור</button>
        </div>
      </div>
    `).join('');

    els.viewClientFile.innerHTML = `
      <div class="fileHeader">
        <div>
          <div class="fileName">${escapeHtml(full)}</div>
          <div class="fileSub">ת״ז: ${escapeHtml(c.nationalId || '—')} • נציג: ${escapeHtml(agent)} • סטטוס: <b>${escapeHtml(c.status || '—')}</b></div>
        </div>

        <div class="fileHeaderRight">
          <div class="badge ${statusBadgeClass(c.status)}">${escapeHtml(c.status || '—')}</div>
          <div class="quickActions">
            <button class="smallBtn" id="btnBack">← חזרה</button>
            <button class="smallBtn" id="btnCall">📞 חיוג</button>
            <button class="smallBtn" id="btnWa">💬 וואטסאפ</button>
            <button class="smallBtn" id="btnMail">✉️ מייל</button>
            <button class="smallBtn" id="btnAddTimeline">＋ היסטוריה</button>
            <button class="smallBtn" id="btnAddDoc">＋ מסמך</button>
            <button class="smallBtn" id="btnEditPolicies">✎ עריכת ביטוחים</button>
          </div>
        </div>
      </div>

      <div class="sectionRow">
        <div class="section">
          <div class="sectionTitle">
            <div>פרטים אישיים</div>
            <button class="smallBtn" id="btnQuickEdit">עריכה מהירה</button>
          </div>
          <div class="kv">
            <div class="kvItem"><div class="kvKey">טלפון</div><div class="kvVal">${escapeHtml(c.phone || '—')}</div></div>
            <div class="kvItem"><div class="kvKey">טלפון נוסף</div><div class="kvVal">${escapeHtml(c.phone2 || '—')}</div></div>
            <div class="kvItem"><div class="kvKey">אימייל</div><div class="kvVal">${escapeHtml(c.email || '—')}</div></div>
            <div class="kvItem"><div class="kvKey">כתובת</div><div class="kvVal">${escapeHtml(c.address || '—')}</div></div>
            <div class="kvItem"><div class="kvKey">תאריך לידה</div><div class="kvVal">${escapeHtml(c.birthDate || '—')}</div></div>
            <div class="kvItem"><div class="kvKey">מקור שיחה</div><div class="kvVal">${escapeHtml(c.source || '—')}</div></div>
            <div class="kvItem kvWide"><div class="kvKey">סיכום שיחה / הערות</div><div class="kvVal">${escapeHtml(c.notes || '—')}</div></div>
          </div>
        </div>

        <div class="section">
          <div class="sectionTitle">
            <div>תהליכים / משימות</div>
            <button class="smallBtn" id="btnAddTask">＋ משימה</button>
          </div>
          <div class="timeline">
            ${taskRows || `<div class="smallMuted">אין משימות.</div>`}
          </div>
        </div>
      </div>

      <div class="section" style="margin-top:12px">
        <div class="sectionTitle">
          <div>תיק ביטוחים</div>
          <div class="smallMuted">סוכם רק פוליסות “פעילה”</div>
        </div>
        <table class="table">
          <thead><tr>
            <th>סוג</th><th>חברה</th><th>מס׳ פוליסה</th><th>סטטוס</th><th>פרמיה חודשית</th>
          </tr></thead>
          <tbody>
            ${policiesRows || `<tr><td colspan="5">אין ביטוחים. לחץ “עריכת ביטוחים”.</td></tr>`}
          </tbody>
        </table>
        <div class="totalBar">
          <div class="label">סה״כ פרמיה חודשית</div>
          <div class="value">${fmtMoney(total)}</div>
        </div>
      </div>

      <div class="sectionRow">
        <div class="section">
          <div class="sectionTitle">
            <div>היסטוריה</div>
            <div class="smallMuted">עד 8 אחרונות</div>
          </div>
          <div class="timeline">
            ${timelineRows || `<div class="smallMuted">אין היסטוריה.</div>`}
          </div>
        </div>

        <div class="section">
          <div class="sectionTitle">
            <div>מסמכים</div>
            <div class="smallMuted">פתיחה בתוך המערכת</div>
          </div>
          <div class="timeline">
            ${docsRows || `<div class="smallMuted">אין מסמכים.</div>`}
          </div>
        </div>
      </div>
    `;

    $('#btnBack').addEventListener('click', () => setView('clients'));
    $('#btnCall').addEventListener('click', () => dial(c.phone));
    $('#btnWa').addEventListener('click', () => whatsapp(c.phone));
    $('#btnMail').addEventListener('click', () => email(c.email));
    $('#btnEditPolicies').addEventListener('click', () => openPoliciesEditor(c.clientId));
    $('#btnAddTimeline').addEventListener('click', () => openTimelineModal(c.clientId));
    $('#btnAddDoc').addEventListener('click', () => openDocModal(c.clientId));
    $('#btnAddTask').addEventListener('click', () => addTaskQuick(c.clientId));
    $('#btnQuickEdit').addEventListener('click', () => quickEditClient(c.clientId));

    $$('[data-viewdoc]').forEach(b => b.addEventListener('click', () => {
      const docId = b.getAttribute('data-viewdoc');
      const d = state.docs.find(x => x.docId === docId);
      if(!d) return;
      if(!d.url){ toast('אין קישור למסמך', 'err'); return; }
      openViewer(d.name, d.url);
    }));
    $$('[data-copy]').forEach(b => b.addEventListener('click', async () => {
      const u = b.getAttribute('data-copy');
      if(!u){ toast('אין קישור', 'err'); return; }
      try{ await navigator.clipboard.writeText(u); toast('הועתק', 'ok'); }catch{ toast('לא ניתן להעתיק', 'err'); }
    }));
  }

  function fmtDateTime(iso){
    if(!iso) return '—';
    const d = new Date(iso);
    if(Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('he-IL', { dateStyle:'short', timeStyle:'short' });
  }

  function dial(phone){
    const p = fmtPhone(phone);
    if(!p){ toast('אין מספר טלפון', 'err'); return; }
    window.location.href = `tel:${p}`;
  }
  function whatsapp(phone){
    const p = fmtPhone(phone);
    if(!p){ toast('אין מספר טלפון', 'err'); return; }
    const intl = p.startsWith('0') ? `972${p.slice(1)}` : p;
    window.open(`https://wa.me/${intl}`, '_blank', 'noopener,noreferrer');
  }
  function email(addr){
    const e = String(addr||'').trim();
    if(!e){ toast('אין אימייל', 'err'); return; }
    window.location.href = `mailto:${e}`;
  }

  // ===== Policies Editor =====
  let policiesEditingClientId = null;

  function openPoliciesEditor(clientId){
    policiesEditingClientId = clientId;
    renderPoliciesEditor();
    openModal('modalPolicies');
  }

  function renderPoliciesEditor(){
    const list = state.policies.filter(p => p.clientId === policiesEditingClientId);
    const rows = list.map(p => policyRowHtml(p)).join('');
    els.policiesEditor.innerHTML = `
      <div class="smallMuted" style="margin-bottom:10px">ערוך/הוסף ביטוחים. “פרמיה חודשית” מספר בלבד.</div>
      <div id="polRows">${rows || ''}</div>
    `;
    attachPolicyRowEvents();
  }

  function policyRowHtml(p){
    return `
    <div class="row" data-policy="${escapeAttr(p.policyId)}">
      <select data-k="type">
        ${opt(p.type, ['רכב','דירה','בריאות','חיים','נסיעות','עסק','אחר'])}
      </select>
      <input data-k="company" placeholder="חברה" value="${escapeAttr(p.company||'')}" />
      <input data-k="policyNumber" placeholder="מס׳ פוליסה" value="${escapeAttr(p.policyNumber||'')}" />
      <select data-k="status">
        ${opt(p.status, ['פעילה','בהצעה','בוטלה','הסתיימה'])}
      </select>
      <input data-k="monthlyPremium" inputmode="numeric" placeholder="פרמיה חודשית" value="${escapeAttr(p.monthlyPremium ?? '')}" />
      <input data-k="endDate" type="date" value="${escapeAttr((p.endDate||'').slice(0,10))}" />
      <button class="del" data-del="${escapeAttr(p.policyId)}">×</button>
    </div>`;
  }

  function opt(current, list){
    return list.map(x => `<option ${x===current ? 'selected':''}>${escapeHtml(x)}</option>`).join('');
  }

  function attachPolicyRowEvents(){
    $$('[data-del]', els.policiesEditor).forEach(btn => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-del');
      state.policies = state.policies.filter(p => p.policyId !== id);
      renderPoliciesEditor();
    }));
  }

  function addPolicyRow(){
    state.policies.push({
      policyId: uid('p'),
      clientId: policiesEditingClientId,
      type: 'אחר',
      company: '',
      policyNumber: '',
      status: 'פעילה',
      monthlyPremium: 0,
      startDate: '',
      endDate: '',
      note: ''
    });
    renderPoliciesEditor();
  }

  function collectPolicyEdits(){
    $$('[data-policy]', els.policiesEditor).forEach(row => {
      const id = row.getAttribute('data-policy');
      const p = state.policies.find(x => x.policyId === id);
      if(!p) return;
      const get = (k) => $('[data-k="'+k+'"]', row)?.value ?? '';
      p.type = get('type') || 'אחר';
      p.company = get('company') || '';
      p.policyNumber = get('policyNumber') || '';
      p.status = get('status') || 'פעילה';
      p.monthlyPremium = parsePremium(get('monthlyPremium'));
      p.endDate = get('endDate') || '';
    });
  }

  // ===== Timeline / Docs / Tasks =====
  let timelineClientId = null;
  function openTimelineModal(clientId){
    timelineClientId = clientId;
    $('#formTimeline').reset();
    openModal('modalTimeline');
  }

  let docClientId = null;
  function openDocModal(clientId){
    docClientId = clientId;
    $('#formDoc').reset();
    openModal('modalDoc');
  }

  function openViewer(title, url){
    $('#viewerTitle').textContent = title || 'תצוגת מסמך';
    els.viewerFrame.src = url;
    openModal('modalViewer');
  }

  function addTaskQuick(clientId){
    const c = findClient(clientId);
    if(!c) return;
    const t = {
      taskId: uid('t'),
      clientId,
      actionType: 'חזרה ללקוח',
      dueDate: new Date(Date.now()+86400000).toISOString().slice(0,10),
      ownerAgentId: c.ownerAgentId || (state.agents[0]?.agentId || ''),
      status: 'פתוח'
    };
    state.tasks.push(t);
    saveAll();
    renderClientFile(clientId);
  }

  function quickEditClient(clientId){
    const c = findClient(clientId);
    if(!c) return;
    const newStatus = prompt('סטטוס (ליד / לקוח פעיל / קפוא / ארכיון):', c.status || 'לקוח פעיל');
    if(newStatus !== null && String(newStatus).trim()){
      c.status = String(newStatus).trim();
    }
    const newNotes = prompt('סיכום שיחה / הערות:', c.notes || '');
    if(newNotes !== null){
      c.notes = String(newNotes);
    }
    saveAll();
    renderClientFile(clientId);
  }

  // ===== Render Tasks/Docs views =====
  function renderTasks(){
    const open = state.tasks.slice().sort((a,b) => (a.dueDate||'').localeCompare(b.dueDate||''));
    const items = open.map(t => {
      const c = findClient(t.clientId);
      const full = c ? `${c.firstName} ${c.lastName}`.trim() : 'לקוח לא ידוע';
      return `
        <div class="card">
          <div class="cardTop">
            <div>
              <div class="cardTitle">${escapeHtml(t.actionType)} • ${escapeHtml(full)}</div>
              <div class="cardMeta">יעד: ${escapeHtml(t.dueDate||'—')} • בעלים: ${escapeHtml(findAgentName(t.ownerAgentId))}</div>
            </div>
            <div class="badge ${t.status==='בוצע' ? 'good':'warn'}">${escapeHtml(t.status)}</div>
          </div>
          <div class="cardActions">
            <button class="smallBtn" data-open="${escapeAttr(t.clientId)}">פתח תיק לקוח</button>
            <button class="smallBtn" data-done="${escapeAttr(t.taskId)}">סמן בוצע</button>
          </div>
        </div>`;
    }).join('');

    els.viewTasks.innerHTML = `<div class="cards">${items || `<div class="card">אין משימות.</div>`}</div>`;

    $$('[data-open]', els.viewTasks).forEach(btn => btn.addEventListener('click', () => openClientFile(btn.getAttribute('data-open'))));
    $$('[data-done]', els.viewTasks).forEach(btn => btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-done');
      const t = state.tasks.find(x => x.taskId === id);
      if(!t) return;
      t.status = 'בוצע';
      saveAll();
      renderTasks();
      toast('עודכן', 'ok');
    }));
  }

  function renderDocs(){
    const list = state.docs.slice().sort((a,b) => (b.createdAt||'').localeCompare(a.createdAt||''));
    const items = list.map(d => {
      const c = findClient(d.clientId);
      const full = c ? `${c.firstName} ${c.lastName}`.trim() : '—';
      return `
        <div class="card">
          <div class="cardTop">
            <div>
              <div class="cardTitle">${escapeHtml(d.name)} • ${escapeHtml(full)}</div>
              <div class="cardMeta">סטטוס: ${escapeHtml(d.status)} • נוצר: ${escapeHtml(fmtDateTime(d.createdAt))}</div>
            </div>
            <div class="badge ${d.status==='נחתם'?'good':(d.status==='נשלח'?'warn':'') }">${escapeHtml(d.status)}</div>
          </div>
          <div class="cardActions">
            <button class="smallBtn" data-open="${escapeAttr(d.clientId)}">פתח תיק לקוח</button>
            <button class="smallBtn" data-viewdoc="${escapeAttr(d.docId)}">פתח מסמך</button>
          </div>
        </div>`;
    }).join('');
    els.viewDocs.innerHTML = `<div class="cards">${items || `<div class="card">אין מסמכים.</div>`}</div>`;

    $$('[data-open]', els.viewDocs).forEach(btn => btn.addEventListener('click', () => openClientFile(btn.getAttribute('data-open'))));
    $$('[data-viewdoc]', els.viewDocs).forEach(btn => btn.addEventListener('click', () => {
      const docId = btn.getAttribute('data-viewdoc');
      const d = state.docs.find(x => x.docId === docId);
      if(!d) return;
      if(!d.url){ toast('אין קישור למסמך', 'err'); return; }
      openViewer(d.name, d.url);
    }));
  }

  // ===== New Client form =====
  function populateAgentsSelect(){
    els.ownerAgentSelect.innerHTML = state.agents.map(a => `<option value="${escapeAttr(a.agentId)}">${escapeHtml(a.name)}</option>`).join('');
  }

  function validateNewClient(data){
    const errors = [];
    if(!data.firstName?.trim()) errors.push('שם פרטי חובה');
    if(!data.lastName?.trim()) errors.push('שם משפחה חובה');
    const phone = cleanDigits(data.phone);
    if(phone.length < 9) errors.push('טלפון חובה');
    const nid = cleanDigits(data.nationalId);
    if(nid.length !== 9) errors.push('ת״ז חייבת להיות 9 ספרות');
    return errors;
  }

  function addClientFromForm(form){
    const fd = new FormData(form);
    const data = Object.fromEntries(fd.entries());
    data.phone = fmtPhone(data.phone);
    data.phone2 = fmtPhone(data.phone2);
    data.nationalId = cleanDigits(data.nationalId);

    const errs = validateNewClient(data);
    if(errs.length){
      toast(errs[0], 'err');
      return null;
    }

    // prevent duplicates by nationalId (or phone)
    const exists = state.clients.find(c => c.nationalId && c.nationalId === data.nationalId);
    if(exists){
      toast('כבר קיים לקוח עם אותה ת״ז', 'err');
      return null;
    }

    const client = {
      clientId: uid('c'),
      firstName: data.firstName.trim(),
      lastName: data.lastName.trim(),
      nationalId: data.nationalId,
      phone: data.phone,
      phone2: data.phone2 || '',
      email: (data.email||'').trim(),
      address: (data.address||'').trim(),
      birthDate: data.birthDate || '',
      status: data.status || 'ליד',
      ownerAgentId: data.ownerAgentId || (state.agents[0]?.agentId || ''),
      source: data.source || '',
      notes: (data.notes||'').trim(),
      createdAt: nowIso()
    };
    state.clients.push(client);
    // initial timeline
    if(client.notes){
      state.timeline.push({ logId: uid('l'), clientId: client.clientId, type:'הערה', dateTime: nowIso(), summary: client.notes });
    }
    return client;
  }

  // ===== Global events =====
  function wireGlobal(){
    // nav
    $$('.navItem').forEach(btn => btn.addEventListener('click', () => {
      const v = btn.dataset.view;
      if(v === 'clients') setView('clients');
      if(v === 'tasks') setView('tasks');
      if(v === 'docs') setView('docs');
    }));

    // search
    els.qSearch.addEventListener('input', () => {
      if(currentView === 'clients') renderClients();
    });
    els.qSearch.addEventListener('keydown', (e) => {
      if(e.key === 'Enter'){
        const q = (els.qSearch.value || '').trim();
        if(!q) return;
        const hit = searchBestClient(q);
        if(hit) openClientFile(hit.clientId);
      }
    });

    // new client
    els.btnNewClient.addEventListener('click', () => {
      populateAgentsSelect();
      $('#formNewClient').reset();
      openModal('modalNewClient');
    });

    // settings
    els.btnSettings.addEventListener('click', () => {
      els.modeSelect.value = cfg.mode;
      els.gsUrl.value = cfg.gsUrl || '';
      openModal('modalSettings');
    });

    els.btnSaveSettings.addEventListener('click', async () => {
      cfg.mode = els.modeSelect.value;
      cfg.gsUrl = (els.gsUrl.value || '').trim();
      saveCfg(cfg);
      setSyncBadge(cfg.mode, cfg.mode==='local' ? true : null);
      closeModal('modalSettings');
      await loadFromRemoteIfNeeded();
      setView(currentView === 'clientFile' ? 'clientFile' : currentView);
    });

    // modal close
    $$('[data-close]').forEach(el => el.addEventListener('click', () => closeModal(el.getAttribute('data-close'))));

    // form submit: new client
    $('#formNewClient').addEventListener('submit', async (e) => {
      e.preventDefault();
      const client = addClientFromForm(e.target);
      if(!client) return;
      closeModal('modalNewClient');
      await saveAll();
      toast('נשמר בהצלחה', 'ok');
      openClientFile(client.clientId);
    });

    // policies editor buttons
    els.btnAddPolicyRow.addEventListener('click', () => addPolicyRow());
    els.btnSavePolicies.addEventListener('click', async () => {
      collectPolicyEdits();
      await saveAll();
      closeModal('modalPolicies');
      renderClientFile(currentClientId);
    });

    // timeline form
    $('#formTimeline').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      const summary = (data.summary || '').trim();
      if(!summary){ toast('חובה סיכום', 'err'); return; }
      state.timeline.push({
        logId: uid('l'),
        clientId: timelineClientId,
        type: data.type || 'הערה',
        dateTime: nowIso(),
        summary
      });
      closeModal('modalTimeline');
      await saveAll();
      renderClientFile(timelineClientId);
    });

    // doc form
    $('#formDoc').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const data = Object.fromEntries(fd.entries());
      if(!String(data.name||'').trim()){ toast('חובה שם מסמך', 'err'); return; }
      state.docs.push({
        docId: uid('d'),
        clientId: docClientId,
        name: String(data.name).trim(),
        url: String(data.url||'').trim(),
        status: data.status || 'טיוטה',
        createdAt: nowIso(),
        signedAt: ''
      });
      closeModal('modalDoc');
      await saveAll();
      renderClientFile(docClientId);
    });

    // viewer close -> clear iframe for safety
    $('#modalViewer .modalBackdrop').addEventListener('click', () => { els.viewerFrame.src = 'about:blank'; });
    $('#modalViewer [data-close="modalViewer"]').addEventListener('click', () => { els.viewerFrame.src = 'about:blank'; });
  }

  function searchBestClient(q){
    const qd = cleanDigits(q);
    const ql = q.toLowerCase();
    const list = state.clients;
    // exact by id
    if(qd.length === 9){
      const m = list.find(c => cleanDigits(c.nationalId) === qd);
      if(m) return m;
    }
    // exact by phone ending
    if(qd.length >= 7){
      const m = list.find(c => cleanDigits(c.phone).includes(qd) || cleanDigits(c.phone2).includes(qd));
      if(m) return m;
    }
    // by name
    const m = list.find(c => (`${c.firstName} ${c.lastName}`.trim().toLowerCase()).includes(ql));
    return m || null;
  }

  // ===== Security helpers: escape =====
  function escapeHtml(s){
    return String(s ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }
  function escapeAttr(s){ return escapeHtml(s).replaceAll('\n',' '); }

  // ===== Init =====
  async function init(){
    // normalize
    state = normalizeState(state);
    saveLocalState(state);

    // cfg badge
    setSyncBadge(cfg.mode, cfg.mode === 'local' ? true : null);

    // wire UI
    wireGlobal();

    // load from remote if needed
    await loadFromRemoteIfNeeded();

    // first render
    setView('clients');
  }

  init();

})();
