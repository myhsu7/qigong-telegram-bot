# Qigong Telegram Bot

Telegram version of the Qigong check-in companion bot.

## MVP scope

- Telegram bot webhook receiver
- `/start`, `/checkin`, `/mystats`, `/badges`, `/achievements`, `/leaderboard`, `/weekly`, `/monthly`, `/quarterly`, `/yearly`, `/method30`, `/method90`, `/remindtest`
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

### Option A. If PostgreSQL is already available via `DATABASE_URL`

Run the initial schema directly:

```bash
psql "$DATABASE_URL" -f migrations/001_init.sql
psql "$DATABASE_URL" -f migrations/002_badges.sql
psql "$DATABASE_URL" -f migrations/003_update_practice_methods.sql
```

### Option B. If PostgreSQL is running inside Docker

If your PostgreSQL container is `qigong_db` and you want to create the Telegram database inside that container, use:

```bash
docker exec -it qigong_db psql -U qigong_user -d postgres -c "CREATE DATABASE qigong_telegram_bot;"
```

Then run the migrations from the host into the containerized PostgreSQL:

```bash
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/001_init.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/002_badges.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/003_update_practice_methods.sql
```

If you are reusing the same PostgreSQL container as the LINE bot, make sure your `.env` points to the Telegram database:

```ini
DATABASE_URL=postgres://qigong_user:qigong_password@localhost:5432/qigong_telegram_bot
```

This creates:

- `telegram_users`
- `practice_methods`
- `telegram_checkin_logs`
- `telegram_checkin_method_selections`
- `telegram_badges`
- `telegram_user_badges`

## Telegram webhook setup

1. Create a bot with `@BotFather` and obtain `TELEGRAM_BOT_TOKEN`.
2. Decide your public HTTPS base URL. Example:
   - `https://your-domain.example.com`
3. Set `.env`:

```ini
PUBLIC_BASE_URL=https://your-domain.example.com
TELEGRAM_WEBAPP_URL=https://your-domain.example.com/telegram/webapp/checkin
TELEGRAM_ACHIEVEMENTS_WEBAPP_URL=https://your-domain.example.com/telegram/webapp/achievements
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

If you are deploying on your home Ubuntu server and want Telegram to reach the bot through Tailscale Funnel, expose port `3001`:

```bash
tailscale funnel 3001
```

If you want LINE and Telegram to share the same public Tailscale Funnel endpoint on `ubuntu1`, use a reverse proxy instead:

1. Copy `docs/ubuntu1.Caddyfile` to `/etc/caddy/Caddyfile`
2. Validate it:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

3. Restart Caddy:

```bash
sudo systemctl restart caddy
```

4. Funnel the proxy instead of either bot directly:

```bash
tailscale funnel 8080
```

In that setup, Telegram must use the namespaced routes already built into this repo:

```ini
PUBLIC_BASE_URL=https://ubuntu1.tailbf9b8d.ts.net
TELEGRAM_WEBAPP_URL=https://ubuntu1.tailbf9b8d.ts.net/telegram/webapp/checkin
TELEGRAM_ACHIEVEMENTS_WEBAPP_URL=https://ubuntu1.tailbf9b8d.ts.net/telegram/webapp/achievements
```

Use the resulting public HTTPS URL as `PUBLIC_BASE_URL`, for example:

```ini
PUBLIC_BASE_URL=https://your-node-name.tailscale.net
TELEGRAM_WEBAPP_URL=https://your-node-name.tailscale.net/telegram/webapp/checkin
TELEGRAM_ACHIEVEMENTS_WEBAPP_URL=https://your-node-name.tailscale.net/telegram/webapp/achievements
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
badges - 查看個人成就勳章
achievements - 開啟成就頁
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

- `GET /telegram/webapp/checkin`
- `GET /telegram/webapp/achievements`

## Web App API routes

- `GET /telegram/api/webapp/practice-methods`
- `GET /telegram/api/webapp/checkin/today`
- `POST /telegram/api/webapp/checkin`
- `GET /telegram/api/webapp/achievements`

## Admin Dashboard (read-only)

- Overview: `GET /telegram/admin`
- Leaderboard: `GET /telegram/admin/leaderboard`
- Method Analysis: `GET /telegram/admin/method-analysis`

### Admin APIs

- `GET /telegram/admin/api/overview?period=week|month|quarter|year`
- `GET /telegram/admin/api/leaderboard?period=week|month|quarter|year`
- `GET /telegram/admin/api/method-analysis/summary?period=30d|90d`
- `GET /telegram/admin/api/method-analysis/search-users?q=keyword`
- `GET /telegram/admin/api/method-analysis/user?userId=...`

### Admin security

- Tailscale internal access only (`ADMIN_ALLOWED_IP_PREFIX`)
- Basic Auth (`ADMIN_DASH_USER`, `ADMIN_DASH_PASS`)

## Legacy method-analysis detail

- Route: `GET /telegram/admin/method-analysis`
- APIs:
  - `GET /telegram/admin/api/method-analysis/summary?period=30d|90d`
  - `GET /telegram/admin/api/method-analysis/search-users?q=keyword`
  - `GET /telegram/admin/api/method-analysis/user?userId=...`
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
- `/mystats` also shows:
  - cultivation level title
  - earned badges trophy case
- `/badges` lists each unlocked badge with description
- `/achievements` opens a prettier Web App achievement page with level progress and badge cards
- `/leaderboard` shows all-time totals and longest streaks
- `/weekly`, `/monthly`, `/quarterly`, `/yearly` show period leaderboards
- `/method30` and `/method90` show structured method mix analysis based on selected practice methods

## Telegram admin / dashboard behavior

- `/telegram/admin/method-analysis` shows:
  - community method mix for 30d / 90d
  - user search
  - individual 30d / 90d method mix tables
- This page is intended for coaches/admins only and does not send any message to users

## Reminder behavior

- If `TELEGRAM_REMINDER_ENABLED=true`, the bot sends a daily reminder at `TELEGRAM_REMINDER_HOUR` (Asia/Taipei)
- If today is a solar term, the reminder uses the solar-term practice guide
- Otherwise it rotates through 50 daily wisdom sentences
- `/remindtest` manually triggers the same reminder flow

## Badge and Level system

- Levels are based on total check-in days:
  - 練氣 (Level 1): 0-29 days
  - 築基 (Level 2): 30-89 days
  - 結丹 (Level 3): 90-199 days
  - 化境 (Level 4): 200+ days
- Badge categories:
  - Streak badges: 3 / 7 / 21 / 100 days
  - Total day badges: 10 / 100 days
  - Time-based badges: morning / night consistency
  - Seasonal badges: 夏練三伏 / 冬練三九 (annual repeatable)
- Badges are only evaluated on the first successful check-in of a day. Same-day overwrite updates content only and does not re-add total days.

## Next implementation steps

1. Beautify badges in Telegram Web App / admin UI
2. Add compatibility layer for shared logic with LINE version
3. Add group reminder strategy for Telegram communities
4. Add richer personal history/review pages
