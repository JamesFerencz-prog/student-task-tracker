"use strict";

const STORAGE_KEY = "it488_student_task_tracker_tasks_v4";

const els = {
  addAssignmentBtn: document.getElementById("addAssignmentBtn"),
  taskForm: document.getElementById("taskForm"),
  taskId: document.getElementById("taskId"),
  title: document.getElementById("title"),
  dueDate: document.getElementById("dueDate"),
  priority: document.getElementById("priority"),
  category: document.getElementById("category"), // NEW
  completed: document.getElementById("completed"),
  formTitle: document.getElementById("formTitle"),
  cancelBtn: document.getElementById("cancelBtn"),
  clearAllBtn: document.getElementById("clearAllBtn"),
  formMsg: document.getElementById("formMsg"),
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

  els.taskForm.addEventListener("submit", (e) => {
    e.preventDefault();

    const data = readForm();

    if (!data.title || !data.dueDate) return;

    if (data.id) {
      updateTask(data);
    } else {
      createTask(data);
    }

    saveTasks();
    resetForm();
    render();
  });

  els.clearAllBtn.addEventListener("click", () => {
    if (!confirm("Clear ALL assignments?")) return;
    tasks = [];
    saveTasks();
    render();
  });
}

/* ===================== STORAGE ===================== */

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/* ===================== FORM ===================== */

function readForm() {
  return {
    id: els.taskId.value || null,
    title: els.title.value.trim(),
    dueDate: els.dueDate.value,
    priority: els.priority.value,
    category: els.category.value, // NEW
    completed: els.completed.checked,
  };
}

function resetForm() {
  els.taskForm.reset();
  els.taskId.value = "";
}

/* ===================== CRUD ===================== */

function createTask(data) {
  const task = {
    id: crypto.randomUUID(),
    title: data.title,
    dueDate: data.dueDate,
    priority: data.priority,
    category: data.category || "Other", // NEW
    completed: data.completed,
    createdAt: Date.now(),
  };

  tasks.push(task);
}

function updateTask(data) {
  const t = tasks.find((x) => x.id === data.id);
  if (!t) return;

  t.title = data.title;
  t.dueDate = data.dueDate;
  t.priority = data.priority;
  t.category = data.category; // NEW
  t.completed = data.completed;
}

/* ===================== DEADLINE LABELS ===================== */

function getDeadlineInfo(task) {
  if (task.completed) return { text: "Completed", cls: "done" };

  const due = new Date(task.dueDate);
  const today = new Date();

  due.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diff = (due - today) / (1000 * 60 * 60 * 24);

  if (diff < 0) return { text: `Overdue by ${Math.abs(diff)} days`, cls: "overdue" };
  if (diff === 0) return { text: "Due today", cls: "warning" };
  if (diff <= 3) return { text: `Due in ${diff} days`, cls: "warning" };

  return { text: `Due in ${diff} days`, cls: "safe" };
}

/* ===================== CATEGORIZATION ===================== */

function getBucket(task) {
  if (task.completed) return "completed";

  const due = new Date(task.dueDate);
  const today = new Date();

  due.setHours(0,0,0,0);
  today.setHours(0,0,0,0);

  const diff = (due - today) / (1000 * 60 * 60 * 24);

  if (diff < 0) return "overdue";
  if (diff === 0) return "today";
  if (diff <= 7) return "soon";

  return "upcoming";
}

/* ===================== RENDER ===================== */

function render() {

  els.listOverdue.innerHTML = "";
  els.listToday.innerHTML = "";
  els.listSoon.innerHTML = "";
  els.listUpcoming.innerHTML = "";
  els.listCompleted.innerHTML = "";

  tasks.forEach((t) => {

    const li = document.createElement("li");
    li.className = "task";

    const deadline = getDeadlineInfo(t);

    li.innerHTML = `
      <div class="taskTop">
        <div class="taskTitle">${t.title}</div>
      </div>

      <div class="badges">
        <span class="badge deadline ${deadline.cls}">${deadline.text}</span>
        <span class="badge">${t.category}</span>
        <span class="badge ${t.priority}">Priority: ${t.priority}</span>
      </div>
    `;

    const bucket = getBucket(t);

    if (bucket === "overdue") els.listOverdue.appendChild(li);
    else if (bucket === "today") els.listToday.appendChild(li);
    else if (bucket === "soon") els.listSoon.appendChild(li);
    else if (bucket === "upcoming") els.listUpcoming.appendChild(li);
    else els.listCompleted.appendChild(li);
  });
}
