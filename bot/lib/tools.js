// Tools yang bisa dipanggil oleh AI agent
import { tool } from "ai"
import { z } from "zod"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import * as cheerio from "cheerio"
import { addTask, getTasks, updateTask, removeTask } from "./storage.js"

const execAsync = promisify(exec)

// ===== Whitelist command shell yang aman =====
// Tambah/kurang sesuai kebutuhan. Command di luar daftar akan ditolak.
const SAFE_COMMAND_PREFIXES = [
  "ls",
  "pwd",
  "whoami",
  "date",
  "uptime",
  "df",
  "du",
  "free",
  "ps",
  "top -b -n 1",
  "uname",
  "cat /proc/cpuinfo",
  "cat /proc/meminfo",
  "systemctl status",
  "systemctl list-units",
  "journalctl",
  "docker ps",
  "docker images",
  "docker logs",
  "git status",
  "git log",
  "git pull",
  "pm2 list",
  "pm2 logs",
  "pm2 status",
  "netstat",
  "ss",
  "curl",
  "wget --spider",
  "ping -c",
  "tail",
  "head",
  "grep",
  "find",
  "echo",
]

// Pattern command berbahaya yang DILARANG total
const DANGEROUS_PATTERNS = [
  /rm\s+-rf/i,
  /mkfs/i,
  /:\(\)\{/, // fork bomb
  /dd\s+if=/i,
  /shutdown/i,
  /reboot/i,
  /poweroff/i,
  /halt/i,
  /chmod\s+777/i,
  />\s*\/dev\/sd/i,
  /passwd/i,
  /useradd|userdel/i,
  /\bsu\s/i,
  /sudo\s+rm/i,
]

function isCommandSafe(cmd) {
  const trimmed = cmd.trim()
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmed)) return { safe: false, reason: "Command mengandung pattern berbahaya" }
  }
  const isWhitelisted = SAFE_COMMAND_PREFIXES.some(
    (prefix) => trimmed === prefix || trimmed.startsWith(prefix + " "),
  )
  if (!isWhitelisted) {
    return {
      safe: false,
      reason: `Command tidak ada di whitelist. Whitelist tersedia: ${SAFE_COMMAND_PREFIXES.slice(0, 12).join(", ")}, dst.`,
    }
  }
  return { safe: true }
}

/**
 * Buat tools dengan context (chatId) di-bind otomatis.
 * Dipanggil setiap pesan masuk supaya tool addReminder tahu chatId mana yang akan dikirim notifikasi.
 */
export function buildTools(ctx) {
  const { chatId } = ctx

  const execShell = tool({
    description:
      "Jalankan command shell di VPS. HANYA command yang ada di whitelist (ls, df, ps, docker ps, git status, pm2, dll) yang diizinkan. Command berbahaya seperti rm -rf, shutdown, dll akan ditolak.",
    inputSchema: z.object({
      command: z.string().describe("Command shell yang akan dijalankan, contoh: 'df -h' atau 'pm2 list'"),
    }),
    execute: async ({ command }) => {
      const check = isCommandSafe(command)
      if (!check.safe) {
        return { error: check.reason, command }
      }
      try {
        const { stdout, stderr } = await execAsync(command, {
          timeout: 15000,
          maxBuffer: 1024 * 200,
        })
        const output = (stdout || stderr || "(no output)").slice(0, 3500)
        return { command, output }
      } catch (err) {
        return { command, error: err.message?.slice(0, 1000) || "Unknown error" }
      }
    },
  })

  const webSearch = tool({
    description:
      "Cari informasi di internet menggunakan DuckDuckGo. Gunakan untuk pertanyaan terkini, berita, atau fakta.",
    inputSchema: z.object({
      query: z.string().describe("Kata kunci pencarian"),
      limit: z.number().min(1).max(10).default(5).describe("Jumlah hasil yang dikembalikan"),
    }),
    execute: async ({ query, limit }) => {
      try {
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; X11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          },
        })
        const html = await res.text()
        const $ = cheerio.load(html)
        const results = []
        $(".result").each((i, el) => {
          if (results.length >= limit) return false
          const title = $(el).find(".result__title").text().trim()
          const snippet = $(el).find(".result__snippet").text().trim()
          const link = $(el).find(".result__url").text().trim()
          if (title) results.push({ title, snippet, url: link })
        })
        return { query, count: results.length, results }
      } catch (err) {
        return { query, error: err.message }
      }
    },
  })

  const fetchPage = tool({
    description:
      "Ambil konten teks dari sebuah URL halaman web. Gunakan setelah webSearch untuk membaca artikel detail.",
    inputSchema: z.object({
      url: z.string().describe("URL halaman web yang ingin dibaca"),
    }),
    execute: async ({ url }) => {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Linux; X11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          },
        })
        if (!res.ok) return { url, error: `HTTP ${res.status}` }
        const html = await res.text()
        const $ = cheerio.load(html)
        $("script, style, nav, footer, header, aside").remove()
        const title = $("title").text().trim()
        const text = $("body").text().replace(/\s+/g, " ").trim().slice(0, 5000)
        return { url, title, text }
      } catch (err) {
        return { url, error: err.message }
      }
    },
  })

  const addReminder = tool({
    description:
      "Simpan task atau pengingat. Untuk pengingat terjadwal, isi field 'remindAt' dengan ISO datetime string (contoh: 2026-05-07T09:00:00+07:00 untuk WIB). Notifikasi otomatis dikirim ke chat user.",
    inputSchema: z.object({
      title: z.string().describe("Judul task / pengingat"),
      notes: z.string().nullable().describe("Catatan tambahan, isi null jika tidak ada"),
      remindAt: z
        .string()
        .nullable()
        .describe("ISO datetime string kapan pengingat akan dikirim. Isi null jika hanya task tanpa jadwal."),
    }),
    execute: async ({ title, notes, remindAt }) => {
      const task = await addTask({ title, notes, remindAt, chatId, notified: false })
      return { ok: true, task }
    },
  })

  const listReminders = tool({
    description: "Lihat semua task & pengingat yang tersimpan.",
    inputSchema: z.object({
      onlyPending: z.boolean().default(true).describe("Tampilkan hanya yang belum selesai"),
    }),
    execute: async ({ onlyPending }) => {
      const tasks = await getTasks()
      const userTasks = tasks.filter((t) => t.chatId === chatId)
      const filtered = onlyPending ? userTasks.filter((t) => !t.done) : userTasks
      return { count: filtered.length, tasks: filtered }
    },
  })

  const completeReminder = tool({
    description: "Tandai task / pengingat sebagai selesai berdasarkan ID-nya.",
    inputSchema: z.object({
      id: z.string().describe("ID task"),
    }),
    execute: async ({ id }) => {
      const updated = await updateTask(id, { done: true })
      if (!updated) return { ok: false, error: "Task tidak ditemukan" }
      return { ok: true, task: updated }
    },
  })

  const deleteReminder = tool({
    description: "Hapus task / pengingat berdasarkan ID-nya.",
    inputSchema: z.object({
      id: z.string().describe("ID task"),
    }),
    execute: async ({ id }) => {
      const ok = await removeTask(id)
      return { ok }
    },
  })

  return {
    execShell,
    webSearch,
    fetchPage,
    addReminder,
    listReminders,
    completeReminder,
    deleteReminder,
  }
}
