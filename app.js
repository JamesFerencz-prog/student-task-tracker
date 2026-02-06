"use strict";

/**
 * Accessibility additions:
 * - Announces changes via a live region (formMsg) using announce()
 * - Makes each task card focusable (tabIndex=0) with aria-label
 * - Adds keyboard shortcut: Enter on focused card toggles completion
 * - Adds non-color "Overdue" badge when overdue
 * - Adds deadline countdown labels (safe/soon/overdue) with day counts
 *
 * Core features kept:
 * - Add Assignment button works (reset + focus + scroll)
 * - Auto categorize + auto sort
 * - Overdue highlight
 * - localStorage persistence
 */

const STORAGE_KEY = "it488_student_task_tracker_tasks_v3";

const els = {
  // Form
  addAssignmentBtn: document.getElementById("addAssignmentBtn"),
  taskForm: document.getElementById("taskForm"),
  taskId: document.getElementById("taskId"),
  title: document.getElementById("title"),
  dueDate: document.getElementById("dueDate"),
  priority: document.getElementById("priority"),
  completed: document.getElementById("completed"),
  formTitle: document.getElementById("formTitle"),
  cancelBtn: document.getElementById("cancelBtn"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  formMsg: document.getElementById("formMsg"),

  // Lists
  listOverdue: document.getElementById("listOverdue"),
  listToday: document.getElementById("listToday"),
  listSoon: document.getElementById("listSoon"),
  listUpcoming: document.getElementById("listUpcoming"),
  listCompleted: document.getElementById("listCompleted"),
};

let tasks = loadTasks();

init();
render();

/* ===================== INIT ===================== */
function init() {
  if (!els.taskForm) return;

  if (!els.dueDate.value) els.dueDate.valueAsDate = new Date();

  // Add Assignment button (Unit requirement)
  els.addAssignmentBtn.addEventListener("click", () => {
    resetForm(true);
    els.title.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
    announce("Add Assignment form ready.");
  });

  // Cancel edit
  els.cancelBtn.addEventListener("click", () => {
    resetForm(true);
    announce("Edit cancelled.");
  });

  // Clear all
  els.clearAllBtn.addEventListener("click", () => {
    const ok = confirm("Clear ALL assignments? This cannot be undone.");
    if (!ok) return;
    tasks = [];
    saveTasks();
    resetForm(true);
    render();
    announce("All assignments cleared.");
  });

  // Save
  els.taskForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const data = readForm();
    const check = validate(data);
    if (!check.ok) {
      announce(check.message);
      return;
    }

    const isEdit = !!data.id;
    if (isEdit) {
      updateTask(data);
      saveTasks();
      resetForm(false);
      render();
      announce("Assignment updated.");
      focusTaskCard(data.id);
    } else {
      const newId = createTask(data);
      saveTasks();
      resetForm(false);
      render();
      announce("Assignment added.");
      focusTaskCard(newId);
    }
  });

  // Auto-update deadline labels as time passes
  startAutoUpdateClock();
}

/* ===================== A11Y: ANNOUNCE ===================== */
function announce(msg) {
  // Reset + re-set to ensure screen readers announce repeated messages
  if (!els.formMsg) return;
  els.formMsg.textContent = "";
  setTimeout(() => {
    els.formMsg.textContent = msg;
  }, 10);
}

/* ===================== STORAGE ===================== */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/* ===================== CRUD ===================== */
function createTask(data) {
  const id = makeId();
  tasks.push({
    id,
    title: data.title,
    dueDate: data.dueDate,
    priority: data.priority,
    completed: data.completed,
    createdAt: Date.now()
  });
  return id;
}

function updateTask(data) {
  const t = tasks.find(x => x.id === data.id);
  if (!t) return;
  t.title = data.title;
  t.dueDate = data.dueDate;
  t.priority = data.priority;
  t.completed = data.completed;
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks();
  render();
  announce("Assignment deleted.");
}

function toggleComplete(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.completed = !t.completed;
  saveTasks();
  render();
  announce(t.completed ? "Marked completed." : "Marked open.");
  focusTaskCard(id);
}

function startEdit(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;

  els.formTitle.textContent = "Edit Assignment";
  els.taskId.value = t.id;
  els.title.value = t.title;
  els.dueDate.value = t.dueDate;
  els.priority.value = t.priority;
  els.completed.checked = !!t.completed;
  els.cancelBtn.hidden = false;

  window.scrollTo({ top: 0, behavior: "smooth" });
  els.title.focus();
  announce("Editing assignment.");
}

/* ===================== FORM ===================== */
function readForm() {
  return {
    id: (els.taskId.value || "").trim() || null,
    title: (els.title.value || "").trim(),
    dueDate: els.dueDate.value,
    priority: els.priority.value,
    completed: !!els.completed.checked,
  };
}

function validate(t) {
  if (!t.title) return { ok: false, message: "Title is required." };
  if (!t.dueDate) return { ok: false, message: "Due date is required." };
  if (!parseYmd(t.dueDate)) return { ok: false, message: "Due date is invalid." };
  return { ok: true };
}

function resetForm(clearMsg) {
  els.formTitle.textContent = "Add Assignment";
  els.taskId.value = "";
  els.title.value = "";
  els.dueDate.valueAsDate = new Date();
  els.priority.value = "medium";
  els.completed.checked = false;
  els.cancelBtn.hidden = true;
  if (clearMsg) els.formMsg.textContent = "";
}


/* ===================== DEADLINE LABELS ===================== */
/**
 * Returns a user-friendly label + urgency class based on due date.
 * - safe (>=4 days) => green
 * - soon (<=3 days, incl. today/tomorrow) => yellow
 * - overdue => red
 */
function getDeadlineInfo(task) {
  if (task.completed) {
    return { text: "Completed", cls: "done" };
  }

  const due = parseYmd(task.dueDate);
  if (!due) return { text: "Due date invalid", cls: "safe" };

  const today = startOfToday();
  const dueStart = startOfDay(due);

  const delta = diffDays(today, dueStart); // negative => overdue

  if (delta < 0) {
    const daysLate = Math.abs(delta);
    const dayWord = daysLate === 1 ? "day" : "days";
    return { text: `Overdue by ${daysLate} ${dayWord}`, cls: "overdue" };
  }

  if (delta === 0) {
    return { text: "Due today", cls: "warning" };
  }

  if (delta === 1) {
    return { text: "Due tomorrow", cls: "warning" };
  }

  if (delta <= 3) {
    const dayWord = delta === 1 ? "day" : "days";
    return { text: `Due in ${delta} ${dayWord}`, cls: "warning" };
  }

  // 4+ days = safe (green)
  const dayWord = delta === 1 ? "day" : "days";
  return { text: `Due in ${delta} ${dayWord}`, cls: "safe" };
}



/** Re-render periodically so labels update as time passes (e.g., after midnight). */
function startAutoUpdateClock() {
  setInterval(() => {
    render();
  }, 60 * 1000);
}

/* ===================== CATEGORIZATION ===================== */
function getCategory(task) {
  if (task.completed) return "completed";

  const due = parseYmd(task.dueDate);
  if (!due) return "upcoming";

  const today = startOfToday();
  const dueStart = startOfDay(due);

  if (dueStart < today) return "overdue";
  if (sameDay(dueStart, today)) return "today";

  const daysUntil = diffDays(today, dueStart);
  if (daysUntil >= 1 && daysUntil <= 7) return "soon";

  return "upcoming";
}

function compareTasks(a, b) {
  const pScore = (p) => (p === "high" ? 3 : p === "medium" ? 2 : 1);

  const pDiff = pScore(b.priority) - pScore(a.priority);
  if (pDiff !== 0) return pDiff;

  const ad = parseYmd(a.dueDate);
  const bd = parseYmd(b.dueDate);

  if (ad && bd) {
    const dDiff = startOfDay(ad).getTime() - startOfDay(bd).getTime();
    if (dDiff !== 0) return dDiff;
  } else if (ad && !bd) return -1;
  else if (!ad && bd) return 1;

  return (a.createdAt || 0) - (b.createdAt || 0);
}

/* ===================== RENDER ===================== */
function render() {
  clearList(els.listOverdue);
  clearList(els.listToday);
  clearList(els.listSoon);
  clearList(els.listUpcoming);
  clearList(els.listCompleted);

  const buckets = {
    overdue: [],
    today: [],
    soon: [],
    upcoming: [],
    completed: []
  };

  for (const t of tasks) {
    buckets[getCategory(t)].push(t);
  }

  for (const key of Object.keys(buckets)) {
    buckets[key].sort(compareTasks);
  }

  renderBucket(els.listOverdue, buckets.overdue, true);
  renderBucket(els.listToday, buckets.today, false);
  renderBucket(els.listSoon, buckets.soon, false);
  renderBucket(els.listUpcoming, buckets.upcoming, false);
  renderBucket(els.listCompleted, buckets.completed, false);
}

function clearList(listEl) {
  if (!listEl) return;
  listEl.innerHTML = "";
}

function renderBucket(listEl, bucket, isOverdueBucket) {
  if (!listEl) return;

  if (bucket.length === 0) {
    const li = document.createElement("li");
    li.className = "task";
    li.innerHTML = `<div class="meta">No items.</div>`;
    listEl.appendChild(li);
    return;
  }

  for (const t of bucket) {
    const li = document.createElement("li");
    li.className = "task";
    li.dataset.taskId = t.id;

    // A11Y: make card focusable + label it for screen readers
    li.tabIndex = 0;
    li.setAttribute("role", "group");
    li.setAttribute("aria-label", buildAriaLabel(t));

    // Visual overdue highlight
    const status = getCategory(t);
    const isOverdue = isOverdueBucket || status === "overdue";
    if (isOverdue) li.classList.add("overdue");

    const dueLabel = formatDue(t.dueDate);

    // Deadline label + non-color-only overdue indicator
    const deadline = getDeadlineInfo(t);

    // Non-color-only overdue indicator (text remains even if colors are not perceived)
    const overdueBadge = (status === "overdue")
      ? `<span class="badge overdueBadge">Overdue</span>`
      : "";
    li.innerHTML = `
      <div class="taskTop">
        <div class="taskTitle">${escapeHtml(t.title)}</div>
        <div class="meta">${escapeHtml(dueLabel)}</div>
      </div>

      <div class="badges">
        <span class="badge deadline ${deadline.cls}">${escapeHtml(deadline.text)}</span>
        ${overdueBadge}
        <span class="badge ${t.priority}">Priority: ${capitalize(t.priority)}</span>
        <span class="badge">Status: ${capitalize(status)}</span>
      </div>

      <div class="taskActions">
        <button type="button" data-action="toggle" data-id="${t.id}">
          ${t.completed ? "Mark Open" : "Mark Done"}
        </button>
        <button type="button" class="secondary" data-action="edit" data-id="${t.id}">
          Edit
        </button>
        <button type="button" class="danger" data-action="delete" data-id="${t.id}">
          Delete
        </button>
      </div>
    `;

    // Click actions (buttons)
    li.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const id = btn.dataset.id;
      const action = btn.dataset.action;

      if (action === "toggle") toggleComplete(id);
      else if (action === "edit") startEdit(id);
      else if (action === "delete") deleteTask(id);
    });

    // A11Y: keyboard shortcut on the card itself
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        toggleComplete(t.id);
      }
    });

    listEl.appendChild(li);
  }
}

/* ===================== A11Y HELPERS ===================== */
function buildAriaLabel(t) {
  const status = getCategory(t);
  const due = formatDue(t.dueDate).replace("Due: ", "Due ");
  const deadline = getDeadlineInfo(t).text;
  const priority = `Priority ${t.priority}`;
  const completion = t.completed ? "Completed" : "Not completed";
  return `${t.title}. ${deadline}. ${due}. ${priority}. Status ${status}. ${completion}.`;
}

function focusTaskCard(id) {
  // Move focus to the newly added/updated/toggled task card
  const el = document.querySelector(`[data-task-id="${CSS.escape(id)}"]`);
  if (el) el.focus();
}

/* ===================== HELPERS ===================== */
function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }
  return "id_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
}

function parseYmd(ymd) {
  if (!ymd || typeof ymd !== "string") return null;
  const parts = ymd.split("-");
  if (parts.length !== 3) return null;

  const y = Number(parts[0]), m = Number(parts[1]), d = Number(parts[2]);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;

  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== (m - 1) || dt.getDate() !== d) return null;
  return dt;
}

function startOfToday() {
  return startOfDay(new Date());
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

function diffDays(start, end) {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / msPerDay);
}

function formatDue(ymd) {
  const d = parseYmd(ymd);
  if (!d) return "Due: (invalid)";
  return "Due: " + d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function capitalize(s) {
  return (s || "").charAt(0).toUpperCase() + (s || "").slice(1);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

