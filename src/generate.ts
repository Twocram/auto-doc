import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { readFileSync, writeFileSync } from "node:fs";
import { templateData, validateRow, type ContractRow } from "./contractData";

export function renderDocx(templatePath: string, row: ContractRow): Buffer {
  const errors = validateRow(row);
  if (errors.length) throw new Error(`Ошибка: ${errors.join("; ")}`);

  const zip = new PizZip(readFileSync(templatePath));
  const doc = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true });
  doc.render(templateData(row));
  const outZip = doc.getZip();
  const xml = outZip.file("word/document.xml")!.asText().replace(/<w:highlight[^/]*\/>/g, "");
  outZip.file("word/document.xml", xml);
  return outZip.generate({ type: "nodebuffer" });
}

if (import.meta.main) {
  const sample: ContractRow = {
    "Маркировка": "Да",
    "Дата договора": "25.09.2026",
    "Номер": "С1",
    "Проект": "RMR",
    "Клиент (полное название)": "Общество с ограниченной ответственностью «РЭДМЭДРОБОТ МСК»",
    "Клиент (краткое название)": "ООО «РЭДМЭДРОБОТ МСК»",
    "ИНН клиента": "7703435262",
    "ОГРН клиента": "5177746084632",
    "Канал": "Not Boring Tech",
    "Ссылка на канал": "https://t.me/notboring_tech",
    "Дата публикации": "28.09.2026",
    "Дата окончания размещения": "28.10.2026",
    "Срок размещения (дней)": "30",
    "Стоимость": "29700",
    "НДС": "НДС не облагается (УСН)",
    "Кто передаёт данные в ОРД": "Заказчик",
    "Тип исполнителя": "ИП",
    "Исполнитель (полное название)": "Индивидуальный предприниматель Стефанов Арсений Русланович",
    "Исполнитель (кратко)": "Стефанов А.Р.",
    "ИНН исполнителя": "773582532931",
    "ОГРНИП исполнителя": "320774600202420",
    "Адрес исполнителя": "124365, г. Москва, г. Зеленоград, д. 446, кв. 128",
    "Банк исполнителя": "ООО «Банк Точка»",
    "Расчётный счёт": "40802810001500095086",
    "Корр. счёт": "30101810745374525104",
    "БИК": "044525104",
    "E-mail исполнителя": "",
    "Мессенджер исполнителя": "@stefanov",
    "Телефон исполнителя": "+7 900 000-00-00",
    "Статус": "Черновик",
    "Ссылка на файл": "",
  };
  const out = renderDocx("templates/marked.docx", sample);
  writeFileSync("out/test.docx", out);
  console.log("written out/test.docx", out.length, "bytes");
}
