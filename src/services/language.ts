import { db } from '../db';
import { Locale, normalizeLocale } from '../i18n';

export const getTelegramUserLocale = async (telegramUserId: number): Promise<Locale> => {
    const { rows } = await db.query(
        'SELECT interface_locale, language_code FROM telegram_users WHERE telegram_user_id = $1',
        [telegramUserId]
    );
    return normalizeLocale(rows[0]?.interface_locale || rows[0]?.language_code);
};

export const setTelegramUserLocale = async (telegramUserId: number, locale: Locale) => {
    await db.query(
        `UPDATE telegram_users
         SET interface_locale = $2, language_selected = TRUE, updated_at = CURRENT_TIMESTAMP
         WHERE telegram_user_id = $1`,
        [telegramUserId, locale]
    );
};
