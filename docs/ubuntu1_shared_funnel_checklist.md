# ubuntu1 Shared Funnel Deployment Checklist

這份 checklist 用來協助在 `ubuntu1` 上完成以下整合部署：

- `qigong-line-bot`
- `qigong-telegram-bot`
- `Caddy` path routing
- `Tailscale Funnel`
- LINE / Telegram webhook 驗證

---

## A. 服務與 Port 規劃

確認以下配置正確：

- LINE bot: `127.0.0.1:3000`
- Telegram bot: `127.0.0.1:3001`
- Caddy reverse proxy: `127.0.0.1:8080`
- Tailscale Funnel: 對外公開 `8080`

---

## B. LINE Bot Checklist

### 1. 更新程式碼

```bash
cd ~/Devel/qigong-line-bot
git pull origin main
npm install
npm run build
pm2 restart qigong-line-bot --update-env
```

### 2. 確認本機服務正常

```bash
curl http://127.0.0.1:3000/
```

預期回應：

```text
Qigong LINE Bot is running.
```

### 3. 確認 LINE 相關路徑規劃

- Webhook: `/webhook`
- Admin Dashboard: `/admin-dashboard`
- Admin API: `/api/admin/*`

---

## C. Telegram Bot Checklist

### 1. 更新程式碼

```bash
cd ~/Devel/qigong-telegram-bot
git pull origin main
npm install
```

### 2. 設定 `.env`

至少確認以下變數：

```ini
PORT=3001
TELEGRAM_BOT_TOKEN=...
TELEGRAM_WEBHOOK_SECRET=...
PUBLIC_BASE_URL=https://ubuntu1.tailbf9b8d.ts.net
TELEGRAM_WEBAPP_URL=https://ubuntu1.tailbf9b8d.ts.net/telegram/webapp/checkin
TELEGRAM_ACHIEVEMENTS_WEBAPP_URL=https://ubuntu1.tailbf9b8d.ts.net/telegram/webapp/achievements
DATABASE_URL=postgres://qigong_user:qigong_password@localhost:5432/qigong_telegram_bot
TELEGRAM_WEBAPP_AUTH_DISABLED=false
TELEGRAM_REMINDER_ENABLED=true
TELEGRAM_REMINDER_HOUR=20
ADMIN_DASH_USER=admin
ADMIN_DASH_PASS=your_strong_password
ADMIN_ALLOWED_IP_PREFIX=100.
```

### 3. 建立 Telegram DB（若尚未建立）

```bash
docker exec -it qigong_db psql -U qigong_user -d postgres -c "CREATE DATABASE qigong_telegram_bot;"
```

### 4. 跑 migrations

```bash
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/001_init.sql
docker exec -i qigong_db psql -U qigong_user -d qigong_telegram_bot < migrations/002_badges.sql
```

### 5. build 與啟動

```bash
npm run build
pm2 restart qigong-telegram-bot --update-env
```

### 6. 確認本機服務正常

```bash
curl http://127.0.0.1:3001/
```

預期回應：JSON，包含：

- `service: qigong-telegram-bot`
- `webapp: /telegram/webapp/checkin`

### 7. 確認 Telegram 路徑規劃

- Webhook: `/telegram/webhook/<secret>`
- Web App: `/telegram/webapp/checkin`
- Achievements Web App: `/telegram/webapp/achievements`
- Web App API: `/telegram/api/webapp/*`
- Admin Dashboard: `/telegram/admin`
- Leaderboard: `/telegram/admin/leaderboard`
- Method Analysis: `/telegram/admin/method-analysis`

---

## D. Caddy Checklist

### 1. 安裝 Caddy

```bash
sudo apt update
sudo apt install -y caddy
```

### 2. 備份原設定

```bash
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak 2>/dev/null || true
```

### 3. 寫入 `/etc/caddy/Caddyfile`

使用 repo 提供的範例：

- `qigong-telegram-bot/docs/Caddyfile.shared-funnel-example`

或直接寫入：

```caddy
:8080 {
    handle /webhook {
        reverse_proxy 127.0.0.1:3000
    }

    handle /admin-dashboard* {
        reverse_proxy 127.0.0.1:3000
    }

    handle /api/admin* {
        reverse_proxy 127.0.0.1:3000
    }

    handle /telegram/webhook/* {
        reverse_proxy 127.0.0.1:3001
    }

    handle /telegram/webapp/* {
        reverse_proxy 127.0.0.1:3001
    }

    handle /telegram/api/* {
        reverse_proxy 127.0.0.1:3001
    }

    handle /telegram/admin* {
        reverse_proxy 127.0.0.1:3001
    }

    handle {
        respond "shared funnel reverse proxy is running" 200
    }
}
```

> 重要：這裡要用 `handle`，**不要用 `handle_path`**。  
> `handle_path /webhook` 會把 `/webhook` 前綴剝掉，導致 LINE app 實際收到 `/`，進而讓 LINE webhook 驗證失敗並出現 `404 Not Found`。

### 4. 驗證設定

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
```

### 5. 啟動 / 重啟 Caddy

```bash
sudo systemctl restart caddy
sudo systemctl enable caddy
sudo systemctl status caddy
```

### 6. 本機測試 path routing

```bash
curl http://127.0.0.1:8080/
curl http://127.0.0.1:8080/webhook
curl http://127.0.0.1:8080/telegram/webapp/checkin
curl http://127.0.0.1:8080/telegram/admin
```

預期：

- `/` 回 `shared funnel reverse proxy is running`
- `/telegram/webapp/checkin` 回 HTML
- `/telegram/admin` 回 401（Basic Auth）或 HTML

---

## E. Tailscale Funnel Checklist

### 1. 關掉原本直接指向單一服務的 Funnel

```bash
tailscale funnel reset
```

### 2. 改成對外公開 Caddy 的 `8080`

```bash
tailscale funnel 8080
```

### 3. 驗證 Funnel 狀態

```bash
tailscale funnel status
```

---

## F. LINE Webhook 驗證

### 1. LINE Developer Console 設定

- Webhook URL:

```text
https://ubuntu1.tailbf9b8d.ts.net/webhook
```

### 2. 驗證

- 在 LINE Developer Console 按 `Verify`
- 確認成功

### 3. Bot 功能測試

- 1 對 1 聊天室 `✅ Check-In`
- `🏆 Weekly Leaderboard`
- `📊 My Stats`
- `https://ubuntu1.tailbf9b8d.ts.net/admin-dashboard`

---

## G. Telegram Webhook 驗證

### 1. 註冊 webhook

```bash
curl -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "'"${PUBLIC_BASE_URL}"'/telegram/webhook/'"${TELEGRAM_WEBHOOK_SECRET}"'"
  }'
```

### 2. 查詢 webhook 狀態

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

重點檢查：

- `url` 正確
- `last_error_message` 為空
- `pending_update_count` 正常

### 3. Telegram Bot 功能測試

在 Telegram bot 裡測：

```text
/start
/checkin
/mystats
/badges
/achievements
/leaderboard
/weekly
/monthly
/quarterly
/yearly
/method30
/method90
/remindtest
```

### 4. Telegram Admin 測試

打開：

- `https://ubuntu1.tailbf9b8d.ts.net/telegram/admin`
- `https://ubuntu1.tailbf9b8d.ts.net/telegram/admin/leaderboard`
- `https://ubuntu1.tailbf9b8d.ts.net/telegram/admin/method-analysis`

---

## H. 常用除錯指令

### Caddy

```bash
journalctl -u caddy -n 100 --no-pager
```

### LINE bot

```bash
pm2 logs qigong-line-bot
```

### Telegram bot

```bash
pm2 logs qigong-telegram-bot
```

### Funnel

```bash
tailscale funnel status
```

### Telegram webhook 狀態

```bash
curl "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```

---

## I. 最終驗收清單

- [ ] LINE webhook 可通
- [ ] Telegram webhook 可通
- [ ] LINE admin dashboard 正常
- [ ] Telegram admin dashboard 正常
- [ ] Telegram `/checkin` 可開 Web App
- [ ] Telegram `/achievements` 可開成就頁
- [ ] Telegram `/mystats`、`/badges` 正常
- [ ] LINE / Telegram 共用同一個 `https://ubuntu1.tailbf9b8d.ts.net`
- [ ] Caddy path routing 正常
- [ ] Funnel 指向 `8080`
