// Scheduler untuk mengecek reminder dan kirim notifikasi ke Telegram
import cron from "node-cron"
import { getTasks, updateTask } from "./storage.js"

/**
 * Setup scheduler. Cek setiap 30 detik apakah ada reminder yang sudah jatuh tempo.
 */
export function startScheduler(bot) {
  // Setiap 30 detik
  cron.schedule("*/30 * * * * *", async () => {
    try {
      const tasks = await getTasks()
      const now = Date.now()

      for (const task of tasks) {
        if (task.done || task.notified || !task.remindAt) continue
        const remindTime = new Date(task.remindAt).getTime()
        if (isNaN(remindTime)) continue

        if (remindTime <= now) {
          // Kirim notifikasi
          const text = [
            "*Pengingat*",
            `*${task.title}*`,
            task.notes ? `_${task.notes}_` : null,
            `\nID: \`${task.id}\``,
          ]
            .filter(Boolean)
            .join("\n")

          try {
            await bot.api.sendMessage(task.chatId, text, { parse_mode: "Markdown" })
            await updateTask(task.id, { notified: true })
            console.log(`[scheduler] Sent reminder ${task.id} to chat ${task.chatId}`)
          } catch (err) {
            console.error(`[scheduler] Failed to send reminder ${task.id}:`, err.message)
          }
        }
      }
    } catch (err) {
      console.error("[scheduler] Error:", err.message)
    }
  })

  console.log("[scheduler] Started - checking reminders every 30s")
}
