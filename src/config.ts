export const config = {
  telegramToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramAllowedIds: (process.env.TELEGRAM_ALLOWED_IDS ?? "")
    .split(",")
    .map((s) => Number(s.trim()))
    .filter(Boolean),
  publicUrl: process.env.PUBLIC_URL ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  googleRefreshToken: process.env.GOOGLE_REFRESH_TOKEN ?? "",
  spreadsheetId: process.env.SPREADSHEET_ID ?? "",
  sheetName: process.env.SHEET_NAME ?? "Договоры",
  driveFolderId: process.env.DRIVE_FOLDER_ID ?? "",
  port: Number(process.env.PORT ?? 3000),
};

export function assertConfig(keys: (keyof typeof config)[]) {
  const missing = keys.filter((k) => !config[k]);
  if (missing.length) throw new Error(`Missing config: ${missing.join(", ")}`);
}
