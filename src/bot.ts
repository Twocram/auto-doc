import { Bot, InlineKeyboard, type Context } from "grammy";
import { config } from "./config";
import { requiredHeaders, type ContractRow } from "./contractData";
import { parseContractMessage } from "./parseMessage";
import { appendRow } from "./sheets";
import { generateForRow } from "./pipeline";

type Session = {
  stage: "awaitMessage" | "collecting" | "review" | "editing";
  row: ContractRow;
  missing: string[];
  step: number;
  editField: string;
};

const sessions = new Map<number, Session>();

const cancelKeyboard = new InlineKeyboard().text("❌ Отмена", "flow:cancel");

function preview(row: ContractRow): string {
  return Object.entries(row)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

function editableFields(row: ContractRow): string[] {
  return [...new Set([...requiredHeaders(row), ...Object.keys(row).filter((k) => row[k]?.trim())])];
}

function reviewKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text("✅ Сгенерировать", "review:generate")
    .text("✏️ Исправить", "review:edit")
    .row()
    .text("❌ Отмена", "flow:cancel");
}

async function showPreview(ctx: Context, session: Session): Promise<void> {
  session.stage = "review";
  await ctx.reply(`Проверьте данные перед генерацией:\n\n${preview(session.row)}`, {
    reply_markup: reviewKeyboard(),
  });
}

async function askNext(ctx: Context, session: Session): Promise<void> {
  if (session.step >= session.missing.length) {
    await showPreview(ctx, session);
    return;
  }
  await ctx.reply(`${session.missing[session.step]}:`, { reply_markup: cancelKeyboard });
}

async function runGeneration(ctx: Context, row: ContractRow): Promise<void> {
  await ctx.reply("Генерирую документ…");
  try {
    const rowNumber = await appendRow(row);
    const result = await generateForRow(rowNumber);
    if ("error" in result) {
      await ctx.reply(`Строка ${rowNumber} записана, но генерация не удалась: ${result.error}\n\nИсправьте данные в таблице и запустите /generate ${rowNumber}`);
    } else {
      await ctx.reply(`Готово: ${result.url}\n\nСтрока ${rowNumber} в таблице обновлена (статус «Сгенерирован», ссылка добавлена).`);
    }
  } catch (e) {
    await ctx.reply(`Ошибка записи в таблицу: ${(e as Error).message}`);
  }
}

export function createBot(): Bot {
  const bot = new Bot(config.telegramToken);

  bot.command("start", async (ctx) => {
    const keyboard = new InlineKeyboard().text("📄 Сформировать документ", "new");
    await ctx.reply(
      "Команды:\n/new — сформировать документ\n/generate <строка> — перегенерировать PDF по строке таблицы\n/cancel — выйти из создания договора",
      { reply_markup: keyboard },
    );
  });

  bot.command("new", (ctx) => startIntake(ctx));
  bot.callbackQuery("new", async (ctx) => {
    await ctx.answerCallbackQuery();
    await startIntake(ctx);
  });

  bot.command("cancel", async (ctx) => {
    sessions.delete(ctx.from!.id);
    await ctx.reply("Создание договора отменено. Чтобы начать заново — /new.");
  });

  bot.callbackQuery("flow:cancel", async (ctx) => {
    sessions.delete(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Создание договора отменено. Чтобы начать заново — /new.");
  });

  bot.command("generate", async (ctx) => {
    const rowNumber = Number(ctx.match);
    if (!Number.isInteger(rowNumber) || rowNumber < 2) {
      await ctx.reply("Укажите номер строки: /generate 2");
      return;
    }
    await ctx.reply(`Генерирую по строке ${rowNumber}…`);
    const result = await generateForRow(rowNumber);
    await ctx.reply("error" in result ? `Ошибка: ${result.error}` : `Готово: ${result.url}`);
  });

  bot.callbackQuery("review:generate", async (ctx) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery("Сессия истекла, начните заново: /new");
    sessions.delete(ctx.from.id);
    await ctx.answerCallbackQuery();
    await ctx.editMessageText("Данные подтверждены.");
    await runGeneration(ctx, session.row);
  });

  bot.callbackQuery("review:edit", async (ctx) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery("Сессия истекла, начните заново: /new");
    await ctx.answerCallbackQuery();
    const keyboard = editableFields(session.row).reduce(
      (kb, field, i) => kb.text(field, `edit:${i}`).row(),
      new InlineKeyboard(),
    );
    keyboard.text("« Назад к превью", "edit:back");
    await ctx.editMessageText("Какое поле исправить?", { reply_markup: keyboard });
  });

  bot.callbackQuery("edit:back", async (ctx) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery("Сессия истекла");
    await ctx.answerCallbackQuery();
    await showPreview(ctx, session);
  });

  bot.callbackQuery(/^edit:(\d+)$/, async (ctx) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery("Сессия истекла");
    const field = editableFields(session.row)[Number(ctx.match[1])];
    if (!field) return ctx.answerCallbackQuery("Поле не найдено");
    session.stage = "editing";
    session.editField = field;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`Текущее значение «${field}»:\n${session.row[field] ?? "—"}\n\nПришлите новое значение:`);
  });

  bot.on("message:text", async (ctx) => {
    const userId = ctx.from!.id;
    const text = ctx.message.text;
    const session = sessions.get(userId);

    if (!session) return;

    if (session.stage === "editing") {
      session.row[session.editField] = text.trim();
      await ctx.reply(`«${session.editField}» обновлено.`);
      await showPreview(ctx, session);
      return;
    }

    if (session.stage === "collecting" && session.step < session.missing.length) {
      const field = session.missing[session.step];
      session.row[field] = text.trim();
      session.step++;
      if (field === "Маркировка" || field === "Тип исполнителя") {
        const nowRequired = requiredHeaders(session.row).filter((h) => !session.row[h]?.trim() && !session.missing.includes(h));
        session.missing.push(...nowRequired);
      }
      await askNext(ctx, session);
      return;
    }

    if (session.stage === "awaitMessage") {
      const row = parseContractMessage(text);
      const coreFields = ["Тип исполнителя", "Исполнитель (полное название)", "Клиент (полное название)", "Канал", "Дата публикации", "Стоимость", "Проект"];
      const recognized = coreFields.filter((f) => row[f]?.trim()).length;
      if (recognized < 3) {
        await ctx.reply("Не удалось распознать данные договора в сообщении. Пришлите данные по подсказке из /new (формат, исполнитель, клиент, канал, дата, стоимость) или /cancel для выхода.", { reply_markup: cancelKeyboard });
        return;
      }
      session.row = row;
      session.missing = requiredHeaders(session.row).filter((h) => !session.row[h]?.trim());
      session.step = 0;
      session.stage = "collecting";
      if (session.missing.length > 0) {
        await ctx.reply(`Распознано ${recognized} ключевых полей. Не хватает: ${session.missing.join(", ")}. Ответьте по одному сообщению на каждое.`);
      }
      await askNext(ctx, session);
      return;
    }

    if (session.stage === "review") {
      await ctx.reply("Выберите действие кнопками под превью или /cancel для выхода.");
    }
  });

  return bot;
}

async function startIntake(ctx: Context): Promise<void> {
  sessions.set(ctx.from!.id, { stage: "awaitMessage", row: {}, missing: [], step: 0, editField: "" });
  await ctx.reply(
    "Пришлите данные договора одним сообщением в формате:\n\n" +
      "Формат - с маркировкой / без маркировки\n" +
      "Исполнитель: ИП / Самозанятый + ФИО и реквизиты\n" +
      "Проект\nДанные клиента\nПубликация в канале (ссылка и название)\n" +
      "Дата публикации\nСтоимость услуг\nНДС",
    { reply_markup: cancelKeyboard },
  );
}
