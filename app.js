/**
 * LeadCore • Google Sheets Sync Web App (robust)
 * Storage:
 *  - Sheet tab: DB
 *  - A1: JSON state
 *  - B1: lastUpdated ISO
 *
 * Endpoints:
 *  GET  ?action=ping  -> {ok:true,msg:"pong"}
 *  GET  ?action=get   -> {ok:true,payload:<state>,at:<iso>}
 *  POST ?action=put   body:{payload:<state>} -> {ok:true,at:<iso>}
 *
 * IMPORTANT DEPLOY:
 *  - Deploy > Manage deployments > Web app
 *  - Execute as: Me
 *  - Who has access: Anyone
 *  - Update deployment (every time you edit)
 */

// ====== CONFIG ======
// Prefer URL (more reliable than openById in some cases)
var SS_URL = ""; // <-- put your FULL Google Sheet URL here (recommended)
// If you prefer ID, set SS_ID and leave SS_URL empty.
var SS_ID  = "1-4oqJocNjrMuSSxVeEkNAJECPkRIXn-jNXvmhfGfgM";

var TAB_NAME  = "DB";
var CELL_JSON = "A1";
var CELL_AT   = "B1";

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "ping";
  if (action === "ping") return jsonOut({ ok:true, msg:"pong" });

  if (action === "get") {
    try {
      var sh = getTab_();
      var raw = String(sh.getRange(CELL_JSON).getValue() || "").trim();
      var at  = String(sh.getRange(CELL_AT).getValue() || "").trim();

      if (!raw) return jsonOut({ ok:true, payload: normalizePayload_({}), at: at || new Date().toISOString() });

      var payload = JSON.parse(raw);
      return jsonOut({ ok:true, payload: normalizePayload_(payload), at: at || new Date().toISOString() });
    } catch (err) {
      return jsonOut({ ok:false, error: "get failed: " + safeErr_(err) });
    }
  }

  return jsonOut({ ok:false, error:"unknown action (GET): " + action });
}

function doPost(e) {
  var action = (e && e.parameter && e.parameter.action) ? String(e.parameter.action) : "";
  if (action !== "put") return jsonOut({ ok:false, error:"unknown action (POST): " + (action || "missing") });

  try {
    var bodyText = (e && e.postData && e.postData.contents) ? String(e.postData.contents) : "{}";
    var body = JSON.parse(bodyText);
    var payload = (body && body.payload) ? body.payload : {};

    var sh = getTab_();
    var json = JSON.stringify(normalizePayload_(payload));
    sh.getRange(CELL_JSON).setValue(json);

    var at = new Date().toISOString();
    sh.getRange(CELL_AT).setValue(at);

    return jsonOut({ ok:true, at: at });
  } catch (err) {
    return jsonOut({ ok:false, error:"put failed: " + safeErr_(err) });
  }
}

function getTab_() {
  var ss = openSpreadsheet_();
  var sh = ss.getSheetByName(TAB_NAME);
  if (!sh) sh = ss.insertSheet(TAB_NAME);
  return sh;
}

function openSpreadsheet_() {
  // Use URL if provided (recommended)
  var url = String(SS_URL || "").trim();
  if (url) return SpreadsheetApp.openByUrl(url);

  // Fallback to ID
  var id = String(SS_ID || "").trim();
  if (!id) throw new Error("SS_URL/SS_ID are empty");
  return SpreadsheetApp.openById(id);
}

function normalizePayload_(p) {
  if (!p || typeof p !== "object") p = {};
  if (!p.meta || typeof p.meta !== "object") p.meta = {};
  if (!Array.isArray(p.customers)) p.customers = [];
  if (!Array.isArray(p.agents)) p.agents = [{ id:"a_yuval", name:"יובל מנהל" }];
  if (!Array.isArray(p.activity)) p.activity = [];
  return p;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function safeErr_(err) {
  try {
    if (!err) return "unknown";
    if (typeof err === "string") return err;
    if (err && err.message) return err.message;
    return String(err);
  } catch(_) { return "unknown"; }
}
