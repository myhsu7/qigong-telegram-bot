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
- same-day overwrite behavior planned in backend phase

## Setup

1. Copy `.env.example` to `.env`
2. Fill in:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_WEBHOOK_SECRET`
   - `PUBLIC_BASE_URL`
   - `TELEGRAM_WEBAPP_URL`
3. Install deps:
   - `npm install`
4. Run dev server:
   - `npm run dev`

## Webhook route

- `POST /telegram/webhook/<TELEGRAM_WEBHOOK_SECRET>`

## Web App route

- `GET /webapp/checkin`

## Next implementation steps

1. Add PostgreSQL schema and persistence
2. Implement Web App auth validation from Telegram init data
3. Save structured check-ins and same-day overwrite
4. Add stats, reminders, and admin analysis
