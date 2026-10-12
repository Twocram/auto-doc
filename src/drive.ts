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

export async function createDocInDrive(docx: Buffer, fileName: string): Promise<{ fileId: string; url: string }> {
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
    fields: "id,webViewLink",
  });
  const fileId = uploaded.data.id!;

  await drive.permissions.create({
    fileId,
    requestBody: { type: "anyone", role: "reader" },
  });

  return {
    fileId,
    url: uploaded.data.webViewLink ?? `https://docs.google.com/document/d/${fileId}/edit`,
  };
}
