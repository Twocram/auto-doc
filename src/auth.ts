import { google } from "googleapis";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Заполните GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в .env");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(clientId, clientSecret, "http://localhost:3000/oauth/callback");

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive",
  ],
});

console.log("Откройте в браузере:\n\n", url, "\n");

Bun.serve({
  port: 3000,
  async fetch(req) {
    const code = new URL(req.url).searchParams.get("code");
    if (!code) return new Response("Ожидание кода…");
    const { tokens } = await oauth2.getToken(code);
    console.log("\nДобавьте в .env:\n\nGOOGLE_REFRESH_TOKEN=" + tokens.refresh_token);
    setTimeout(() => process.exit(0), 500);
    return new Response("Готово, можно закрыть вкладку. Refresh token — в консоли.");
  },
});
