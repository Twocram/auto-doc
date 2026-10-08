import { renderDocx } from "./generate";
import { docxToPdfInDrive } from "./drive";
import { readRow, writeResult } from "./sheets";
import { templateData } from "./contractData";

export async function generateForRow(rowNumber: number): Promise<{ url: string } | { error: string }> {
  try {
    const row = await readRow(rowNumber);
    const templatePath = row["Маркировка"] === "Да" ? "templates/marked.docx" : "templates/unmarked.docx";

    let docx: Buffer;
    try {
      docx = renderDocx(templatePath, row);
    } catch (e) {
      const message = (e as Error).message;
      await writeResult(rowNumber, message, "");
      return { error: message };
    }

    const fileName = `Договор ${templateData(row).contractNumber}`;
    const { url } = await docxToPdfInDrive(docx, fileName);
    await writeResult(rowNumber, "Сгенерирован", url);
    return { url };
  } catch (e) {
    return { error: (e as Error).message };
  }
}
