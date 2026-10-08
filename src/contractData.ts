export type ContractRow = Record<string, string>;

export const headers = [
  "Маркировка", "Дата договора", "Номер", "Проект",
  "Клиент (полное название)", "Клиент (краткое название)", "ИНН клиента", "ОГРН клиента",
  "Канал", "Ссылка на канал",
  "Дата публикации", "Дата окончания размещения", "Срок размещения (дней)",
  "Стоимость", "НДС", "Кто передаёт данные в ОРД",
  "Тип исполнителя", "Исполнитель (полное название)", "Исполнитель (кратко)",
  "ИНН исполнителя", "ОГРНИП исполнителя", "Адрес исполнителя",
  "Банк исполнителя", "Расчётный счёт", "Корр. счёт", "БИК",
  "E-mail исполнителя", "Мессенджер исполнителя", "Телефон исполнителя",
  "Статус", "Ссылка на файл",
] as const;

const monthNames = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

export function parseDate(value: string): Date {
  const match = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/);
  if (!match) throw new Error(`Некорректная дата: "${value}" (ожидается ДД.ММ.ГГГГ)`);
  const [, d, m, y] = match;
  return new Date(Number(y), Number(m) - 1, Number(d));
}

export function formatDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getFullYear()}`;
}

function formatDateWords(date: Date): string {
  return `«${date.getDate()}» ${monthNames[date.getMonth()]} ${date.getFullYear()} г.`;
}

function compactDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}${mm}${date.getFullYear()}`;
}

const onesM = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const onesF = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const teens = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const tens = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const hundreds = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function plural(n: number, forms: [string, string, string]): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return forms[2];
  const mod10 = mod100 % 10;
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function tripleToWords(n: number, feminine: boolean): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(hundreds[h]);
  if (rest >= 10 && rest < 20) {
    parts.push(teens[rest - 10]);
  } else {
    const t = Math.floor(rest / 10);
    const o = rest % 10;
    if (t) parts.push(tens[t]);
    if (o) parts.push((feminine ? onesF : onesM)[o]);
  }
  return parts.join(" ");
}

export function sumToWords(amount: number): string {
  if (!Number.isInteger(amount) || amount < 0) throw new Error(`Сумма должна быть целым неотрицательным числом: ${amount}`);
  if (amount === 0) return "Ноль";
  const groups: [number, boolean, [string, string, string]][] = [
    [1_000_000, false, ["миллион", "миллиона", "миллионов"]],
    [1_000, true, ["тысяча", "тысячи", "тысяч"]],
    [1, false, ["", "", ""]],
  ];
  const parts: string[] = [];
  let rest = amount;
  for (const [divisor, feminine, forms] of groups) {
    const value = Math.floor(rest / divisor);
    rest %= divisor;
    if (!value) continue;
    parts.push(tripleToWords(value, feminine));
    if (forms[0]) parts.push(plural(value, forms));
  }
  const words = parts.filter(Boolean).join(" ");
  return words[0].toUpperCase() + words.slice(1);
}

export function requiredHeaders(row: ContractRow): string[] {
  const base = [
    "Маркировка", "Дата договора", "Номер", "Клиент (полное название)", "Канал",
    "Дата публикации", "Срок размещения (дней)", "Стоимость", "НДС",
    "Тип исполнителя", "Исполнитель (полное название)", "Исполнитель (кратко)", "ИНН исполнителя",
  ];
  if (row["Маркировка"] === "Да") {
    base.push("Проект", "Клиент (краткое название)", "ИНН клиента", "ОГРН клиента", "Кто передаёт данные в ОРД");
  }
  if (row["Тип исполнителя"] === "ИП") {
    base.push("ОГРНИП исполнителя");
  }
  return base;
}

export function validateRow(row: ContractRow): string[] {
  const errors: string[] = [];
  for (const header of requiredHeaders(row)) {
    if (!row[header]?.trim()) errors.push(`нет поля «${header}»`);
  }
  const vat = row["НДС"] ?? "";
  const isIp = row["Тип исполнителя"] === "ИП";
  if (isIp && vat === "НДС не облагается (НПД)") errors.push("ИП не может применять НПД");
  if (!isIp && row["Тип исполнителя"] && vat !== "НДС не облагается (НПД)") {
    errors.push("Самозанятый применяет только «НДС не облагается (НПД)»");
  }
  for (const field of ["Дата договора", "Дата публикации", "Дата окончания размещения"]) {
    if (row[field]?.trim()) {
      try {
        parseDate(row[field]);
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
  }
  return errors;
}

export function templateData(row: ContractRow): Record<string, string> {
  const contractDate = parseDate(row["Дата договора"]);
  const placementDate = parseDate(row["Дата публикации"]);
  const price = Number(String(row["Стоимость"]).replace(/[\s ]/g, "").replace(",", "."));
  if (!Number.isFinite(price)) throw new Error(`Некорректная стоимость: "${row["Стоимость"]}"`);

  const days = Number(row["Срок размещения (дней)"]);
  const endDate = row["Дата окончания размещения"]?.trim()
    ? parseDate(row["Дата окончания размещения"])
    : new Date(placementDate.getTime() + days * 86_400_000);

  const vat = row["НДС"] ?? "";
  const vatMatch = vat.match(/(\d+)\s*%/);
  const vatClause = vat.includes("НПД")
    ? "не облагается НДС в связи с применением Исполнителем налога на профессиональный доход (НПД) в соответствии с ФЗ № 422-ФЗ от 27.11.2018 г. Исполнитель обязуется предоставить Заказчику чек в день получения оплаты от Заказчика по Договору."
    : vatMatch
      ? `включает НДС по ставке ${vatMatch[1]}%.`
      : "не облагается НДС в связи с применением Исполнителем упрощенной системы налогообложения (согласно статье 346.11 НК РФ).";

  const isIp = row["Тип исполнителя"] === "ИП";
  const requisitesLines = [
    row["Исполнитель (полное название)"] ?? "",
    isIp ? `ОГРНИП: ${row["ОГРНИП исполнителя"] ?? ""}` : "",
    `ИНН: ${row["ИНН исполнителя"] ?? ""}`,
    row["Адрес исполнителя"] ? `Юридический адрес: ${row["Адрес исполнителя"]}` : "",
    row["Расчётный счёт"]
      ? `Банковские реквизиты: р/с ${row["Расчётный счёт"]} в банке ${row["Банк исполнителя"]} БИК ${row["БИК"]} к/с ${row["Корр. счёт"]}`
      : "",
  ].filter(Boolean);

  const contractNumber = `${compactDate(contractDate)}-${row["Номер"].trim()}`;

  return {
    contractNumber,
    contractDateWords: formatDateWords(contractDate),
    contractDateFormatted: formatDate(contractDate),
    contractDay: String(contractDate.getDate()),
    contractMonth: monthNames[contractDate.getMonth()],
    project: row["Проект"] ?? "",
    clientFull: row["Клиент (полное название)"] ?? "",
    clientShort: row["Клиент (краткое название)"] ?? "",
    clientInn: row["ИНН клиента"] ?? "",
    clientOgrn: row["ОГРН клиента"] ?? "",
    channelName: row["Канал"] ?? "",
    channelUrl: row["Ссылка на канал"] ?? "",
    placementDate: formatDate(placementDate),
    placementEndDate: formatDate(endDate),
    placementDays: String(days),
    placementPeriod: `с ${formatDate(placementDate)} по ${formatDate(endDate)} / ${days} дней`,
    price: price.toLocaleString("ru-RU"),
    priceWords: sumToWords(price),
    vat,
    vatPercent: vatMatch ? vatMatch[1] : "",
    vatClause,
    ordParty: row["Кто передаёт данные в ОРД"] ?? "",
    executorFullName: row["Исполнитель (полное название)"] ?? "",
    executorShort: row["Исполнитель (кратко)"] ?? "",
    executorInn: row["ИНН исполнителя"] ?? "",
    executorOgrnip: row["ОГРНИП исполнителя"] ?? "",
    executorAddress: row["Адрес исполнителя"] ?? "",
    executorBankName: row["Банк исполнителя"] ?? "",
    executorAccount: row["Расчётный счёт"] ?? "",
    executorCorrAccount: row["Корр. счёт"] ?? "",
    executorBik: row["БИК"] ?? "",
    executorEmail: row["E-mail исполнителя"] ?? "",
    executorMessenger: row["Мессенджер исполнителя"] ?? "",
    executorPhone: row["Телефон исполнителя"] ?? "",
    executorRequisites: requisitesLines.join(". ") + ".",
  };
}

