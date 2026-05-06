# Telegram AI Agent

AI agent pribadi yang berjalan di VPS, terhubung ke Telegram. Dibangun dengan Vercel AI SDK 6 + grammy.

## Fitur

- Chat AI umum (tanya jawab, ringkas, terjemah)
- Pencarian internet via DuckDuckGo + scraping halaman
- Manajemen task & pengingat dengan notifikasi otomatis
- Eksekusi command shell di VPS (whitelist + filter command berbahaya)
- Whitelist Telegram User ID
- History percakapan disimpan ke file JSON lokal

## Arsitektur

```
bot/
├── index.js              # Entry point - setup bot Telegram
├── lib/
│   ├── agent.js          # AI Agent (generateText + tools)
│   ├── tools.js          # Definisi tools: shell, search, fetch, reminders
│   ├── storage.js        # JSON file storage (history & tasks)
│   └── scheduler.js      # Cron job untuk kirim notifikasi reminder
├── data/                 # File JSON: history.json, tasks.json
├── ecosystem.config.cjs  # Konfigurasi PM2
└── .env                  # Konfigurasi (dari .env.example)
```

## Instalasi di VPS

### 1. Prasyarat

- Node.js 20+ terinstall di VPS
- PM2 terinstall global: `npm install -g pm2`
- Bot token Telegram (dari [@BotFather](https://t.me/BotFather))
- Telegram User ID Anda (chat [@userinfobot](https://t.me/userinfobot))
- API key Vercel AI Gateway (dari [Vercel Dashboard](https://vercel.com/d/stores/ai-gateway))

### 2. Upload folder ke VPS

```bash
# Dari komputer lokal, copy folder bot ke VPS
scp -r bot user@vps-ip:/home/user/

# Atau pakai git
ssh user@vps-ip
git clone <your-repo>
cd <your-repo>/bot
```

### 3. Install dependencies

```bash
cd bot
npm install
```

### 4. Setup environment

```bash
cp .env.example .env
nano .env
```

Isi:
- `TELEGRAM_BOT_TOKEN` - dari @BotFather
- `AI_GATEWAY_API_KEY` - dari Vercel
- `ALLOWED_TELEGRAM_IDS` - User ID Anda (pisah koma jika multiple)

### 5. Test jalankan manual

```bash
npm start
```

Cek log, lalu chat bot di Telegram. Kalau OK, hentikan dengan Ctrl+C.

### 6. Jalankan dengan PM2

```bash
mkdir -p logs
npm run pm2:start

# Lihat status
pm2 list

# Lihat log realtime
npm run pm2:logs

# Restart
npm run pm2:restart

# Stop
npm run pm2:stop
```

### 7. Auto-start saat boot VPS

```bash
pm2 save
pm2 startup
# Jalankan command yang ditampilkan PM2
```

## Penggunaan

Chat bot di Telegram, contoh:

- `Apa kabar dunia hari ini?` → web search + summary
- `Cek disk usage VPS dong` → execShell `df -h`
- `Ingatkan saya meeting besok jam 9 pagi` → addReminder
- `Apa task saya?` → listReminders
- `Selesaikan task <id>` → completeReminder
- `Status pm2?` → execShell `pm2 list`

Perintah:
- `/start` - info bot
- `/clear` - hapus history percakapan
- `/whoami` - tampilkan ID Telegram Anda

## Keamanan

**Whitelist user**: hanya `ALLOWED_TELEGRAM_IDS` yang bisa pakai bot. User lain ditolak.

**Whitelist command shell**: hanya command monitoring yang diizinkan (ls, df, ps, docker ps, pm2, git status, dll). Command berbahaya seperti `rm -rf`, `shutdown`, `passwd` ditolak otomatis.

**Edit whitelist**: `bot/lib/tools.js` → array `SAFE_COMMAND_PREFIXES` dan `DANGEROUS_PATTERNS`.

## Troubleshooting

**Bot tidak respon**: cek `pm2 logs telegram-ai-agent`. Pastikan token & API key benar.

**Error "AI_GATEWAY_API_KEY not set"**: tambahkan key di `.env` lalu `npm run pm2:restart`.

**Reminder tidak terkirim**: pastikan `bot.start()` jalan (bukan stopped). Reminder dicek setiap 30 detik.

**Token habis**: ganti model lebih murah di `.env`: `AI_MODEL=openai/gpt-5-mini` (default sudah pakai ini).

## Customization

- **Tambah tool baru**: edit `lib/tools.js`, daftarkan di return `buildTools`
- **Ganti prompt sistem**: edit `lib/agent.js` → `buildSystemPrompt()`
- **Ganti model**: set `AI_MODEL` di `.env` (lihat [Vercel AI Gateway models](https://vercel.com/docs/ai-gateway/models))
- **Pindah ke database**: ganti isi `lib/storage.js` dengan koneksi DB pilihan Anda
