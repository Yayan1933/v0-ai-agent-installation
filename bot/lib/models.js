// Konfigurasi multi-provider AI dengan mode hemat & auto

/**
 * Daftar model yang didukung
 * cost: perkiraan $/1M tokens (input+output rata-rata)
 */
export const MODELS = {
  // === HEMAT (murah) ===
  "openai/gpt-4o-mini": {
    provider: "vercel", // via AI Gateway
    cost: 0.3,
    tier: "hemat",
    desc: "OpenAI mini - cepat & murah",
  },
  "google/gemini-2.0-flash": {
    provider: "vercel",
    cost: 0.1,
    tier: "hemat",
    desc: "Google Flash - sangat murah",
  },
  "anthropic/claude-3-5-haiku-latest": {
    provider: "vercel",
    cost: 1.0,
    tier: "hemat",
    desc: "Claude Haiku - cepat",
  },

  // === STANDAR ===
  "openai/gpt-4o": {
    provider: "vercel",
    cost: 7.5,
    tier: "standar",
    desc: "OpenAI GPT-4o - balanced",
  },
  "anthropic/claude-sonnet-4-20250514": {
    provider: "vercel",
    cost: 9.0,
    tier: "standar",
    desc: "Claude Sonnet 4 - smart",
  },
  "google/gemini-2.0-pro": {
    provider: "vercel",
    cost: 5.0,
    tier: "standar",
    desc: "Google Pro - capable",
  },

  // === PREMIUM ===
  "openai/gpt-4.5-preview": {
    provider: "vercel",
    cost: 75,
    tier: "premium",
    desc: "GPT-4.5 - flagship (mahal)",
  },
  "anthropic/claude-opus-4-20250514": {
    provider: "vercel",
    cost: 45,
    tier: "premium",
    desc: "Claude Opus 4 - top tier",
  },

  // === OPENAI DIRECT (tanpa Vercel Gateway) ===
  "gpt-4o-mini": {
    provider: "openai",
    cost: 0.3,
    tier: "hemat",
    desc: "OpenAI direct - mini",
  },
  "gpt-4o": {
    provider: "openai",
    cost: 7.5,
    tier: "standar",
    desc: "OpenAI direct - 4o",
  },
}

// Default per mode
const MODE_DEFAULTS = {
  hemat: "google/gemini-2.0-flash", // termurah
  standar: "openai/gpt-4o-mini", // balance murah+bagus
  premium: "anthropic/claude-sonnet-4-20250514",
  auto: null, // pilih berdasarkan kompleksitas
}

/**
 * Deteksi kompleksitas pesan untuk mode auto
 */
function detectComplexity(message) {
  const lower = message.toLowerCase()

  // Premium: coding, analisis panjang, reasoning kompleks
  if (
    lower.includes("code") ||
    lower.includes("kode") ||
    lower.includes("debug") ||
    lower.includes("analisis mendalam") ||
    lower.includes("jelaskan secara detail") ||
    message.length > 500
  ) {
    return "premium"
  }

  // Standar: task dengan context, search, multi-step
  if (
    lower.includes("cari") ||
    lower.includes("search") ||
    lower.includes("bandingkan") ||
    lower.includes("reminder") ||
    lower.includes("pengingat") ||
    lower.includes("jalankan") ||
    lower.includes("exec")
  ) {
    return "standar"
  }

  // Default: hemat untuk chat ringan
  return "hemat"
}

/**
 * Pilih model berdasarkan mode dan pesan
 */
export function selectModel(message = "") {
  const mode = (process.env.AI_MODE || "standar").toLowerCase()
  const manualModel = process.env.AI_MODEL

  // Jika user set model manual, pakai itu
  if (manualModel && MODELS[manualModel]) {
    return {
      model: manualModel,
      provider: MODELS[manualModel].provider,
      reason: "manual",
    }
  }

  // Mode auto: pilih berdasarkan kompleksitas
  if (mode === "auto") {
    const complexity = detectComplexity(message)
    const model = MODE_DEFAULTS[complexity]
    return {
      model,
      provider: MODELS[model].provider,
      reason: `auto (${complexity})`,
    }
  }

  // Mode fixed (hemat/standar/premium)
  const model = MODE_DEFAULTS[mode] || MODE_DEFAULTS.standar
  return {
    model,
    provider: MODELS[model].provider,
    reason: mode,
  }
}

/**
 * List semua model untuk command /models
 */
export function listModels() {
  const grouped = { hemat: [], standar: [], premium: [] }

  for (const [id, info] of Object.entries(MODELS)) {
    grouped[info.tier]?.push(`• \`${id}\` - ${info.desc} ($${info.cost}/1M tok)`)
  }

  return `*Model Tersedia:*

*HEMAT* (murah):
${grouped.hemat.join("\n")}

*STANDAR* (balanced):
${grouped.standar.join("\n")}

*PREMIUM* (powerful):
${grouped.premium.join("\n")}

_Set via .env:_
\`AI_MODE=hemat|standar|premium|auto\`
\`AI_MODEL=model_id\` (override manual)`
}
