import { google } from "googleapis";
import { Readable } from "node:stream";
import { config } from "./config";

export const oauth2 = new google.auth.OAuth2(
  config.googleClientId,
  config.googleClientSecret,
  "http://localhost:3000/oauth/callback",
);
oauth2.setCredentials({ refresh_token: config.googleRefreshToken });

export const drive = google.drive({ version: "v3", auth: oauth2 });
export const sheetsApi = google.sheets({ version: "v4", auth: oauth2 });


export async function docxToPdfInDrive(docx: Buffer, fileName: string): Promise<{ fileId: string; url: string }> {
  const uploaded = await drive.files.create({
    requestBody: {
      name: fileName,
      mimeType: "application/vnd.google-apps.document",
      parents: config.driveFolderId ? [config.driveFolderId] : undefined,
    },
    media: {
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: Readable.from([docx]),
    },
    fields: "id",
  });
  const docId = uploaded.data.id!;

  const pdf = await drive.files.export(
    { fileId: docId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" },
  );

  const pdfFile = await drive.files.create({
    requestBody: {
      name: `${fileName}.pdf`,
      mimeType: "application/pdf",
      parents: config.driveFolderId ? [config.driveFolderId] : undefined,
    },
    media: { mimeType: "application/pdf", body: Readable.from([Buffer.from(pdf.data as ArrayBuffer)]) },
    fields: "id,webViewLink",
  });

  await drive.permissions.create({
    fileId: pdfFile.data.id!,
    requestBody: { type: "anyone", role: "reader" },
  });

  await drive.files.delete({ fileId: docId });

  return {
    fileId: pdfFile.data.id!,
    url: pdfFile.data.webViewLink ?? `https://drive.google.com/file/d/${pdfFile.data.id}/view`,
  };
}
