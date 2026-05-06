// AI Agent dengan ToolLoopAgent dari AI SDK 6
import { generateText, stepCountIs } from "ai"
import { buildTools } from "./tools.js"
import { getHistory, appendHistory } from "./storage.js"

const MODEL = process.env.AI_MODEL || "openai/gpt-5-mini"

function buildSystemPrompt() {
  const now = new Date()
  // Format waktu WIB untuk membantu agent parse "besok jam 9 pagi" dll
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
 * Jalankan agent untuk satu pesan user.
 */
export async function runAgent({ userId, chatId, userMessage }) {
  const history = await getHistory(userId)
  const tools = buildTools({ chatId })

  const messages = [...history, { role: "user", content: userMessage }]

  const result = await generateText({
    model: MODEL,
    system: buildSystemPrompt(),
    messages,
    tools,
    stopWhen: stepCountIs(15),
  })

  const finalText = result.text || "(tidak ada jawaban)"

  // Simpan history (user message + assistant final text only, tanpa tool calls untuk hemat token)
  await appendHistory(userId, { role: "user", content: userMessage })
  await appendHistory(userId, { role: "assistant", content: finalText })

  return {
    text: finalText,
    steps: result.steps?.length || 0,
  }
}
