// AI Agent dengan multi-provider support
import { generateText, stepCountIs } from "ai"
import { createOpenAI } from "@ai-sdk/openai"
import { buildTools } from "./tools.js"
import { getHistory, appendHistory } from "./storage.js"
import { selectModel } from "./models.js"

// OpenAI direct provider (jika tidak pakai Vercel Gateway)
const openaiDirect = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
})

function buildSystemPrompt() {
  const now = new Date()
  const wib = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  return `Kamu adalah asisten pribadi yang membantu user lewat Telegram. Kamu berjalan di VPS milik user.

Kemampuan kamu:
- Menjawab pertanyaan umum, ringkas teks, terjemah
- Cari informasi terkini di internet (gunakan webSearch lalu fetchPage untuk detail)
- Kelola task & pengingat (addReminder, listReminders, completeReminder, deleteReminder)
- Eksekusi command shell di VPS (execShell) - HANYA untuk monitoring, bukan modifikasi destruktif

Aturan:
- Jawab dalam bahasa Indonesia kecuali user pakai bahasa lain
- Format jawaban Telegram: gunakan markdown sederhana (*bold*, _italic_, \`code\`), JANGAN pakai heading "#"
- Saat user minta info terkini, SELALU pakai webSearch dulu - jangan menjawab dari memori
- Saat eksekusi command shell, jelaskan dulu apa yang akan kamu lakukan
- Jika command ditolak whitelist, beritahu user command apa yang aman digunakan
- Untuk pengingat, parse waktu user (contoh "besok jam 9 pagi") menjadi ISO datetime di timezone WIB (+07:00)
- Jaga jawaban ringkas dan to-the-point, hindari verbose

Waktu sekarang (WIB): ${wib.toISOString().replace("Z", "+07:00")}`
}

/**
 * Resolve model berdasarkan provider
 */
function resolveModel(modelId, provider) {
  if (provider === "openai") {
    // Direct OpenAI (tanpa Vercel Gateway)
    return openaiDirect(modelId)
  }
  // Default: Vercel AI Gateway (pass string langsung)
  return modelId
}

/**
 * Jalankan agent untuk satu pesan user.
 */
export async function runAgent({ userId, chatId, userMessage }) {
  const history = await getHistory(userId)
  const tools = buildTools({ chatId })

  // Pilih model berdasarkan mode & kompleksitas
  const { model: modelId, provider, reason } = selectModel(userMessage)

  const messages = [...history, { role: "user", content: userMessage }]

  const result = await generateText({
    model: resolveModel(modelId, provider),
    system: buildSystemPrompt(),
    messages,
    tools,
    stopWhen: stepCountIs(15),
  })

  const finalText = result.text || "(tidak ada jawaban)"

  // Simpan history
  await appendHistory(userId, { role: "user", content: userMessage })
  await appendHistory(userId, { role: "assistant", content: finalText })

  return {
    text: finalText,
    steps: result.steps?.length || 0,
    model: modelId,
    reason,
  }
}
