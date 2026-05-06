import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Bot, Server, Shield, Terminal, Search, Bell } from "lucide-react"

export default function Page() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-12 md:py-16">
        <header className="mb-12 flex flex-col items-start gap-4">
          <Badge variant="secondary" className="font-mono text-xs">
            bot/ folder siap deploy
          </Badge>
          <h1 className="text-balance text-4xl font-bold tracking-tight md:text-5xl">
            Telegram AI Agent untuk VPS
          </h1>
          <p className="text-pretty text-lg leading-relaxed text-muted-foreground">
            Asisten AI pribadi yang berjalan 24/7 di VPS Anda, terhubung ke Telegram. Dibangun dengan Vercel AI SDK 6 +
            grammy + PM2.
          </p>
        </header>

        <section className="mb-12 grid gap-4 md:grid-cols-2">
          <FeatureCard
            icon={<Bot className="h-5 w-5" />}
            title="AI Chat"
            desc="Tanya jawab, ringkas, terjemah - via Vercel AI Gateway"
          />
          <FeatureCard
            icon={<Search className="h-5 w-5" />}
            title="Web Search"
            desc="Cari info terkini di internet + scrape halaman"
          />
          <FeatureCard
            icon={<Bell className="h-5 w-5" />}
            title="Reminders"
            desc="Set pengingat, notifikasi otomatis ke Telegram"
          />
          <FeatureCard
            icon={<Terminal className="h-5 w-5" />}
            title="VPS Commands"
            desc="Eksekusi command monitoring (whitelist + filter aman)"
          />
          <FeatureCard
            icon={<Shield className="h-5 w-5" />}
            title="Whitelist User"
            desc="Hanya Telegram ID Anda yang bisa pakai bot"
          />
          <FeatureCard
            icon={<Server className="h-5 w-5" />}
            title="PM2 Ready"
            desc="Auto-restart, log management, startup-on-boot"
          />
        </section>

        <section className="mb-12">
          <h2 className="mb-6 text-2xl font-bold tracking-tight">Cara Install di VPS</h2>
          <div className="space-y-4">
            <Step
              n={1}
              title="Persiapan"
              code={`# Di VPS, install Node.js 20+ dan PM2
sudo apt install nodejs npm
npm install -g pm2`}
            />
            <Step
              n={2}
              title="Dapatkan Token & ID"
              desc="Chat @BotFather → /newbot → simpan token. Chat @userinfobot → catat User ID Anda. Lalu dapatkan AI_GATEWAY_API_KEY dari Vercel Dashboard."
            />
            <Step
              n={3}
              title="Upload folder bot/ ke VPS"
              code={`scp -r bot user@vps-ip:/home/user/
# atau git clone repo Anda`}
            />
            <Step
              n={4}
              title="Install dependencies"
              code={`cd bot
npm install`}
            />
            <Step
              n={5}
              title="Konfigurasi"
              code={`cp .env.example .env
nano .env
# Isi: TELEGRAM_BOT_TOKEN, AI_GATEWAY_API_KEY, ALLOWED_TELEGRAM_IDS`}
            />
            <Step
              n={6}
              title="Test manual"
              code={`npm start
# Coba chat bot di Telegram. Ctrl+C untuk stop.`}
            />
            <Step
              n={7}
              title="Jalankan dengan PM2"
              code={`mkdir -p logs
npm run pm2:start
pm2 save
pm2 startup
# Bot sekarang berjalan 24/7, auto-restart jika crash`}
            />
          </div>
        </section>

        <section className="mb-12">
          <h2 className="mb-4 text-2xl font-bold tracking-tight">Contoh Penggunaan</h2>
          <div className="space-y-2 rounded-lg border bg-card p-6 font-mono text-sm">
            <ChatLine you="Cek disk usage VPS dong" />
            <ChatLine bot="Saya jalankan `df -h`...&#10;Filesystem 50G, used 12G (24%)" />
            <ChatLine you="Ingatkan saya meeting besok jam 9 pagi" />
            <ChatLine bot="Pengingat 'Meeting' tersimpan untuk besok 09:00 WIB." />
            <ChatLine you="Berita AI terbaru hari ini?" />
            <ChatLine bot="[search → fetch → summary]" />
            <ChatLine you="Status pm2?" />
            <ChatLine bot="online: telegram-ai-agent (uptime 2h)" />
          </div>
        </section>

        <section className="mb-12 rounded-lg border border-destructive/30 bg-destructive/5 p-6">
          <h2 className="mb-2 flex items-center gap-2 text-lg font-bold">
            <Shield className="h-5 w-5" />
            Catatan Keamanan
          </h2>
          <ul className="space-y-2 text-sm leading-relaxed text-muted-foreground">
            <li>
              <strong className="text-foreground">Whitelist command shell</strong> di{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">bot/lib/tools.js</code> - hanya command
              monitoring yang diizinkan.
            </li>
            <li>
              <strong className="text-foreground">Pattern berbahaya diblokir</strong>: rm -rf, shutdown, mkfs, passwd,
              fork bomb, dll.
            </li>
            <li>
              <strong className="text-foreground">Whitelist user</strong>: hanya Telegram ID di{" "}
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">ALLOWED_TELEGRAM_IDS</code> yang bisa kirim
              pesan.
            </li>
            <li>
              <strong className="text-foreground">Sesuaikan whitelist</strong> sesuai kebutuhan Anda - tambah command
              custom atau hapus yang tidak perlu.
            </li>
          </ul>
        </section>

        <footer className="border-t pt-6 text-sm text-muted-foreground">
          Lihat <code className="rounded bg-muted px-1.5 py-0.5 text-xs">bot/README.md</code> untuk dokumentasi
          lengkap, troubleshooting, dan customization.
        </footer>
      </div>
    </main>
  )
}

function FeatureCard({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-primary/10 p-2 text-primary">{icon}</div>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="leading-relaxed">{desc}</CardDescription>
      </CardContent>
    </Card>
  )
}

function Step({ n, title, desc, code }: { n: number; title: string; desc?: string; code?: string }) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
        {n}
      </div>
      <div className="flex-1 pt-0.5">
        <h3 className="mb-2 font-semibold">{title}</h3>
        {desc && <p className="mb-2 text-sm leading-relaxed text-muted-foreground">{desc}</p>}
        {code && (
          <pre className="overflow-x-auto rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed">
            <code>{code}</code>
          </pre>
        )}
      </div>
    </div>
  )
}

function ChatLine({ you, bot }: { you?: string; bot?: string }) {
  if (you) {
    return (
      <div className="flex gap-2">
        <span className="shrink-0 text-muted-foreground">you:</span>
        <span>{you}</span>
      </div>
    )
  }
  return (
    <div className="flex gap-2 pb-2">
      <span className="shrink-0 text-primary">bot:</span>
      <span className="text-muted-foreground">{bot}</span>
    </div>
  )
}
