# auto-doc

Сервис генерации договоров из Google Sheets. Спецификация: [SPEC.md](SPEC.md).

## Быстрый путь: кнопка в таблице (без backend'а)

1. Загрузить `templates/marked.docx` и `templates/unmarked.docx` на Google Drive, открыть каждый → «Файл → Сохранить как Google Doc»
2. Расширения → Apps Script → вставить `apps-script/Code.gs`
3. В `CONFIG` вписать ID Google Doc-шаблонов (из их URL) и `driveFolderId` — папку для готовых PDF
4. Перезагрузить таблицу → меню «Договоры → Сгенерировать для текущей строки»

Генерация происходит полностью в Apps Script от вашего аккаунта: валидация строки, подстановка плейсхолдеров, экспорт PDF, запись статуса и ссылки обратно в таблицу.

## Backend (опционально, для Telegram-бота и запуска вне таблицы)

1. `bun install`
2. Скопировать `.env.example` в `.env`, заполнить:
   - `TELEGRAM_BOT_TOKEN` — токен бота от @BotFather
   - `TELEGRAM_ALLOWED_IDS` — Telegram user ID через запятую
   - `SPREADSHEET_ID`, `SHEET_NAME`, `DRIVE_FOLDER_ID`
3. Google OAuth (один раз):
   - В Google Cloud Console создать проект, включить Sheets API и Drive API
   - APIs & Services → Credentials → Create OAuth client ID → тип Desktop; вписать `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` в `.env`
   - OAuth consent screen: перевести приложение в «Production» (иначе refresh token живёт 7 дней)
   - `bun run auth` → открыть ссылку, подтвердить доступ → refresh token появится в консоли → вписать в `.env`
   - Все действия (таблица, Drive) выполняются от имени вашего аккаунта

4. `bun run start` (dev: `bun run dev`)

Без `PUBLIC_URL` бот работает через long polling — для локальной разработки ничего больше не нужно.

## Деплой на VPS (Docker)

1. Скопировать проект на сервер (без `.env` — он в `.dockerignore`), заполнить `.env` на сервере
2. `docker compose up -d --build`
3. Готово: бот работает на long polling (исходящие соединения, входящие не нужны), HTTP на порту 3000

Логи: `docker compose logs -f`. Обновление: `git pull && docker compose up -d --build`.

Если нужен webhook вместо long polling: выставить `PUBLIC_URL=https://<домен>` в `.env`, проксировать 3000 порт через nginx с TLS — при старте бот сам зарегистрирует webhook.

## Проверка генерации без Google

`bun run generate:test` — рендерит `templates/marked.docx` с тестовыми данными в `out/test.docx`.
