import { webhookCallback } from "grammy";
import { createBot } from "./bot";
import { config } from "./config";
import { generateForRow } from "./pipeline";

export async function startServer(): Promise<void> {
  const bot = createBot();

  await bot.api.setMyCommands([
    { command: "new", description: "Сформировать документ" },
    { command: "generate", description: "Перегенерировать PDF по номеру строки" },
    { command: "cancel", description: "Выйти из создания договора" },
    { command: "start", description: "Список команд и кнопка создания" },
  ]);
  const handleUpdate = config.publicUrl ? webhookCallback(bot, "std/http") : null;

  Bun.serve({
    hostname: "0.0.0.0",
    port: config.port,
    async fetch(req) {
      const url = new URL(req.url);

      if (url.pathname === "/health") {
        return Response.json({ ok: true });
      }

      if (url.pathname === "/generate" && req.method === "POST") {
        const body: unknown = await req.json().catch(() => null);
        if (!body || typeof body !== "object" || !("row" in body)) {
          return Response.json({ error: "Ожидается { row: number }" }, { status: 400 });
        }
        const row = Number(body.row);
        if (!Number.isInteger(row) || row < 2) {
          return Response.json({ error: "row должен быть целым числом >= 2" }, { status: 400 });
        }
        const result = await generateForRow(row);
        return "error" in result
          ? Response.json(result, { status: 422 })
          : Response.json(result);
      }

      if (url.pathname === "/telegram/webhook" && req.method === "POST" && handleUpdate) {
        return handleUpdate(req);
      }

      return new Response("Not found", { status: 404 });
    },
  });

  console.log(`HTTP server on :${config.port}`);

  if (config.publicUrl) {
    await bot.api.setWebhook(`${config.publicUrl}/telegram/webhook`);
    console.log(`Telegram bot: webhook ${config.publicUrl}/telegram/webhook`);
  }

  if (!config.publicUrl) {
    bot.start();
    console.log("Telegram bot: long polling");
  }
}
