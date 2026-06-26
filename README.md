# Qigong Telegram Bot

Telegram version of the Qigong check-in companion bot.

## MVP scope

- Telegram bot webhook receiver
- `/start`, `/checkin`, `/mystats`, `/leaderboard` skeleton commands
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

## Webhook route

- `POST /telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`

## Web App route

- `GET /webapp/checkin`

## Web App API routes

- `GET /api/webapp/practice-methods`
- `GET /api/webapp/checkin/today`
- `POST /api/webapp/checkin`

## Current structured check-in behavior

- User opens Telegram Web App from `/checkin`
- Bot loads today's saved data if it exists
- User can select multiple practice methods
- Reflection note is optional
- Body feeling note is optional
- Submitting again on the same day overwrites that day's content instead of creating a second check-in

## Next implementation steps

1. Add streak and total-days calculation for Telegram users
2. Add `/mystats` and leaderboard logic
3. Add Telegram reminders and solar-term / wisdom rotation
4. Add admin analysis and method review pages
