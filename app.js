/* LEAD CORE – app.js
 * ניקוי Footer גלובלי + שליטה חכמה בכפתור "הקמת לקוח"
 */

let currentView = "dashboard";

/* ===== Navigation ===== */
function showView(view) {
  currentView = view;
  renderView(view);
  toggleCreateCustomerButton();
}

function renderView(view) {
  const content = document.getElementById("content");
  content.innerHTML = "";

  switch (view) {
    case "dashboard":
      content.innerHTML = "<h2>דשבורד</h2>";
      break;
    case "customers":
      content.innerHTML = "<h2>לקוחות</h2>";
      break;
    case "sign":
      content.innerHTML = "<h2>החתמת לקוח</h2>";
      break;
    case "settings":
      content.innerHTML = "<h2>הגדרות מערכת</h2>";
      break;
  }
}

/* ===== Create Customer Button ===== */
function toggleCreateCustomerButton() {
  const btn = document.getElementById("btnCreateCustomer");
  if (!btn) return;

  // הכפתור מופיע רק בדשבורד
  btn.style.display = currentView === "dashboard" ? "inline-flex" : "none";
}

/* ===== Init ===== */
document.addEventListener("DOMContentLoaded", () => {
  // Sidebar navigation
  document.querySelectorAll("#sidebar button").forEach(btn => {
    btn.addEventListener("click", () => {
      showView(btn.dataset.view);
    });
  });

  // Create customer
  const createBtn = document.getElementById("btnCreateCustomer");
  if (createBtn) {
    createBtn.addEventListener("click", () => {
      alert("כאן נפתח מודאל הקמת לקוח");
    });
  }

  // התחלה בדשבורד
  showView("dashboard");
});

/* ===== חשוב =====
 * אין כאן Footer גלובלי
 * אין כפתורי "סגור / אישור פעולה"
 * כל כפתור פעולה יהיה רק בתוך מודאל רלוונטי
 */
