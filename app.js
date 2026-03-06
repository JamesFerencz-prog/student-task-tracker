"use strict";

const STORAGE_KEY = "it488_student_task_tracker_tasks_v3";

const els = {
  addAssignmentBtn: document.getElementById("addAssignmentBtn"),
  taskForm:         document.getElementById("taskForm"),
  taskId:           document.getElementById("taskId"),
  title:            document.getElementById("title"),
  dueDate:          document.getElementById("dueDate"),
  priority:         document.getElementById("priority"),
  completed:        document.getElementById("completed"),
  formTitle:        document.getElementById("formTitle"),
  cancelBtn:        document.getElementById("cancelBtn"),
  clearAllBtn:      document.getElementById("clearAllBtn"),
  formMsg:          document.getElementById("formMsg"),
  listOverdue:      document.getElementById("listOverdue"),
  listToday:        document.getElementById("listToday"),
  listSoon:         document.getElementById("listSoon"),
  listUpcoming:     document.getElementById("listUpcoming"),
  listCompleted:    document.getElementById("listCompleted"),
};


/* ===================== INIT ===================== */
function init() {
  if (!els.taskForm) return;
  if (!els.dueDate.value) els.dueDate.valueAsDate = new Date();

  els.addAssignmentBtn.addEventListener("click", () => {
    resetForm(true);
    els.title.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
    announce("Add Assignment form ready.");
  });

  els.cancelBtn.addEventListener("click", () => {
    resetForm(true);
    announce("Edit cancelled.");
  });

  els.clearAllBtn.addEventListener("click", () => {
    if (!confirm("Clear ALL assignments? This cannot be undone.")) return;
    tasks = [];
    saveTasks();
    resetForm(true);
    render();
    announce("All assignments cleared.");
  });

  els.taskForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const data = readForm();
    const check = validate(data);
    if (!check.ok) { announce(check.message); return; }

    if (data.id) {
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

  startAutoUpdateClock();
}

/* ===================== A11Y ===================== */
function announce(msg) {
  if (!els.formMsg) return;
  els.formMsg.textContent = "";
  setTimeout(() => { els.formMsg.textContent = msg; }, 10);
}

/* ===================== STORAGE ===================== */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/* ===================== TIME-ON-TASK ===================== */
const STATUS_ACTIVE    = "active";
const STATUS_COMPLETED = "completed";

let tasks = loadTasks();
for (const t of tasks) normalizeTaskMetrics(t);
init();
render();

function getTaskStatus(task) {
  return task && task.completed ? STATUS_COMPLETED : STATUS_ACTIVE;
}

function normalizeTaskMetrics(task) {
  if (!task || typeof task !== "object") return;
  if (typeof task.timeSpentMs !== "number" || !Number.isFinite(task.timeSpentMs)) task.timeSpentMs = 0;
  if (!("activatedAt" in task)) task.activatedAt = null;
  if (!("completedAt" in task)) task.completedAt = null;
  if (getTaskStatus(task) === STATUS_ACTIVE && (task.activatedAt === null || !Number.isFinite(task.activatedAt))) {
    task.activatedAt = Date.now();
  }
  if (getTaskStatus(task) === STATUS_COMPLETED) task.activatedAt = null;
}

function handleStatusChange(task, nextStatus) {
  const now = Date.now();
  const currentStatus = getTaskStatus(task);
  if (nextStatus !== STATUS_ACTIVE && nextStatus !== STATUS_COMPLETED) return { ok: false, reason: "invalid_next_status" };
  if (currentStatus === nextStatus) return { ok: true, noop: true };
  normalizeTaskMetrics(task);

  if (nextStatus === STATUS_ACTIVE) {
    task.completed  = false;
    task.completedAt = null;
    task.activatedAt = now;
    return { ok: true, status: STATUS_ACTIVE };
  }

  task.completed = true;
  if (typeof task.activatedAt === "number" && Number.isFinite(task.activatedAt)) {
    const delta = now - task.activatedAt;
    if (delta > 0) task.timeSpentMs += delta;
  }
  task.completedAt = now;
  task.activatedAt = null;
  return { ok: true, status: STATUS_COMPLETED };
}

function calcTimeSpentMs(task, atTimeMs = Date.now()) {
  if (!task) return 0;
  const base   = typeof task.timeSpentMs === "number" ? task.timeSpentMs : 0;
  const active = (getTaskStatus(task) === STATUS_ACTIVE && typeof task.activatedAt === "number")
    ? Math.max(0, atTimeMs - task.activatedAt) : 0;
  return base + active;
}

function formatTotalTime(task) {
  const totalMs = calcTimeSpentMs(task);
  if (totalMs <= 0) return "< 1 min";
  const totalSeconds = Math.floor(totalMs / 1000);
  const hours   = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours   > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/* ===================== UNIT TESTS ===================== */
const TaskTrackerTests = {
  run(opts = {}) {
    function assert(name, condition) {
      if (!condition) throw new Error("FAIL: " + name);
      return "PASS: " + name;
    }
    const results = [];

    // Test 1: Standard flow
    (() => {
      const t = { id: "t1", completed: false, timeSpentMs: 0, activatedAt: 1000, completedAt: null };
      const oldNow = Date.now; Date.now = () => 4000;
      handleStatusChange(t, STATUS_COMPLETED);
      Date.now = oldNow;
      results.push(assert("Standard flow adds time",        t.timeSpentMs === 3000));
      results.push(assert("Standard flow sets completedAt", t.completedAt === 4000));
      results.push(assert("Standard flow clears activatedAt", t.activatedAt === null));
      results.push(assert("Standard flow marks completed",  t.completed === true));
    })();

    // Test 2: Reopen
    (() => {
      const t = { id: "t2", completed: true, timeSpentMs: 3000, activatedAt: null, completedAt: 4000 };
      let oldNow = Date.now; Date.now = () => 5000;
      handleStatusChange(t, STATUS_ACTIVE);
      Date.now = oldNow;
      results.push(assert("Reopen sets active",       t.completed === false));
      results.push(assert("Reopen sets activatedAt",  t.activatedAt === 5000));
      results.push(assert("Reopen clears completedAt", t.completedAt === null));
      oldNow = Date.now; Date.now = () => 8000;
      handleStatusChange(t, STATUS_COMPLETED);
      Date.now = oldNow;
      results.push(assert("Reopen accumulates time",       t.timeSpentMs === 6000));
      results.push(assert("Reopen sets completedAt again", t.completedAt === 8000));
    })();

    // Test 3: Invalid transition
    (() => {
      const t = { id: "t3", completed: false, timeSpentMs: 0, activatedAt: 1000, completedAt: null };
      const res = handleStatusChange(t, "bogus");
      results.push(assert("Invalid transition returns ok=false",          res && res.ok === false));
      results.push(assert("Invalid transition does not flip completion",   t.completed === false));
    })();

    // Test 4: formatTotalTime
    (() => {
      const t = { id: "t4", completed: true, timeSpentMs: 3661000, activatedAt: null, completedAt: Date.now() };
      results.push(assert("formatTotalTime shows hours+minutes", formatTotalTime(t) === "1h 1m"));
    })();

    return results;
  }
};
if (typeof window !== "undefined") window.TaskTrackerTests = TaskTrackerTests;

/* ===================== CRUD ===================== */
function createTask(data) {
  const id  = makeId();
  const now = Date.now();
  const task = {
    id, title: data.title, dueDate: data.dueDate, priority: data.priority,
    completed: !!data.completed, createdAt: now,
    activatedAt: null, completedAt: null, timeSpentMs: 0
  };
  if (task.completed) { task.completedAt = now; }
  else                { task.activatedAt = now; }
  tasks.push(task);
  return id;
}

function updateTask(data) {
  const t = tasks.find(x => x.id === data.id);
  if (!t) return;
  const prevStatus = getTaskStatus(t);
  t.title = data.title; t.dueDate = data.dueDate;
  t.priority = data.priority; t.completed = !!data.completed;
  const nextStatus = getTaskStatus(t);
  normalizeTaskMetrics(t);
  if (prevStatus !== nextStatus) {
    handleStatusChange(t, nextStatus);
  } else if (nextStatus === STATUS_ACTIVE && (t.activatedAt === null || !Number.isFinite(t.activatedAt))) {
    t.activatedAt = Date.now();
  }
}

function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  saveTasks(); render(); announce("Assignment deleted.");
}

function toggleComplete(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  const nextStatus = t.completed ? STATUS_ACTIVE : STATUS_COMPLETED;
  const res = handleStatusChange(t, nextStatus);
  saveTasks(); render();
  if (res && res.ok && !res.noop) {
    announce(nextStatus === STATUS_COMPLETED ? "Marked completed." : "Marked open.");
  } else { announce("Status update ignored."); }
  focusTaskCard(id);
}

function startEdit(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  els.formTitle.textContent = "Edit Assignment";
  els.taskId.value   = t.id;
  els.title.value    = t.title;
  els.dueDate.value  = t.dueDate;
  els.priority.value = t.priority;
  els.completed.checked = !!t.completed;
  els.cancelBtn.hidden  = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  els.title.focus();
  announce("Editing assignment.");
}

/* ===================== FORM ===================== */
function readForm() {
  return {
    id:        (els.taskId.value || "").trim() || null,
    title:     (els.title.value  || "").trim(),
    dueDate:   els.dueDate.value,
    priority:  els.priority.value,
    completed: !!els.completed.checked,
  };
}

function validate(t) {
  if (!t.title)              return { ok: false, message: "Title is required." };
  if (!t.dueDate)            return { ok: false, message: "Due date is required." };
  if (!parseYmd(t.dueDate))  return { ok: false, message: "Due date is invalid." };
  return { ok: true };
}

function resetForm(clearMsg) {
  els.formTitle.textContent = "Add Assignment";
  els.taskId.value   = "";
  els.title.value    = "";
  els.dueDate.valueAsDate = new Date();
  els.priority.value = "medium";
  els.completed.checked = false;
  els.cancelBtn.hidden  = true;
  if (clearMsg) els.formMsg.textContent = "";
}

/* ===================== DEADLINE LABELS ===================== */
function getDeadlineInfo(task) {
  if (task.completed) return { text: "Completed", cls: "done" };
  const due = parseYmd(task.dueDate);
  if (!due) return { text: "Due date invalid", cls: "safe" };
  const today    = startOfToday();
  const dueStart = startOfDay(due);
  const delta    = diffDays(today, dueStart);
  if (delta < 0) {
    const n = Math.abs(delta);
    return { text: `Overdue by ${n} ${n === 1 ? "day" : "days"}`, cls: "overdue" };
  }
  if (delta === 0) return { text: "Due today",     cls: "warning" };
  if (delta === 1) return { text: "Due tomorrow",  cls: "warning" };
  if (delta <= 3)  return { text: `Due in ${delta} days`, cls: "warning" };
  return { text: `Due in ${delta} days`, cls: "safe" };
}

function startAutoUpdateClock() {
  setInterval(() => { render(); }, 60 * 1000);
}

/* ===================== CATEGORIZATION ===================== */
function getCategory(task) {
  if (task.completed) return "completed";
  const due = parseYmd(task.dueDate);
  if (!due) return "upcoming";
  const today    = startOfToday();
  const dueStart = startOfDay(due);
  if (dueStart < today)          return "overdue";
  if (sameDay(dueStart, today))  return "today";
  const daysUntil = diffDays(today, dueStart);
  if (daysUntil >= 1 && daysUntil <= 7) return "soon";
  return "upcoming";
}

function compareTasks(a, b) {
  const pScore = (p) => (p === "high" ? 3 : p === "medium" ? 2 : 1);
  const pDiff  = pScore(b.priority) - pScore(a.priority);
  if (pDiff !== 0) return pDiff;
  const ad = parseYmd(a.dueDate), bd = parseYmd(b.dueDate);
  if (ad && bd) {
    const dDiff = startOfDay(ad).getTime() - startOfDay(bd).getTime();
    if (dDiff !== 0) return dDiff;
  } else if (ad && !bd) return -1;
  else if (!ad && bd)   return  1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

/* ===================== RENDER ===================== */
function render() {
  clearList(els.listOverdue);
  clearList(els.listToday);
  clearList(els.listSoon);
  clearList(els.listUpcoming);
  clearList(els.listCompleted);

  const buckets = { overdue: [], today: [], soon: [], upcoming: [], completed: [] };
  for (const t of tasks) buckets[getCategory(t)].push(t);
  for (const key of Object.keys(buckets)) buckets[key].sort(compareTasks);

  renderBucket(els.listOverdue,   buckets.overdue,   true);
  renderBucket(els.listToday,     buckets.today,     false);
  renderBucket(els.listSoon,      buckets.soon,      false);
  renderBucket(els.listUpcoming,  buckets.upcoming,  false);
  renderBucket(els.listCompleted, buckets.completed, false);
}

function clearList(listEl) {
  if (listEl) listEl.innerHTML = "";
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
    li.className   = "task";
    li.dataset.taskId = t.id;
    li.tabIndex    = 0;
    li.setAttribute("role",       "group");
    li.setAttribute("aria-label", buildAriaLabel(t));

    const status   = getCategory(t);
    const isOverdue = isOverdueBucket || status === "overdue";
    if (isOverdue) li.classList.add("overdue");

    const dueLabel      = formatDue(t.dueDate);
    const deadline      = getDeadlineInfo(t);
    const totalTimeLabel = formatTotalTime(t);
    const timeBadgeCls  = getTaskStatus(t) === STATUS_ACTIVE ? "timeActive" : "timeDone";

    const overdueBadge = (status === "overdue")
      ? `<span class="badge overdueBadge">Overdue</span>` : "";

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
        <span class="badge totalTime ${timeBadgeCls}">&#9201; ${escapeHtml(totalTimeLabel)}</span>
      </div>
      <div class="taskActions">
        <button type="button" data-action="toggle" data-id="${t.id}">
          ${t.completed ? "Mark Open" : "Mark Done"}
        </button>
        <button type="button" class="secondary" data-action="edit" data-id="${t.id}">Edit</button>
        <button type="button" class="danger"    data-action="delete" data-id="${t.id}">Delete</button>
      </div>
    `;

    li.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const id     = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "toggle") toggleComplete(id);
      else if (action === "edit")   startEdit(id);
      else if (action === "delete") deleteTask(id);
    });

    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter") toggleComplete(t.id);
    });

    listEl.appendChild(li);
  }
}

/* ===================== A11Y HELPERS ===================== */
function buildAriaLabel(t) {
  const status     = getCategory(t);
  const due        = formatDue(t.dueDate).replace("Due: ", "Due ");
  const deadline   = getDeadlineInfo(t).text;
  const priority   = `Priority ${t.priority}`;
  const completion = t.completed ? "Completed" : "Not completed";
  const timeSpent  = `Time on task: ${formatTotalTime(t)}`;
  return `${t.title}. ${deadline}. ${due}. ${priority}. Status ${status}. ${completion}. ${timeSpent}.`;
}

function focusTaskCard(id) {
  const el = document.querySelector(`[data-task-id="${CSS.escape(id)}"]`);
  if (el) el.focus();
}

/* ===================== HELPERS ===================== */
function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
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

function startOfToday() { return startOfDay(new Date()); }
function startOfDay(d)  { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
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

function capitalize(s) { return (s || "").charAt(0).toUpperCase() + (s || "").slice(1); }

function escapeHtml(str) {
  return String(str)
    .replaceAll("&",  "&amp;")
    .replaceAll("<",  "&lt;")
    .replaceAll(">",  "&gt;")
    .replaceAll('"',  "&quot;")
    .replaceAll("'",  "&#039;");
}
