// Telegram AI Agent - Entry point
import "dotenv/config"
import { Bot } from "grammy"
import { runAgent } from "./lib/agent.js"
import { clearHistory } from "./lib/storage.js"
import { listModels, selectModel } from "./lib/models.js"
import { startScheduler } from "./lib/scheduler.js"

// ===== Validasi env =====
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
if (!TOKEN) {
  console.error("ERROR: TELEGRAM_BOT_TOKEN belum di-set di .env")
  process.exit(1)
}

// AI Gateway perlu API key kecuali jika sudah login via Vercel CLI
if (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENAI_API_KEY) {
  console.warn(
    "WARNING: AI_GATEWAY_API_KEY belum di-set. Bot mungkin gagal saat memanggil model. Set di .env",
  )
}

// ===== Whitelist user =====
const ALLOWED_IDS = (process.env.ALLOWED_TELEGRAM_IDS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .map(Number)

if (ALLOWED_IDS.length === 0) {
  console.warn("WARNING: ALLOWED_TELEGRAM_IDS kosong - semua user akan ditolak. Set di .env")
}

function isAllowed(userId) {
  return ALLOWED_IDS.includes(userId)
}

// ===== Setup bot =====
const bot = new Bot(TOKEN)

// Middleware: cek whitelist
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id
  if (!userId || !isAllowed(userId)) {
    console.log(`[auth] Ditolak: user ${userId} (${ctx.from?.username || "?"})`)
    if (ctx.chat) {
      await ctx.reply(
        `Maaf, akses ditolak. ID Telegram Anda: \`${userId}\`\nMinta admin tambahkan ID ini ke whitelist.`,
        { parse_mode: "Markdown" },
      )
    }
    return
  }
  await next()
})

// /start
bot.command("start", async (ctx) => {
  await ctx.reply(
    [
      "*Halo! Saya asisten AI pribadi Anda.*",
      "",
      "Saya bisa bantu:",
      "• Tanya jawab, ringkas, terjemah",
      "• Cari info terkini di internet",
      "• Atur task & pengingat (notifikasi otomatis)",
      "• Cek status VPS (df, ps, pm2, dll)",
      "",
      "Perintah:",
      "/clear - hapus history percakapan",
      "/whoami - tampilkan ID Telegram Anda",
      "/models - lihat model AI tersedia",
      "/mode - info mode AI (hemat/standar/premium/auto)",
      "",
      "Langsung kirim pesan saja untuk mulai!",
    ].join("\n"),
    { parse_mode: "Markdown" },
  )
})

// /clear
bot.command("clear", async (ctx) => {
  await clearHistory(ctx.from.id)
  await ctx.reply("History percakapan dihapus.")
})

// /whoami
bot.command("whoami", async (ctx) => {
  await ctx.reply(
    `ID: \`${ctx.from.id}\`\nUsername: @${ctx.from.username || "-"}\nChat ID: \`${ctx.chat.id}\``,
    { parse_mode: "Markdown" },
  )
})

// /models - list available models
bot.command("models", async (ctx) => {
  const current = selectModel("")
  const text = listModels() + `\n\n_Aktif:_ \`${current.model}\` (${current.reason})`
  await ctx.reply(text, { parse_mode: "Markdown" })
})

// /mode - switch mode cepat
bot.command("mode", async (ctx) => {
  await ctx.reply(
    `*Mode AI:*
• \`hemat\` - Model termurah (Gemini Flash)
• \`standar\` - Balance harga/kualitas (GPT-4o-mini)
• \`premium\` - Model terbaik (Claude Sonnet)
• \`auto\` - Otomatis pilih berdasarkan kompleksitas

_Set di .env:_ \`AI_MODE=hemat\`
_Aktif sekarang:_ \`${process.env.AI_MODE || "standar"}\``,
    { parse_mode: "Markdown" },
  )
})

// Pesan teks biasa - kirim ke AI agent
bot.on("message:text", async (ctx) => {
  const userMessage = ctx.message.text
  const userId = ctx.from.id
  const chatId = ctx.chat.id

  // Kirim "typing..." indicator
  const typingInterval = setInterval(() => {
    ctx.api.sendChatAction(chatId, "typing").catch(() => {})
  }, 4000)
  ctx.api.sendChatAction(chatId, "typing").catch(() => {})

  try {
    console.log(`[msg] ${userId}: ${userMessage.slice(0, 80)}`)
    const result = await runAgent({ userId, chatId, userMessage })
    clearInterval(typingInterval)

    // Telegram batas pesan 4096 char
    const text = result.text.slice(0, 4000)
    try {
      await ctx.reply(text, { parse_mode: "Markdown" })
    } catch (err) {
      // Fallback tanpa markdown jika parsing gagal
      await ctx.reply(text)
    }
    console.log(`[msg] -> respond (${result.model}, ${result.steps} steps)`)
  } catch (err) {
    clearInterval(typingInterval)
    console.error("[msg] Error:", err)
    await ctx.reply(`Error: ${err.message?.slice(0, 500) || "Unknown error"}`)
  }
})

// Error handler global
bot.catch((err) => {
  console.error("[bot] Uncaught error:", err)
})

// ===== Start =====
const startupModel = selectModel("")
console.log("[bot] Starting...")
console.log(`[bot] Allowed IDs: ${ALLOWED_IDS.join(", ") || "(none)"}`)
console.log(`[bot] Mode: ${process.env.AI_MODE || "standar"} | Model: ${startupModel.model}`)

startScheduler(bot)

bot.start({
  onStart: (info) => {
    console.log(`[bot] Running as @${info.username}`)
  },
})

// Graceful shutdown
process.once("SIGINT", () => bot.stop())
process.once("SIGTERM", () => bot.stop())
