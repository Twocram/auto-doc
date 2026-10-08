import type { ContractRow } from "./contractData";

function digits(value: string): string {
  return value.replace(/\D/g, "");
}

function parsePrice(raw: string): string {
  const cleaned = raw.replace(/[₽\s]/g, "").replace(",", ".");
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) return cleaned.replace(/\./g, "");
  return cleaned;
}

function shortName(fullName: string): string {
  const words = fullName.trim().split(/\s+/);
  const nameWords = words.slice(-3);
  if (nameWords.length < 3) return fullName.trim();
  const [surname, first, middle] = nameWords;
  return `${surname} ${first[0]}.${middle[0]}.`;
}

function parsePlacementDate(raw: string): string {
  const match = raw.trim().match(/^(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
  if (!match) return raw.trim();
  const [, d, m, yRaw] = match;
  let year = yRaw ? Number(yRaw) : new Date().getFullYear();
  if (year < 100) year += 2000;
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${year}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function parseContractMessage(text: string): ContractRow {
  const normalized = text.replace(/ /g, " ").replace(/–/g, "-");
  const lines = normalized.split("\n").map((l) => l.trim().replace(/\s+/g, " "));
  const row: ContractRow = {};

  // ищет строку-метку «label» или «label: значение»; значение — инлайн или следующая непустая строка
  const valueFor = (label: string): string => {
    const pattern = new RegExp(`^${escapeRegex(label.toLowerCase())}\\s*(?::|$)\\s*(.*)$`, "i");
    const i = lines.findIndex((l) => pattern.test(l.toLowerCase()));
    if (i === -1) return "";
    const inline = lines[i].match(pattern)?.[1]?.trim() ?? "";
    if (inline) return inline;
    return lines.slice(i + 1).find((l) => l.length > 0) ?? "";
  };

  if (/формат\s*-\s*без маркировки/i.test(normalized)) row["Маркировка"] = "Нет";
  else if (/формат\s*-\s*с маркировкой/i.test(normalized)) row["Маркировка"] = "Да";

  const executorIdx = lines.findIndex((l) => /исполнитель\s*:\s*(ИП|Самозанятый)/i.test(l));
  if (executorIdx !== -1) {
    const line = lines[executorIdx];
    row["Тип исполнителя"] = /самозанятый/i.test(line) ? "Самозанятый" : "ИП";
    const inlineName = line.replace(/.*(ИП|Самозанятый)/i, "").trim();
    const nameLine = inlineName || lines.slice(executorIdx + 1).find((l) => l.length > 0) || "";
    row["Исполнитель (полное название)"] = nameLine;
    row["Исполнитель (кратко)"] = shortName(nameLine);
  }

  row["Расчётный счёт"] = digits(valueFor("Расчётный счёт"));
  row["Банк исполнителя"] = valueFor("Название банка").replace(/"([^"]*)"/, "«$1»");
  row["БИК"] = digits(valueFor("БИК"));
  row["Корр. счёт"] = digits(valueFor("Корр. счёт")) || digits(valueFor("Корреспондентский счёт"));
  row["ИНН исполнителя"] = digits(valueFor("ИНН"));
  row["ОГРНИП исполнителя"] = digits(valueFor("ОГРНИП"));
  row["Адрес исполнителя"] = valueFor("Юридический адрес");

  const project = normalized.match(/Проект\s*[-:]\s*(.+)/i);
  if (project) row["Проект"] = project[1].trim();

  const client = normalized.match(/Данные клиента\s*[-:]\s*(.+)/i);
  if (client) {
    const full = client[1].trim();
    row["Клиент (полное название)"] = full;
    row["Клиент (краткое название)"] = full
      .replace(/Общество с ограниченной ответственностью/i, "ООО")
      .replace(/Акционерное общество/i, "АО")
      .replace(/Индивидуальный предприниматель/i, "ИП");
  }

  const channelUrlIdx = lines.findIndex((l) => /t\.me\//i.test(l));
  if (channelUrlIdx !== -1) {
    const urlMatch = lines[channelUrlIdx].match(/(https?:\/\/t\.me\/\S+|t\.me\/\S+)/i);
    row["Ссылка на канал"] = urlMatch?.[1] ?? "";
    const isNameCandidate = (l: string) =>
      l.length > 0
      && !/t\.me\//i.test(l)
      && !/^(формат|исполнитель|расчётный счёт|название банка|бик|корр|инн|огрнип|окпо|октмо|юридический адрес|оквэд|дата|стоимость|принимаем|проект|данные клиента|публикация)/i.test(l)
      && !/\s-\s/.test(l);
    row["Канал"] =
      lines.slice(channelUrlIdx + 1, channelUrlIdx + 3).find(isNameCandidate)
      ?? [...lines.slice(Math.max(0, channelUrlIdx - 3), channelUrlIdx)].reverse().find(isNameCandidate)
      ?? "";
  }

  const placementDate = normalized.match(/Дата публикации\s*[-:]?\s*(\d{1,2}\.\d{1,2}(?:\.\d{2,4})?)/i);
  if (placementDate) row["Дата публикации"] = parsePlacementDate(placementDate[1]);
  const priceRaw = valueFor("Стоимость услуг");
  if (priceRaw) row["Стоимость"] = parsePrice(priceRaw);

  if (/НДС не облагается/i.test(normalized)) {
    row["НДС"] = row["Тип исполнителя"] === "Самозанятый"
      ? "НДС не облагается (НПД)"
      : "НДС не облагается (УСН)";
  }

  const today = new Date();
  row["Дата договора"] = [
    String(today.getDate()).padStart(2, "0"),
    String(today.getMonth() + 1).padStart(2, "0"),
    today.getFullYear(),
  ].join(".");
  row["Срок размещения (дней)"] = "30";
  row["Кто передаёт данные в ОРД"] = "Заказчик";
  row["Статус"] = "Черновик";

  return row;
}
