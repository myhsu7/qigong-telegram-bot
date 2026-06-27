# Qigong Telegram Bot

Telegram version of the Qigong check-in companion bot.

## MVP scope

- Telegram bot webhook receiver
- `/start`, `/checkin`, `/mystats`, `/leaderboard`, `/weekly`, `/monthly`, `/quarterly`, `/yearly`, `/method30`, `/method90`, `/remindtest`
- Telegram Web App check-in entry point
- Web App form for:
  - multi-select practice methods
  - reflection note
  - body feeling note
- same-day overwrite behavior implemented in backend API

## Setup

1. Copy `.env.example` to `.env`
2. Fill in:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `PUBLIC_BASE_URL`
   - `TELEGRAM_WEBAPP_URL`
   - `DATABASE_URL`
3. Install deps:
   - `npm install`
4. Run dev server:
   - `npm run dev`

## Database setup

Run the initial schema:

```bash
psql "$DATABASE_URL" -f migrations/001_init.sql
```

This creates:

- `telegram_users`
- `practice_methods`
- `telegram_checkin_logs`
- `telegram_checkin_method_selections`

## Telegram webhook setup

1. Create a bot with `@BotFather` and obtain `TELEGRAM_BOT_TOKEN`.
2. Decide your public HTTPS base URL. Example:
   - `https://your-domain.example.com`
3. Set `.env`:

```ini
PUBLIC_BASE_URL=https://your-domain.example.com
TELEGRAM_WEBAPP_URL=https://your-domain.example.com/webapp/checkin
TELEGRAM_WEBHOOK_SECRET=your_random_secret
DATABASE_URL=postgres://user:password@host:5432/qigong_telegram_bot
TELEGRAM_REMINDER_ENABLED=true
TELEGRAM_REMINDER_HOUR=20
```

4. Start the app so the webhook endpoint is available:

```bash
npm run build
npm start
```

5. Register the webhook with Telegram:

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "'"${PUBLIC_BASE_URL}"'/telegram/webhook/'"${TELEGRAM_WEBHOOK_SECRET}"'"
  }'
```

6. Verify webhook status:

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

7. In BotFather, optionally configure:
   - bot description
   - command list
   - menu button / Web App entry if desired

## Recommended BotFather commands

- `/setdescription`
- `/setabouttext`
- `/setcommands`

Suggested command list:

```text
start - 啟動氣功打卡小幫手
checkin - 開啟今日打卡表單
mystats - 查看個人打卡統計
leaderboard - 查看總排行榜
weekly - 查看週排行榜
monthly - 查看月排行榜
quarterly - 查看季排行榜
yearly - 查看年排行榜
method30 - 查看最近 30 天功法分析
method90 - 查看最近 90 天功法分析
remindtest - 手動補發提醒（測試用）
```

## Webhook route

- `POST /telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`

## Web App route

- `GET /webapp/checkin`

## Web App API routes

- `GET /api/webapp/practice-methods`
- `GET /api/webapp/checkin/today`
- `POST /api/webapp/checkin`

## Admin Method Analysis (read-only)

- Route: `GET /admin/method-analysis`
- APIs:
  - `GET /admin/api/method-analysis/summary?period=30d|90d`
  - `GET /admin/api/method-analysis/search-users?q=keyword`
  - `GET /admin/api/method-analysis/user?userId=...`
- Security:
  - Tailscale internal access only (`ADMIN_ALLOWED_IP_PREFIX`)
  - Basic Auth (`ADMIN_DASH_USER`, `ADMIN_DASH_PASS`)

## Current structured check-in behavior

- User opens Telegram Web App from `/checkin`
- Bot loads today's saved data if it exists
- User can select multiple practice methods
- Reflection note is optional
- Body feeling note is optional
- Submitting again on the same day overwrites that day's content instead of creating a second check-in
- API returns current streak and total check-ins after save

## Current stats behavior

- `/mystats` shows:
  - current streak
  - longest streak
  - total check-in days
- `/leaderboard` shows all-time totals and longest streaks
- `/weekly`, `/monthly`, `/quarterly`, `/yearly` show period leaderboards
- `/method30` and `/method90` show structured method mix analysis based on selected practice methods

## Telegram admin / dashboard behavior

- `/admin/method-analysis` shows:
  - community method mix for 30d / 90d
  - user search
  - individual 30d / 90d method mix tables
- This page is intended for coaches/admins only and does not send any message to users

## Reminder behavior

- If `TELEGRAM_REMINDER_ENABLED=true`, the bot sends a daily reminder at `TELEGRAM_REMINDER_HOUR` (Asia/Taipei)
- If today is a solar term, the reminder uses the solar-term practice guide
- Otherwise it rotates through 50 daily wisdom sentences
- `/remindtest` manually triggers the same reminder flow

## Next implementation steps

1. Add method analysis and review pages
2. Add Admin Dashboard for Telegram
3. Add compatibility layer for shared logic with LINE version
4. Add badge / level system for Telegram users
