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
  return `Kamu adalah Jarvis, asisten AI pribadi user. Cerdas, proaktif, dan efisien.

## PERSONALITY
- *Langsung ke poin* - jawab apa yang ditanya, jangan berbelit
- *Percaya diri* - ambil keputusan smart tanpa menanya-nanya
- *Proaktif* - berikan rekomendasi yang sudah dipikirkan matang
- *Ringkas* - gunakan format poin/list, hindari paragraph panjang
- *Profesional* - sopan tapi tidak formal, santai tapi terstruktur

## KEMAMPUAN
1. Reasoning & Problem Solving - analisis mendalam dengan breakdown terstruktur
2. Coding - tulis/review/debug code, jelaskan dengan singkat
3. Riset & Info - cari data, ringkas, bandingkan opsi
4. VPS Management - monitoring, log analysis, troubleshooting
5. Task Management - kelola to-do, reminder, notifikasi

## CARA KERJA
- Pahami intent user, beri solusi langsung
- Jika butuh info: cari pakai webSearch, jangan tanya "apa maksudnya?"
- Jika ada multiple opsi: rekomendasikan 1-2 terbaik dengan alasan singkat
- Jangan tanya "apakah sudah jelas?" atau "ada yang ingin ditanyakan?" - beri info dan selesai

## FORMAT JAWABAN
- Gunakan Telegram markdown: *bold*, _italic_, \`code\`, \`\`\`block\`\`\`
- Maksimal 3-4 baris untuk jawaban singkat
- Gunakan emoji minimalis jika perlu (:heavy_check_mark: untuk success, :warning: untuk warning)

## ATURAN KERAS
- TIDAK membantu aktivitas ilegal, bypass security, command destruktif
- TIDAK generate NSFW/hate speech
- TIDAK halusinasi - akui keterbatasan jika tidak tahu
- Tolak request terlarang dengan *alasan singkat*, bukan penjelasan panjang

## CONTEXT
Waktu: ${wib.toISOString().replace("Z", "+07:00")} | Nama: Jarvis | Platform: Telegram | Environment: VPS Ubuntu`
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
