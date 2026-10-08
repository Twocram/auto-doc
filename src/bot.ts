import { Bot, InlineKeyboard, type Context } from "grammy";

import { config } from "./config";
import { requiredHeaders, type ContractRow } from "./contractData";
import { parseContractMessage } from "./parseMessage";
import { appendRow } from "./sheets";
import { generateForRow } from "./pipeline";
import { lookupParties, type PartyInfo } from "./companyLookup";
type Session = {
  stage: "awaitMessage" | "collecting" | "review" | "editing";
  row: ContractRow;
  missing: string[];
  step: number;
  editField: string;
  candidates: PartyInfo[];
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
  const field = session.missing[session.step];
  if (field === "Дата договора") {
    const keyboard = new InlineKeyboard()
      .text(`Оставить ${session.row["Дата договора"]} (Мск)`, "datekeep")
      .row()
      .text("❌ Отмена", "flow:cancel");
    await ctx.reply(`Дата договора: сейчас ${session.row["Дата договора"]}. Пришлите другую в формате ДД.ММ.ГГГГ или подтвердите:`, { reply_markup: keyboard });
    return;
  }
  await ctx.reply(`${field}:`, { reply_markup: cancelKeyboard });
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

  bot.callbackQuery(/^pick:(\d+)$/, async (ctx) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery("Сессия истекла, начните заново: /new");
    const party = session.candidates[Number(ctx.match[1])];
    if (!party) return ctx.answerCallbackQuery("Вариант не найден");
    session.row["ИНН клиента"] = party.inn;
    session.row["ОГРН клиента"] = party.ogrn;
    session.missing = session.missing.filter((h) => h !== "ИНН клиента" && h !== "ОГРН клиента");
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`Выбрано: ${party.name}\nИНН ${party.inn}, ОГРН ${party.ogrn}`);
    await askNext(ctx, session);
  });

  bot.callbackQuery("datekeep", async (ctx) => {
    const session = sessions.get(ctx.from.id);
    if (!session) return ctx.answerCallbackQuery("Сессия истекла, начните заново: /new");
    session.step++;
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`Дата договора: ${session.row["Дата договора"]}`);
    await askNext(ctx, session);
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
      if (/^Дата/.test(field) && !/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(text.trim())) {
        await ctx.reply("Некорректная дата. Формат: ДД.ММ.ГГГГ (например, 12.10.2026). Попробуйте ещё раз:", { reply_markup: cancelKeyboard });
        return;
      }
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
      session.missing = ["Дата договора", ...requiredHeaders(session.row).filter((h) => h !== "Дата договора" && !session.row[h]?.trim())];
      session.step = 0;
      session.stage = "collecting";

      const needsClientLookup = session.missing.some((h) => h === "ИНН клиента" || h === "ОГРН клиента");
      if (needsClientLookup && row["Клиент (краткое название)"]) {
        await ctx.reply("Ищу ИНН/ОГРН клиента в ЕГРЮЛ…");
        session.candidates = await lookupParties(row["Клиент (краткое название)"]);
        if (session.candidates.length === 1) {
          const found = session.candidates[0];
          session.row["ИНН клиента"] = found.inn;
          session.row["ОГРН клиента"] = found.ogrn;
          session.missing = session.missing.filter((h) => h !== "ИНН клиента" && h !== "ОГРН клиента");
          await ctx.reply(`Нашёл: ${found.name}\nИНН ${found.inn}, ОГРН ${found.ogrn} — проверьте в превью.`);
        } else if (session.candidates.length > 1) {
          const keyboard = session.candidates.reduce(
            (kb, party, i) => kb.text(`${party.inn} — ${party.name.slice(0, 40)}`, `pick:${i}`).row(),
            new InlineKeyboard(),
          );
          await ctx.reply("Нашлось несколько компаний — выберите нужную:", { reply_markup: keyboard });
        }
      }

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
  sessions.set(ctx.from!.id, { stage: "awaitMessage", row: {}, missing: [], step: 0, editField: "", candidates: [] });
  await ctx.reply(
    "Пришлите данные договора одним сообщением в формате:\n\n" +
      "Формат - с маркировкой / без маркировки\n" +
      "Исполнитель: ИП / Самозанятый + ФИО и реквизиты\n" +
      "Проект\nДанные клиента\nПубликация в канале (ссылка и название)\n" +
      "Дата публикации\nСтоимость услуг\nНДС",
    { reply_markup: cancelKeyboard },
  );
}
