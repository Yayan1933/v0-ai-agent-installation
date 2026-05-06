// Simple JSON file storage untuk history percakapan & tasks
import fs from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(__dirname, "..", "data")

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function readJSON(file, fallback) {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8")
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

async function writeJSON(file, data) {
  await ensureDir()
  await fs.writeFile(path.join(DATA_DIR, file), JSON.stringify(data, null, 2), "utf8")
}

// ===== History percakapan per user =====
const MAX_HISTORY = 30 // batasi 30 pesan terakhir agar token efisien

export async function getHistory(userId) {
  const all = await readJSON("history.json", {})
  return all[userId] || []
}

export async function appendHistory(userId, message) {
  const all = await readJSON("history.json", {})
  const list = all[userId] || []
  list.push(message)
  // potong yang lama, simpan yang terbaru saja
  all[userId] = list.slice(-MAX_HISTORY)
  await writeJSON("history.json", all)
}

export async function clearHistory(userId) {
  const all = await readJSON("history.json", {})
  delete all[userId]
  await writeJSON("history.json", all)
}

// ===== Tasks / reminders =====
export async function getTasks() {
  return await readJSON("tasks.json", [])
}

export async function addTask(task) {
  const tasks = await getTasks()
  const newTask = {
    id: Date.now().toString(),
    createdAt: new Date().toISOString(),
    done: false,
    ...task,
  }
  tasks.push(newTask)
  await writeJSON("tasks.json", tasks)
  return newTask
}

export async function updateTask(id, patch) {
  const tasks = await getTasks()
  const idx = tasks.findIndex((t) => t.id === id)
  if (idx === -1) return null
  tasks[idx] = { ...tasks[idx], ...patch }
  await writeJSON("tasks.json", tasks)
  return tasks[idx]
}

export async function removeTask(id) {
  const tasks = await getTasks()
  const filtered = tasks.filter((t) => t.id !== id)
  await writeJSON("tasks.json", filtered)
  return tasks.length !== filtered.length
}
