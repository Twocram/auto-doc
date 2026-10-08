import { headers, type ContractRow } from "./contractData";
import { config } from "./config";
import { sheetsApi } from "./drive";

function columnLetter(index: number): string {
  let letter = "";
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    letter = String.fromCharCode(65 + rem) + letter;
    n = Math.floor((n - 1) / 26);
  }
  return letter;
}

const range = (cell: string) => `'${config.sheetName}'!${cell}`;

export async function readRow(rowNumber: number): Promise<ContractRow> {
  const lastCol = columnLetter(headers.length - 1);
  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: range(`A1:${lastCol}${rowNumber}`),
  });
  const values = res.data.values ?? [];
  const sheetHeaders = (values[0] ?? []).map(String);
  const rowValues = (values[rowNumber - 1] ?? []).map(String);

  const row: ContractRow = {};
  sheetHeaders.forEach((header, i) => {
    row[header] = rowValues[i] ?? "";
  });
  return row;
}

export async function writeResult(rowNumber: number, status: string, fileUrl: string): Promise<void> {
  const headerRes = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: range("A1:AZ1"),
  });
  const sheetHeaders = (headerRes.data.values?.[0] ?? []).map(String);

  const updates: { range: string; values: string[][] }[] = [];
  for (const [header, value] of [["Статус", status], ["Ссылка на файл", fileUrl]] as const) {
    const col = sheetHeaders.indexOf(header);
    if (col === -1) throw new Error(`Колонка «${header}» не найдена в таблице`);
    updates.push({ range: range(`${columnLetter(col)}${rowNumber}`), values: [[value]] });
  }
  await sheetsApi.spreadsheets.values.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    requestBody: { valueInputOption: "RAW", data: updates },
  });
}

export async function appendRow(row: ContractRow): Promise<number> {
  const lastCol = columnLetter(headers.length - 1);
  const res = await sheetsApi.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: range(`A1:${lastCol}1`),
  });
  const sheetHeaders = (res.data.values?.[0] ?? []).map(String);
  const values = sheetHeaders.map((h) => row[h] ?? "");

  const appended = await sheetsApi.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: range(`A1:${lastCol}1`),
    valueInputOption: "RAW",
    requestBody: { values: [values] },
  });
  const updatedRange = appended.data.updates?.updatedRange ?? "";
  const match = updatedRange.match(/(\d+)$/);
  return match ? Number(match[1]) : -1;
}
