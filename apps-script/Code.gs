// auto-doc: генерация договора из активной строки.
// Установка: Расширения → Apps Script → вставить этот файл.
// Шаблоны: загрузить templates/marked.docx и templates/unmarked.docx на Drive,
// открыть → «Сохранить как Google Doc», вписать их ID ниже.

const CONFIG = {
  templateMarkedId: "",
  templateUnmarkedId: "",
  driveFolderId: "",
  statusColumn: "Статус",
  urlColumn: "Ссылка на файл",
};

const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Договоры")
    .addItem("Сгенерировать для текущей строки", "generateForActiveRow")
    .addToUi();
}

function generateForActiveRow() {
  const ui = SpreadsheetApp.getUi();
  const sheet = SpreadsheetApp.getActiveSheet();
  const rowNumber = sheet.getActiveCell().getRow();
  if (rowNumber < 2) {
    ui.alert("Выберите строку с договором (не заголовок).");
    return;
  }

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map((h) => String(h).trim());
  const values = sheet.getRange(rowNumber, 1, 1, sheet.getLastColumn()).getValues()[0];
  const row = {};
  headers.forEach((h, i) => { row[h] = values[i]; });

  const errors = validateRow(row);
  if (errors.length) {
    setCell(sheet, headers, rowNumber, CONFIG.statusColumn, "Ошибка: " + errors.join("; "));
    ui.alert("Ошибка: " + errors.join("; "));
    return;
  }

  try {
    const data = templateData(row);
    const templateId = row["Маркировка"] === "Да" ? CONFIG.templateMarkedId : CONFIG.templateUnmarkedId;
    const copy = DriveApp.getFileById(templateId).makeCopy("tmp " + data.contractNumber);
    const doc = DocumentApp.openById(copy.getId());
    const body = doc.getBody();
    for (const [key, value] of Object.entries(data)) {
      body.replaceText("\\{" + key + "\\}", String(value).replace(/\$/g, "\\$"));
    }
    body.editAsText().setBackgroundColor(null);
    doc.saveAndClose();

    const folder = CONFIG.driveFolderId
      ? DriveApp.getFolderById(CONFIG.driveFolderId)
      : DriveApp.getFileById(templateId).getParents().next();
    const pdf = folder.createFile(copy.getAs("application/pdf")).setName("Договор " + data.contractNumber + ".pdf");
    pdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    DriveApp.getFileById(copy.getId()).setTrashed(true);

    setCell(sheet, headers, rowNumber, CONFIG.statusColumn, "Сгенерирован");
    setCell(sheet, headers, rowNumber, CONFIG.urlColumn, pdf.getUrl());
    ui.alert("Готово: " + pdf.getUrl());
  } catch (e) {
    setCell(sheet, headers, rowNumber, CONFIG.statusColumn, "Ошибка: " + e.message);
    ui.alert("Ошибка: " + e.message);
  }
}

function setCell(sheet, headers, rowNumber, header, value) {
  const col = headers.indexOf(header);
  if (col === -1) throw new Error("Колонка «" + header + "» не найдена");
  sheet.getRange(rowNumber, col + 1).setValue(value);
}

function validateRow(row) {
  const errors = [];
  const required = [
    "Маркировка", "Дата договора", "Номер", "Клиент (полное название)", "Канал",
    "Дата публикации", "Срок размещения (дней)", "Стоимость", "НДС",
    "Тип исполнителя", "Исполнитель (полное название)", "Исполнитель (кратко)", "ИНН исполнителя",
  ];
  if (row["Маркировка"] === "Да") {
    required.push("Проект", "Клиент (краткое название)", "ИНН клиента", "ОГРН клиента", "Кто передаёт данные в ОРД");
  }
  if (row["Тип исполнителя"] === "ИП") required.push("ОГРНИП исполнителя");

  for (const field of required) {
    if (!String(row[field] ?? "").trim()) errors.push("нет поля «" + field + "»");
  }

  const vat = String(row["НДС"] ?? "");
  const type = String(row["Тип исполнителя"] ?? "");
  if (type === "ИП" && vat === "НДС не облагается (НПД)") errors.push("ИП не может применять НПД");
  if (type === "Самозанятый" && vat !== "НДС не облагается (НПД)") errors.push("Самозанятый применяет только «НДС не облагается (НПД)»");

  for (const field of ["Дата договора", "Дата публикации", "Дата окончания размещения"]) {
    if (String(row[field] ?? "").trim() && !parseDate(row[field])) {
      errors.push("Некорректная дата в «" + field + "» (ожидается ДД.ММ.ГГГГ)");
    }
  }
  return errors;
}

function parseDate(value) {
  if (value instanceof Date) {
    value = Utilities.formatDate(value, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), "dd.MM.yyyy");
  }
  const match = String(value).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDate(date) {
  return pad2(date.getDate()) + "." + pad2(date.getMonth() + 1) + "." + date.getFullYear();
}

const ONES_M = ["","один","два","три","четыре","пять","шесть","семь","восемь","девять"];
const ONES_F = ["","одна","две","три","четыре","пять","шесть","семь","восемь","девять"];
const TEENS = ["десять","одиннадцать","двенадцать","тринадцать","четырнадцать","пятнадцать","шестнадцать","семнадцать","восемнадцать","девятнадцать"];
const TENS = ["","","двадцать","тридцать","сорок","пятьдесят","шестьдесят","семьдесят","восемьдесят","девяносто"];
const HUNDREDS = ["","сто","двести","триста","четыреста","пятьсот","шестьсот","семьсот","восемьсот","девятьсот"];

function plural(n, one, few, many) {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 19) return many;
  const mod10 = mod100 % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function tripleWords(n, feminine) {
  const parts = [];
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h) parts.push(HUNDREDS[h]);
  if (rest >= 10 && rest < 20) {
    parts.push(TEENS[rest - 10]);
  } else {
    if (Math.floor(rest / 10)) parts.push(TENS[Math.floor(rest / 10)]);
    if (rest % 10) parts.push((feminine ? ONES_F : ONES_M)[rest % 10]);
  }
  return parts.join(" ");
}

function sumToWords(amount) {
  if (amount === 0) return "Ноль";
  const parts = [];
  const millions = Math.floor(amount / 1000000);
  const thousands = Math.floor((amount % 1000000) / 1000);
  const units = amount % 1000;
  if (millions) parts.push(tripleWords(millions, false), plural(millions, "миллион", "миллиона", "миллионов"));
  if (thousands) parts.push(tripleWords(thousands, true), plural(thousands, "тысяча", "тысячи", "тысяч"));
  if (units) parts.push(tripleWords(units, false));
  const words = parts.filter(Boolean).join(" ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function templateData(row) {
  const contractDate = parseDate(row["Дата договора"]);
  const placementDate = parseDate(row["Дата публикации"]);
  const price = Number(String(row["Стоимость"]).replace(/[\s ]/g, "").replace(",", "."));
  if (!Number.isFinite(price)) throw new Error("Некорректная стоимость: «" + row["Стоимость"] + "»");

  const days = Number(row["Срок размещения (дней)"]);
  const endDate = parseDate(row["Дата окончания размещения"])
    || new Date(placementDate.getTime() + days * 86400000);

  const vat = String(row["НДС"] ?? "");
  const vatMatch = vat.match(/(\d+)\s*%/);
  const vatClause = vat.includes("НПД")
    ? "не облагается НДС в связи с применением Исполнителем налога на профессиональный доход (НПД) в соответствии с ФЗ № 422-ФЗ от 27.11.2018 г. Исполнитель обязуется предоставить Заказчику чек в день получения оплаты от Заказчика по Договору."
    : vatMatch
      ? "включает НДС по ставке " + vatMatch[1] + "%."
      : "не облагается НДС в связи с применением Исполнителем упрощенной системы налогообложения (согласно статье 346.11 НК РФ).";

  const isIp = row["Тип исполнителя"] === "ИП";
  const requisites = [
    row["Исполнитель (полное название)"],
    isIp ? "ОГРНИП: " + row["ОГРНИП исполнителя"] : "",
    "ИНН: " + row["ИНН исполнителя"],
    row["Адрес исполнителя"] ? "Юридический адрес: " + row["Адрес исполнителя"] : "",
    row["Расчётный счёт"] ? "Банковские реквизиты:" : "",
    row["Расчётный счёт"] ? "р/с " + row["Расчётный счёт"] : "",
    row["Расчётный счёт"] ? "в банке " + row["Банк исполнителя"] : "",
    row["Расчётный счёт"] ? "БИК " + row["БИК"] : "",
    row["Расчётный счёт"] ? "к/с " + row["Корр. счёт"] : "",
  ].filter(Boolean).join("\n");

  return {
    contractNumber: pad2(contractDate.getDate()) + pad2(contractDate.getMonth() + 1) + contractDate.getFullYear() + "-" + String(row["Номер"]).trim(),
    contractDateFormatted: formatDate(contractDate),
    contractDay: String(contractDate.getDate()),
    contractMonth: MONTHS[contractDate.getMonth()],
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
    price: price.toLocaleString("ru-RU"),
    priceWords: sumToWords(price),
    vat,
    vatPercent: vatMatch ? vatMatch[1] : "",
    vatClause,
    contractDateWords: "«" + contractDate.getDate() + "» " + MONTHS[contractDate.getMonth()] + " " + contractDate.getFullYear() + " г.",
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
    executorRequisites: requisites,
  };
}
