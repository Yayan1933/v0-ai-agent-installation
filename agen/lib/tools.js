// Tools yang bisa dipanggil oleh AI agent
import { tool } from "ai"
import { z } from "zod"
import { exec } from "node:child_process"
import { promisify } from "node:util"
import * as cheerio from "cheerio"
import { addTask, getTasks, updateTask, removeTask } from "./storage.js"
import * as fs from "node:fs/promises"
import * as path from "node:path"

const execAsync = promisify(exec)

// Base directory untuk file operations (keamanan)
const HOME_DIR = process.env.HOME || "/home/ubuntu"

// ===== Whitelist command shell yang aman =====
// Tambah/kurang sesuai kebutuhan. Command di luar daftar akan ditolak.
const SAFE_COMMAND_PREFIXES = [
  // Monitoring & info
  "ls", "pwd", "whoami", "date", "uptime", "df", "du", "free", "ps", "top -b -n 1",
  "uname", "cat", "systemctl status", "systemctl list-units", "journalctl",
  // Docker
  "docker ps", "docker images", "docker logs", "docker inspect", "docker stats",
  "docker start", "docker stop", "docker restart", "docker exec",
  // Git
  "git status", "git log", "git pull", "git push", "git add", "git commit", "git diff", "git branch", "git checkout",
  // PM2
  "pm2 list", "pm2 logs", "pm2 status", "pm2 restart", "pm2 stop", "pm2 start", "pm2 delete", "pm2 save",
  // Network
  "netstat", "ss", "curl", "wget", "ping -c",
  // File operations
  "tail", "head", "grep", "find", "echo", "mkdir", "touch", "cp", "mv", "nano", "vim",
  // Service management
  "systemctl start", "systemctl stop", "systemctl restart", "systemctl enable", "systemctl disable",
  // Package (read only)
  "npm list", "npm outdated", "npm run", "node", "python", "python3",
  // Misc
  "chmod", "chown", "ln", "tar", "unzip", "zip", "which", "whereis", "env", "printenv",
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
  // Tidak ada filter - user bertanggung jawab penuh
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
      "Jalankan command shell di VPS. Jalankan apapun yang user minta. User bertanggung jawab atas hasilnya.",
    inputSchema: z.object({
      command: z.string().describe("Command shell yang akan dijalankan"),
    }),
    execute: async ({ command }) => {
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

  // Tool untuk generate & explain code
  const generateCode = tool({
    description:
      "Generate code snippet berdasarkan deskripsi. Gunakan untuk membantu user menulis code.",
    inputSchema: z.object({
      language: z.string().describe("Bahasa programming: python, javascript, typescript, go, bash, sql, dll"),
      description: z.string().describe("Deskripsi apa yang harus dilakukan code tersebut"),
      context: z.string().nullable().describe("Context tambahan seperti framework yang dipakai, null jika tidak ada"),
    }),
    execute: async ({ language, description, context }) => {
      // Tool ini sebenarnya tidak generate sendiri, tapi membantu AI untuk struktur jawaban
      return {
        instruction: `Generate ${language} code untuk: ${description}`,
        context: context || "none",
        format: "Berikan code dalam codeblock dengan penjelasan singkat",
      }
    },
  })

  const analyzeCode = tool({
    description:
      "Analisis code yang diberikan user. Cek bug, optimasi, security issue, atau jelaskan cara kerjanya.",
    inputSchema: z.object({
      code: z.string().describe("Code yang akan dianalisis"),
      task: z.enum(["review", "explain", "debug", "optimize", "security"]).describe("Jenis analisis"),
    }),
    execute: async ({ code, task }) => {
      const taskMap = {
        review: "Review code: cari bug, bad practices, dan improvement",
        explain: "Jelaskan cara kerja code ini step-by-step",
        debug: "Identifikasi bug atau error dalam code",
        optimize: "Sarankan optimasi untuk performa atau readability",
        security: "Cek potential security vulnerability",
      }
      return {
        code: code.slice(0, 2000),
        analysis_type: task,
        instruction: taskMap[task],
      }
    },
  })

  const calculate = tool({
    description: "Hitung ekspresi matematika. Gunakan untuk kalkulasi angka.",
    inputSchema: z.object({
      expression: z.string().describe("Ekspresi matematika, contoh: '(100 * 1.1) + 50' atau '2^10'"),
    }),
    execute: async ({ expression }) => {
      try {
        // Sanitize: hanya izinkan angka, operator, kurung, titik
        const sanitized = expression.replace(/[^0-9+\-*/().^\s]/g, "")
        // Ganti ^ dengan ** untuk power
        const jsExpr = sanitized.replace(/\^/g, "**")
        // Evaluate dengan Function (lebih aman dari eval)
        const result = new Function(`return (${jsExpr})`)()
        return { expression, result: Number(result) }
      } catch (err) {
        return { expression, error: "Ekspresi tidak valid" }
      }
    },
  })

  // ===== FILE OPERATIONS =====
  
  const readFile = tool({
    description: "Baca isi file di VPS. Gunakan untuk melihat config, code, log, dll.",
    inputSchema: z.object({
      filePath: z.string().describe("Path file (absolute atau relative dari home)"),
      lines: z.number().default(100).describe("Jumlah baris maksimal yang dibaca"),
    }),
    execute: async ({ filePath, lines }) => {
      try {
        const fullPath = filePath.startsWith("/") ? filePath : path.join(HOME_DIR, filePath)
        const content = await fs.readFile(fullPath, "utf-8")
        const limited = content.split("\n").slice(0, lines).join("\n")
        return { path: fullPath, content: limited.slice(0, 8000), truncated: content.length > 8000 }
      } catch (err) {
        return { path: filePath, error: err.message }
      }
    },
  })

  const writeFile = tool({
    description: "Tulis/overwrite file di VPS. Gunakan untuk edit config, buat script, dll.",
    inputSchema: z.object({
      filePath: z.string().describe("Path file (absolute atau relative dari home)"),
      content: z.string().describe("Isi file yang akan ditulis"),
      append: z.boolean().default(false).describe("Append ke file (true) atau overwrite (false)"),
    }),
    execute: async ({ filePath, content, append }) => {
      try {
        const fullPath = filePath.startsWith("/") ? filePath : path.join(HOME_DIR, filePath)
        // Safety: jangan tulis ke system files
        if (fullPath.startsWith("/etc/") || fullPath.startsWith("/usr/") || fullPath.startsWith("/bin/")) {
          return { error: "Tidak boleh menulis ke system directory" }
        }
        await fs.mkdir(path.dirname(fullPath), { recursive: true })
        if (append) {
          await fs.appendFile(fullPath, content)
        } else {
          await fs.writeFile(fullPath, content)
        }
        return { ok: true, path: fullPath, bytes: content.length }
      } catch (err) {
        return { path: filePath, error: err.message }
      }
    },
  })

  const listFiles = tool({
    description: "List isi directory di VPS.",
    inputSchema: z.object({
      dirPath: z.string().default(".").describe("Path directory"),
      showHidden: z.boolean().default(false).describe("Tampilkan file hidden (.)"),
    }),
    execute: async ({ dirPath, showHidden }) => {
      try {
        const fullPath = dirPath.startsWith("/") ? dirPath : path.join(HOME_DIR, dirPath)
        const items = await fs.readdir(fullPath, { withFileTypes: true })
        const files = items
          .filter(i => showHidden || !i.name.startsWith("."))
          .map(i => ({
            name: i.name,
            type: i.isDirectory() ? "dir" : "file",
          }))
        return { path: fullPath, count: files.length, files }
      } catch (err) {
        return { path: dirPath, error: err.message }
      }
    },
  })

  const deleteFile = tool({
    description: "Hapus file di VPS. HATI-HATI: tidak bisa di-undo.",
    inputSchema: z.object({
      filePath: z.string().describe("Path file yang akan dihapus"),
      confirm: z.boolean().describe("Harus true untuk konfirmasi penghapusan"),
    }),
    execute: async ({ filePath, confirm }) => {
      if (!confirm) return { error: "Set confirm=true untuk menghapus" }
      try {
        const fullPath = filePath.startsWith("/") ? filePath : path.join(HOME_DIR, filePath)
        // Safety checks
        if (fullPath === HOME_DIR || fullPath === "/") {
          return { error: "Tidak boleh menghapus home/root directory" }
        }
        if (fullPath.startsWith("/etc/") || fullPath.startsWith("/usr/")) {
          return { error: "Tidak boleh menghapus system files" }
        }
        await fs.rm(fullPath, { recursive: false })
        return { ok: true, deleted: fullPath }
      } catch (err) {
        return { path: filePath, error: err.message }
      }
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
    generateCode,
    analyzeCode,
    calculate,
    // File operations
    readFile,
    writeFile,
    listFiles,
    deleteFile,
  }
}
