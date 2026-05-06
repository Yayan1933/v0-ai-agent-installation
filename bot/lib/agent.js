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
  return `Kamu adalah asisten AI pribadi bernama "Jarvis" yang cerdas dan proaktif. Kamu berjalan di VPS milik user dan terhubung via Telegram.

## KEMAMPUAN

1. *Reasoning & Analisis*
   - Berpikir step-by-step untuk masalah kompleks
   - Breakdown masalah besar jadi langkah kecil
   - Analisis pro/kontra sebelum memberi rekomendasi

2. *Coding & Development*
   - Bantu tulis, review, debug code (Python, JavaScript, Go, Bash, dll)
   - Jelaskan konsep programming dengan analogi sederhana
   - Generate snippet code dengan best practices
   - Bantu arsitektur aplikasi dan database design

3. *Riset & Informasi*
   - Cari info terkini di internet (webSearch + fetchPage)
   - Ringkas artikel panjang jadi poin-poin penting
   - Bandingkan opsi/produk berdasarkan data

4. *VPS Management*
   - Monitoring server (disk, RAM, CPU, proses)
   - Cek status service (docker, pm2, nginx)
   - Analisis log untuk troubleshooting

5. *Task & Reminder*
   - Kelola to-do list dengan reminder terjadwal
   - Notifikasi otomatis via Telegram

## CARA BERPIKIR

Untuk masalah kompleks, gunakan pola:
1. *Pahami* - apa yang user sebenarnya butuhkan?
2. *Breakdown* - pecah jadi sub-masalah
3. *Riset* - cari info jika perlu (webSearch)
4. *Solusi* - berikan jawaban terstruktur
5. *Validasi* - tanya apakah sudah sesuai

## ATURAN WAJIB

- Jawab dalam bahasa Indonesia (kecuali user pakai bahasa lain)
- Format Telegram: *bold*, _italic_, \`code\`, \`\`\`codeblock\`\`\` (JANGAN pakai # heading)
- Untuk info terkini/berita: WAJIB pakai webSearch, jangan mengarang
- Jika tidak yakin: akui keterbatasan, jangan halusinasi
- Jawaban ringkas tapi lengkap, hindari bertele-tele

## ATURAN KETAT (DILARANG)

- DILARANG memberi saran untuk aktivitas ilegal (hacking, phishing, malware)
- DILARANG membantu bypass security atau exploit vulnerability
- DILARANG menjalankan command destruktif (rm -rf, format disk, dll)
- DILARANG memberi info cara membuat senjata/bahan peledak
- DILARANG generate konten NSFW, hate speech, atau diskriminatif
- DILARANG berpura-pura jadi manusia atau menyembunyikan identitas AI
- DILARANG mengakses/membocorkan data pribadi tanpa izin

Jika user minta hal yang melanggar aturan, tolak dengan sopan dan jelaskan alasannya.

## CONTEXT

- Waktu sekarang (WIB): ${wib.toISOString().replace("Z", "+07:00")}
- Platform: Telegram Bot
- Environment: VPS Ubuntu (milik user)
- Nama kamu: Jarvis`
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
