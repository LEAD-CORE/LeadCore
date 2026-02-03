/* LEAD CORE • Premium CRM
   Google Sheets ONLY – URL locked
*/
(() => {
  "use strict";

  const GS_URL = "https://script.google.com/macros/s/AKfycbySKLRnHE_JyzmofD83UCT8U1SmOKsXZAmnhL6pah48Ld0Bx4IeQsjYUpFWjgsCHLVE2Q/exec";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const nowISO = () => new Date().toISOString();
  const uid = () => "c_" + Math.random().toString(16).slice(2);

  const State = {
    data: { meta:{}, customers:[], agents:[{id:"a1",name:"יובל"}], activity:[] }
  };

  async function loadSheets(){
    const u = new URL(GS_URL);
    u.searchParams.set("action","get");
    const r = await fetch(u);
    const j = await r.json();
    if(!j.ok) throw new Error("LOAD FAILED");
    return j.payload || {};
  }

  async function saveSheets(data){
    const u = new URL(GS_URL);
    u.searchParams.set("action","put");
    const r = await fetch(u,{
      method:"POST",
      headers:{ "Content-Type":"text/plain;charset=utf-8" },
      body: JSON.stringify({ payload:data })
    });
    const j = await r.json();
    if(!j.ok) throw new Error("SAVE FAILED");
    return j;
  }

  const App = {
    async boot(){
      try{
        const data = await loadSheets();
        State.data = data;
        render();
        setStatus("מחובר ל-Google Sheets");
      }catch(e){
        setStatus("❌ אין חיבור ל-Sheets");
        console.error(e);
      }
    },
    async save(){
      State.data.meta.updatedAt = nowISO();
      await saveSheets(State.data);
      setStatus("נשמר ✔");
    }
  };

  function setStatus(txt){
    const el = $("#syncText");
    if(el) el.textContent = txt;
  }

  function render(){
    const el = $("#customersTbody");
    if(!el) return;
    el.innerHTML = State.data.customers.map(c=>`
      <tr>
        <td>${c.firstName||""} ${c.lastName||""}</td>
        <td>${c.phone||""}</td>
        <td>${c.idNumber||""}</td>
        <td>₪${c.monthlyPremium||0}</td>
      </tr>
    `).join("");
  }

  document.addEventListener("DOMContentLoaded", App.boot);
})();
