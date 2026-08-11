import crypto from 'crypto';
import { env } from '../config/env';

export interface TelegramWebAppUser {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    language_code?: string;
}

export interface TelegramWebAppAuthResult {
    user: TelegramWebAppUser;
    authDate?: number;
}

const parseInitData = (initData: string) => {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash') || '';
    const authDate = params.get('auth_date');
    const userRaw = params.get('user');

    const dataCheckString = [...params.entries()]
        .filter(([key]) => key !== 'hash')
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

    return {
        hash,
        authDate: authDate ? parseInt(authDate, 10) : undefined,
        user: userRaw ? (JSON.parse(userRaw) as TelegramWebAppUser) : null,
        dataCheckString
    };
};

export const verifyTelegramWebAppInitData = (initData: string): TelegramWebAppAuthResult => {
    if (!initData) {
        throw new Error('Missing Telegram initData');
    }

    if (env.telegramWebappAuthDisabled) {
        const parsed = parseInitData(initData);
        if (!parsed.user || !Number.isSafeInteger(parsed.user.id) || parsed.user.id <= 0) {
            throw new Error('Missing Telegram user in initData');
        }
        return { user: parsed.user, authDate: parsed.authDate };
    }

    const parsed = parseInitData(initData);
    if (!parsed.user || !Number.isSafeInteger(parsed.user.id) || parsed.user.id <= 0) {
        throw new Error('Missing Telegram user in initData');
    }

    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(parsed.authDate) || !parsed.authDate) {
        throw new Error('Missing Telegram auth_date');
    }
    if (parsed.authDate > now + 60 || now - parsed.authDate > env.telegramWebappAuthMaxAgeSeconds) {
        throw new Error('Expired Telegram initData');
    }

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(env.telegramBotToken).digest();
    const computedHash = crypto.createHmac('sha256', secretKey).update(parsed.dataCheckString).digest('hex');

    if (!/^[a-f0-9]{64}$/i.test(parsed.hash)) {
        throw new Error('Invalid Telegram Web App signature');
    }
    const expectedHash = Buffer.from(computedHash, 'hex');
    const receivedHash = Buffer.from(parsed.hash, 'hex');
    if (expectedHash.length !== receivedHash.length || !crypto.timingSafeEqual(expectedHash, receivedHash)) {
        throw new Error('Invalid Telegram Web App signature');
    }

    return {
        user: parsed.user,
        authDate: parsed.authDate
    };
};
