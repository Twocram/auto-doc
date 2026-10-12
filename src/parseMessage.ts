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
  const match = raw.trim().match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
  if (!match) return raw.trim();
  const [, d, m, yRaw] = match;
  let year = yRaw ? Number(yRaw) : new Date().getFullYear();
  if (year < 100) year += 2000;
  return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${year}`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const KNOWN_LABEL = /^(формат|проект|данные|кто принимает|ндс|налогообложение|исполнитель|инн|огрнип|адрес|юридический адрес|расч[её]тный сч[её]т|номер сч[её]та|банк|бик|корр|контакты|тел|электронная почта|e-mail|email|публикация|дата|сумма|стоимость)/i;

export function parseContractMessage(text: string): ContractRow {
  const normalized = text.replace(/ /g, " ").replace(/–/g, "-");
  const lines = normalized.split("\n").map((l) => l.trim().replace(/\s+/g, " "));
  const row: ContractRow = {};

  // строгая метка: значение после : / - / $, либо через пробел если значение начинается с цифры или «+»
  const valueStrict = (label: string): { value: string; lineIdx: number } => {
    const pattern = new RegExp(`^${escapeRegex(label.toLowerCase())}\\s*(?:(?::|-|—)\\s*|\\s+(?=[\\d+])|$)\\s*(.*)$`, "i");
    const i = lines.findIndex((l) => pattern.test(l.toLowerCase()));
    if (i === -1) return { value: "", lineIdx: -1 };
    const inline = lines[i].match(pattern)?.[1]?.trim() ?? "";
    return { value: inline || lines.slice(i + 1).find((l) => l.length > 0) || "", lineIdx: i };
  };

  // свободная метка: значение может идти через пробел с буквы (для меток, не конфликтующих с другими)
  const valueLoose = (label: string): { value: string; lineIdx: number } => {
    const pattern = new RegExp(`^${escapeRegex(label.toLowerCase())}\\s*(?:(?::|-|—)\\s*|\\s+|$)\\s*(.*)$`, "i");
    const i = lines.findIndex((l) => pattern.test(l.toLowerCase()));
    if (i === -1) return { value: "", lineIdx: -1 };
    const inline = lines[i].match(pattern)?.[1]?.trim() ?? "";
    return { value: inline || lines.slice(i + 1).find((l) => l.length > 0) || "", lineIdx: i };
  };

  const valueFor = (...labels: string[]): string =>
    labels.map((l) => valueStrict(l).value).find((v) => v) ?? "";

  const formatLine = lines.find((l) => /формат\s*-/i.test(l)) ?? "";
  if (/без маркировки/i.test(formatLine)) row["Маркировка"] = "Нет";
  else if (/с маркировкой/i.test(formatLine)) row["Маркировка"] = "Да";

  const executorIdx = lines.findIndex((l) => /исполнитель\s*[-:]/i.test(l));
  if (executorIdx !== -1) {
    const afterExecutor = lines.slice(executorIdx + 1).find((l) => l.length > 0) ?? "";
    const typeSource = `${lines[executorIdx]}\n${afterExecutor}`;
    if (/(?:^|\s)(СЗ|Самозанят\w*)(?:\s|$)/i.test(typeSource)) row["Тип исполнителя"] = "Самозанятый";
    else if (/(?:^|\s)ИП(?:\s|$)/i.test(typeSource)) row["Тип исполнителя"] = "ИП";
    const hasTypeInline = /(?:^|\s)(ИП|СЗ|Самозанят\w*)(?:\s|$)/i.test(lines[executorIdx]);
    const inlineName = hasTypeInline
      ? lines[executorIdx].replace(/.*(?:^|\s)(ИП|СЗ|Самозанят\w*)(?:\s+|$)/i, "").trim()
      : "";
    let nameLine = inlineName || afterExecutor;
    if (nameLine && row["Тип исполнителя"] === "ИП" && !/^(ИП|Индивидуальный предприниматель)\s/i.test(nameLine)) {
      nameLine = `ИП ${nameLine}`;
    }
    if (nameLine && row["Тип исполнителя"] === "Самозанятый") {
      nameLine = nameLine.replace(/^(СЗ|Самозанят\w*)\s+/i, "");
    }
    if (nameLine) {
      row["Исполнитель (полное название)"] = nameLine;
      row["Исполнитель (кратко)"] = shortName(nameLine);
    }
  }

  // адрес может занимать несколько строк: продолжаем, пока не встретится метка или пустая строка
  const extractAddress = (): string => {
    const labelPatterns = [/^юридический адрес\s*(?::|-|—)?\s*(.*)$/i, /^адрес\s+(.+)$/i, /^адрес\s*(?::|-|—)\s*(.*)$/i, /^данные исполнителя\s*[-:]?\s*(.*)$/i];
    let startIdx = -1;
    let value = "";
    for (const pattern of labelPatterns) {
      startIdx = lines.findIndex((l) => pattern.test(l));
      if (startIdx !== -1) {
        value = lines[startIdx].match(pattern)?.[1]?.trim() ?? "";
        break;
      }
    }
    if (startIdx === -1) return "";
    if (!value) {
      const next = lines.slice(startIdx + 1).find((l) => l.length > 0) ?? "";
      value = next;
      startIdx = lines.indexOf(next, startIdx + 1);
    }
    const parts = [value];
    for (let i = startIdx + 1; i < lines.length; i++) {
      const l = lines[i];
      if (!l || KNOWN_LABEL.test(l)) break;
      parts.push(l);
    }
    const joined = parts.join(", ").replace(/,\s*,/g, ",").replace(/,\s*$/, "").trim();
    return /^(инн|огрнип|тел|e-mail|банк|бик|р\/с|к\/с)/i.test(joined) || /^[\d\s]+$/.test(joined) ? "" : joined;
  };

  row["Расчётный счёт"] = digits(valueFor("Расчётный счёт", "Расчетный счет", "Номер счета", "Номер счёта", "р/с"));
  row["Банк исполнителя"] = (valueFor("Название банка") || valueLoose("Банк").value).replace(/"([^"]*)"/, "«$1»");
  row["БИК"] = digits(valueFor("БИК"));
  row["Корр. счёт"] = digits(valueFor("Корр. счёт", "Корр. счет", "Корреспондентский счёт", "Корреспондентский счет", "к/с"));
  row["ИНН исполнителя"] = digits(valueFor("ИНН"));
  row["ОГРНИП исполнителя"] = digits(valueFor("ОГРНИП"));
  row["Адрес исполнителя"] = extractAddress();

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

  const ordLine = lines.find((l) => /обязанность.*ОРД/i.test(l));
  if (ordLine) {
    const ordValue = ordLine.replace(/.*ОРД\s*[-:]?\s*/i, "").trim();
    row["Кто передаёт данные в ОРД"] = /мы|исполнитель/i.test(ordValue) ? "Исполнитель" : "Заказчик";
  }

  const channelUrlIdx = lines.findIndex((l) => /t\.me\//i.test(l));
  if (channelUrlIdx !== -1) {
    const urlMatch = lines[channelUrlIdx].match(/(https?:\/\/t\.me\/\S+|t\.me\/\S+)/i);
    row["Ссылка на канал"] = urlMatch?.[1] ?? "";
    const isNameCandidate = (l: string) =>
      l.length > 0
      && !/t\.me\//i.test(l)
      && !/^(формат|исполнитель|расчётный счёт|расчетный счет|номер сч|название банка|банк|бик|корр|инн|огрнип|окпо|октмо|юридический адрес|адрес|оквэд|дата|стоимость|сумма|принимаем|проект|данные клиента|публикация|ндс|налогообложение|кто принимает|контакты|тел|электронная почта)/i.test(l)
      && !/\s-\s/.test(l);
    const sameLine = lines[channelUrlIdx]
      .replace(/(https?:\/\/t\.me\/\S+|t\.me\/\S+)/i, "")
      .replace(/публикация в канале/i, "")
      .replace(/^[-–—:\s]+/, "")
      .trim();
    row["Канал"] =
      (isNameCandidate(sameLine) ? sameLine : "")
      || lines.slice(channelUrlIdx + 1, channelUrlIdx + 3).find(isNameCandidate)
      || [...lines.slice(Math.max(0, channelUrlIdx - 3), channelUrlIdx)].reverse().find(isNameCandidate)
      || "";
  }

  const placementDate = normalized.match(/Дата публикации\s*[-:]?\s*(?:до\s*)?(\d{1,2}[./]\d{1,2}(?:[./]\d{2,4})?)/i);
  if (placementDate) row["Дата публикации"] = parsePlacementDate(placementDate[1]);
  const priceRaw = valueFor("Стоимость услуг", "Сумма");
  if (priceRaw) row["Стоимость"] = parsePrice(priceRaw);

  const labeledEmail = valueFor("e-mail", "email", "Почта") || valueLoose("Электронная почта").value;
  if (labeledEmail) row["E-mail исполнителя"] = labeledEmail;
  const emailLine = lines.find((l) => /^[\w.+-]+@[\w-]+\.[\w.]+$/.test(l));
  if (emailLine && !row["E-mail исполнителя"]) row["E-mail исполнителя"] = emailLine;

  const labeledPhone = valueFor("Тел.", "Телефон") || valueLoose("Телефон").value;
  if (labeledPhone) row["Телефон исполнителя"] = labeledPhone;
  const phoneLine = lines.find((l) => /^\+\d[\d\s()-]{9,}$/.test(l));
  if (phoneLine && !row["Телефон исполнителя"]) row["Телефон исполнителя"] = phoneLine;

  if (!row["Адрес исполнителя"]) {
    const addressLine = lines.find((l) =>
      !/:$/.test(l) && !/банк|инн|огрнип|тел|e-mail/i.test(l)
      && (/^\d{6},\s/.test(l) || /(^|\s)(ул\.?|улица|пр-т|проспект|пер\.?|переулок|ш\.?|наб\.?)/i.test(l)));
    if (addressLine) row["Адрес исполнителя"] = addressLine;
  }

  const vatPercentMatch = normalized.match(/облагается НДС[,\s]*(?:по ставке\s*)?(\d+)\s*%/i);
  const ndsValue = valueFor("НДС", "Налогообложение");
  if (vatPercentMatch) {
    row["НДС"] = `Включая НДС ${vatPercentMatch[1]}%`;
  } else if (/облагается НДС/i.test(normalized) && !/не облагается/i.test(normalized)) {
    row["НДС"] = "Включая НДС";
  } else if (/НДС не облагается|без НДС|^нет$/i.test(ndsValue || normalized) || row["Тип исполнителя"]) {
    row["НДС"] = row["Тип исполнителя"] === "Самозанятый"
      ? "НДС не облагается (НПД)"
      : "НДС не облагается (УСН)";
  }

  row["Дата договора"] = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
  row["Срок размещения (дней)"] = "30";
  row["Кто передаёт данные в ОРД"] = row["Кто передаёт данные в ОРД"] || "Заказчик";
  row["Статус"] = "Черновик";

  return row;
}
