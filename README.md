# Qigong Telegram Bot

Telegram version of the Qigong check-in companion bot.

## MVP scope

- Telegram bot webhook receiver
- `/start`, `/checkin`, `/mystats`, `/badges`, `/achievements`, `/leaderboard`, `/weekly`, `/monthly`, `/quarterly`, `/yearly`, `/methodanalysis`, `/method30`, `/method90`, `/remindtest`
- Telegram Web Apps for check-in, achievements/history, leaderboard, and method analysis
- Traditional Chinese, Simplified Chinese, and English Bot and Web App interfaces
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
    - `TELEGRAM_ACHIEVEMENTS_WEBAPP_URL`
    - `TELEGRAM_LEADERBOARD_WEBAPP_URL`
    - `TELEGRAM_METHOD_ANALYSIS_WEBAPP_URL`
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
psql "$DATABASE_URL" -f migrations/004_hierarchical_practice_methods.sql
psql "$DATABASE_URL" -f migrations/005_combo_badges.sql
psql "$DATABASE_URL" -f migrations/006_user_reminder_settings.sql
psql "$DATABASE_URL" -f migrations/007_method_day_badges.sql
psql "$DATABASE_URL" -f migrations/008_fix_sanfu_badge_description.sql
psql "$DATABASE_URL" -f migrations/009_add_songjing_method.sql
psql "$DATABASE_URL" -f migrations/010_telegram_group_operations.sql
psql "$DATABASE_URL" -f migrations/011_backfill_2026_sanfu_badge.sql
psql "$DATABASE_URL" -f migrations/012_multilingual_experience.sql
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
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/004_hierarchical_practice_methods.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/005_combo_badges.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/006_user_reminder_settings.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/007_method_day_badges.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/008_fix_sanfu_badge_description.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/009_add_songjing_method.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/010_telegram_group_operations.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/011_backfill_2026_sanfu_badge.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/012_multilingual_experience.sql
```

Migration 011 idempotently awards the 2026 `夏練三伏` badge to users who checked in on all 40 days from July 15 through August 23. The service also reconciles the latest completed Sanfu period at startup and daily at 00:10 Asia/Taipei.

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
TELEGRAM_LEADERBOARD_WEBAPP_URL=https://your-domain.example.com/telegram/webapp/leaderboard
TELEGRAM_METHOD_ANALYSIS_WEBAPP_URL=https://your-domain.example.com/telegram/webapp/method-analysis
TELEGRAM_WEBHOOK_SECRET=your_random_secret
DATABASE_URL=postgres://user:password@host:5432/qigong_telegram_bot
TELEGRAM_WEBAPP_AUTH_MAX_AGE_SECONDS=3600
TELEGRAM_REMINDER_ENABLED=true
TELEGRAM_REMINDER_HOUR=20
TELEGRAM_GROUP_OPS_ENABLED=false
TELEGRAM_GROUP_REMINDER_HOUR=20
TELEGRAM_ADMIN_USER_IDS=123456789
```

Optional local LLM method reviews use an OpenAI-compatible API. Reviews are used by `/method30`, `/method90`, and the Admin user method analysis; disabled, ineligible, timed-out, or failed requests automatically use the existing rule-based review.

```ini
LOCAL_LLM_ENABLED=false
LOCAL_LLM_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_LLM_API_KEY=dummy
LOCAL_LLM_MODEL=your_model_name
LOCAL_LLM_TIMEOUT_MS=5000
LOCAL_LLM_CRITERIA=30
```

`LOCAL_LLM_CRITERIA` is the minimum lifetime check-in count required before an LLM review is generated. Set it to `0` to disable the lifetime gate.
`LOCAL_LLM_TIMEOUT_MS` is capped at 7000ms so Bot replies remain within the Telegram webhook processing budget.

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
TELEGRAM_LEADERBOARD_WEBAPP_URL=https://ubuntu1.tailbf9b8d.ts.net/telegram/webapp/leaderboard
TELEGRAM_METHOD_ANALYSIS_WEBAPP_URL=https://ubuntu1.tailbf9b8d.ts.net/telegram/webapp/method-analysis
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
    "url": "'"${PUBLIC_BASE_URL}"'/telegram/webhook/'"${TELEGRAM_WEBHOOK_SECRET}"'",
    "allowed_updates": ["message", "callback_query", "my_chat_member"]
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

## Telegram group operations

Group membership is tracked from `my_chat_member` webhook updates. Existing groups that do not emit a new membership update can be registered manually by an authorized admin inside the group:

```text
/admin register_group
```

Configure one or more numeric Telegram user IDs as a comma-separated allowlist. Outbound group reminders and broadcasts remain fail-closed until explicitly enabled:

```ini
TELEGRAM_ADMIN_USER_IDS=123456789,987654321
TELEGRAM_GROUP_OPS_ENABLED=true
TELEGRAM_GROUP_REMINDER_HOUR=20
```

Hidden admin commands are not added to the public command menu:

```text
/admin register_group
/admin create_reminder
/admin resend_reminder
/admin list_groups
/admin broadcast <message>
```

`create_reminder` only returns a preview. Daily reminders, resend, and broadcast durably enqueue database dispatch/delivery records before acknowledging the command. PostgreSQL locks prevent concurrent workers from processing the same dispatch, and pending deliveries are retried every minute. Delivery is at-least-once: Telegram does not provide a `sendMessage` idempotency key, so a process crash after Telegram accepts a message but before the database marks it sent can still cause a rare duplicate. Group reminder time uses `Asia/Taipei`.

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
leaderboard - 查看總排行榜並開啟排行榜頁
weekly - 查看週排行榜
monthly - 查看月排行榜
quarterly - 查看季排行榜
yearly - 查看年排行榜
methodanalysis - 開啟完整功法分析頁
method30 - 查看最近 30 天功法分析
method90 - 查看最近 90 天功法分析
remindtest - 手動補發提醒（測試用）
```

## Webhook route

- `POST /telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`

## Web App route

- `GET /telegram/webapp/checkin`
- `GET /telegram/webapp/achievements`
- `GET /telegram/webapp/leaderboard`
- `GET /telegram/webapp/method-analysis`

## Web App API routes

- `GET /telegram/api/webapp/practice-methods`
- `GET /telegram/api/webapp/checkin/today`
- `POST /telegram/api/webapp/checkin`
- `GET /telegram/api/webapp/achievements`
- `GET /telegram/api/webapp/leaderboard?period=week|month|quarter|year|all`
- `GET /telegram/api/webapp/method-analysis`

## Admin Dashboard (read-only)

- Overview: `GET /telegram/admin`
- Leaderboard: `GET /telegram/admin/leaderboard`
- Achievements: `GET /telegram/admin/achievements`
- Journal Feed: `GET /telegram/admin/journals`
- Method Analysis: `GET /telegram/admin/method-analysis`

### Admin APIs

- `GET /telegram/admin/api/overview?period=week|month|quarter|year&date=YYYY-MM-DD`
- `GET /telegram/admin/api/leaderboard?period=week|month|quarter|year&limit=10|20|30&page=1`
- `GET /telegram/admin/api/achievements`
- `GET /telegram/admin/api/journals?page=1&limit=20`
- `GET /telegram/admin/api/today-checkins?date=YYYY-MM-DD&page=1&limit=20`
- `GET /telegram/admin/api/today-pending?date=YYYY-MM-DD&page=1&limit=20`
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

## Bot commands

The following commands are registered in Telegram's command menu (set via `setMyCommands` on startup):

| Command | Description |
|---|---|
| `/start` | 開始使用 / 顯示主選單 |
| `/checkin` | 開始今日打卡 |
| `/achievements` | 查看成就頁 |
| `/mystats` | 查看我的練功統計 |
| `/badges` | 查看我的勳章 |
| `/leaderboard` | 總排行榜 |
| `/weekly` | 本週排行榜 |
| `/monthly` | 本月排行榜 |
| `/method30` | 最近 30 天功法分析 |
| `/method90` | 最近 90 天功法分析 |
| `/remind` | 設定每日提醒時間 / 時區 / 開關 |
| `/remindtest` | 送出一則提醒測試訊息 |
| `/language` | 切換繁體中文、簡體中文或英文介面 |

## Telegram admin / dashboard behavior

- `/telegram/admin/method-analysis` shows:
  - community method mix for 30d / 90d
  - user search
  - individual 30d / 90d method mix tables
- This page is intended for coaches/admins only and does not send any message to users

## Reminder behavior

- If `TELEGRAM_REMINDER_ENABLED=true`, the bot runs an hourly cron job (at minute 0 of every hour, Asia/Taipei scheduler)
- For each hourly run, the bot queries users whose **personal local hour** matches their `reminder_hour` in their `reminder_timezone`, and sends the reminder only to those users
- DST is handled automatically by PostgreSQL `AT TIME ZONE` per-row evaluation
- Personal reminder settings are stored on `telegram_users` as:
  - `reminder_enabled BOOLEAN DEFAULT TRUE`
  - `reminder_hour SMALLINT DEFAULT 20` (0-23, 24-hour format)
  - `reminder_timezone TEXT DEFAULT 'Asia/Taipei'` (IANA timezone string)
- If today is a solar term, the reminder uses the solar-term practice guide
- Otherwise it rotates through 50 daily wisdom sentences
- `/remindtest` sends a preview reminder message to the current user only

### `/remind` command

| Usage | Description |
|---|---|
| `/remind` | Show current reminder settings (status, time, timezone) |
| `/remind 21` | Set reminder hour to 21:00 (0-23, 24-hour format) and turn reminders on |
| `/remind on` | Turn reminders on |
| `/remind off` | Turn reminders off |
| `/remind tz America/New_York` | Set personal reminder timezone (IANA format) |

Examples:
- `/remind 7` — set reminder to 07:00
- `/remind 22` — set reminder to 22:00
- `/remind tz Asia/Taipei` — set timezone to Asia/Taipei
- `/remind off` — disable reminders

Setting a new hour with `/remind 21` automatically turns reminders on. Timezone is validated against the IANA timezone database via `moment.tz.zone()`.

## Logging and Retry

The Telegram bot now includes basic transient-failure protection and daily error log files.

### Database timeouts / retry

- PostgreSQL pool uses:
  - `connectionTimeoutMillis = 5000`
  - `idleTimeoutMillis = 30000`
  - `query_timeout = 10000`
  - `statement_timeout = 10000`
- A `db.queryWithRetry(...)` helper is available for important read paths.
- Transient DB/network issues such as connection resets, temporary timeout expiry, or short PostgreSQL restarts will be retried once with a short backoff.

### Error log files

- All `console.error(...)` output is also written to a daily rotating log file.
- Log directory:

```text
logs/
```

- File format:

```text
logs/error-YYYY-MM-DD.log
```

Examples:

```bash
tail -f logs/error-2026-07-05.log
grep "failed to load today checkin" logs/error-2026-07-05.log
```

### Check-in page diagnostics

The WebApp check-in page now distinguishes between:

- `功法列表載入失敗：...`
- `今日打卡資料載入失敗：...`

The corresponding server routes also log load duration in milliseconds so intermittent failures are easier to trace.

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
- Seasonal badges: 夏練三伏（依當年三伏全程計算） / 冬練三九（27天） (annual repeatable)
- Badges are only evaluated on the first successful check-in of a day. Same-day overwrite updates content only and does not re-add total days.

## Next implementation steps

1. Beautify badges in Telegram Web App / admin UI
2. Add compatibility layer for shared logic with LINE version
3. Add group reminder strategy for Telegram communities
4. Add richer personal history/review pages
