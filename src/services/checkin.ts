import moment from 'moment-timezone';
import { db } from '../db';
import { TelegramWebAppUser } from '../utils/telegramWebApp';
import { PracticeMethod, getPracticeMethodRows, buildPracticeMethodTree } from './taxonomy';
import { normalizeSelectedLeafIds } from './taxonomy';
import { Locale, methodName, normalizeLocale } from '../i18n';

const TIMEZONE = 'Asia/Taipei';
export const MAX_PRACTICE_NOTE_LENGTH = 2100;

export interface TodayCheckinResponse {
    date: string;
    alreadyCheckedIn: boolean;
    checkinLogId: number | null;
    selectedMethodIds: number[];
    practiceNote: string;
    reflectionNote: string;
    bodyFeelingNote: string;
}

export const upsertTelegramUser = async (user: TelegramWebAppUser) => {
    const locale = normalizeLocale(user.language_code);
    const { rows } = await db.query(
        `INSERT INTO telegram_users (telegram_user_id, username, first_name, last_name, language_code, interface_locale)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (telegram_user_id) DO UPDATE SET
             username = EXCLUDED.username,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             language_code = EXCLUDED.language_code,
             interface_locale = CASE
                 WHEN telegram_users.language_selected THEN telegram_users.interface_locale
                 ELSE EXCLUDED.interface_locale
             END,
             updated_at = CURRENT_TIMESTAMP
         RETURNING interface_locale`,
        [user.id, user.username || null, user.first_name || null, user.last_name || null, user.language_code || null, locale]
    );
    return normalizeLocale(rows[0]?.interface_locale || locale);
};

export const getPracticeMethods = async (): Promise<PracticeMethod[]> => {
    return buildPracticeMethodTree(await getPracticeMethodRows());
};

export const getTodayCheckin = async (telegramUserId: number, locale: Locale = 'zh_TW'): Promise<TodayCheckinResponse> => {
    const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');

    const { rows } = await db.queryWithRetry(
        `SELECT id, practice_note, reflection_note, body_feeling_note
         FROM telegram_checkin_logs
         WHERE telegram_user_id = $1 AND checkin_date = $2`,
        [telegramUserId, today]
    );

    if (rows.length === 0) {
        return {
            date: today,
            alreadyCheckedIn: false,
            checkinLogId: null,
            selectedMethodIds: [],
            practiceNote: '',
            reflectionNote: '',
            bodyFeelingNote: ''
        };
    }

    const checkin = rows[0];
    const practiceMethodRows = await getPracticeMethodRows();
    const selected = await db.queryWithRetry(
        `SELECT practice_method_id
         FROM telegram_checkin_method_selections
         WHERE checkin_log_id = $1
         ORDER BY practice_method_id ASC`,
        [checkin.id]
    );

    const practiceNote = checkin.practice_note || mergeLegacyPracticeNotes(checkin.reflection_note, checkin.body_feeling_note, locale);
    return {
        date: today,
        alreadyCheckedIn: true,
        checkinLogId: checkin.id,
        selectedMethodIds: normalizeSelectedLeafIds(selected.rows.map((r) => r.practice_method_id), practiceMethodRows),
        practiceNote,
        reflectionNote: practiceNote,
        bodyFeelingNote: ''
    };
};

export const mergeLegacyPracticeNotes = (reflectionNote = '', bodyFeelingNote = '', _locale: Locale = 'zh_TW') => {
    const reflection = reflectionNote.trim();
    const bodyFeeling = bodyFeelingNote.trim();
    if (!reflection || !bodyFeeling) return reflection || bodyFeeling;
    return `${reflection}\n${bodyFeeling}`;
};

export const buildLegacyNote = (methodNames: string[], practiceNote = '', locale: Locale = 'zh_TW') => {
    const parts: string[] = [];
    if (methodNames.length > 0) {
        parts.push(`功法：${methodNames.join('、')}`);
    }
    if (practiceNote.trim()) {
        const label = locale === 'en' ? 'Reflection and sensations: ' : locale === 'zh_CN' ? '心得与感受：' : '心得與感受：';
        parts.push(`${label}${practiceNote.trim()}`);
    }
    return parts.join('；');
};

export const saveTodayCheckin = async (telegramUserId: number, methodIds: number[], practiceNote: string, locale: Locale = 'zh_TW') => {
    if (methodIds.length === 0) {
        throw new Error('At least one practice method must be selected');
    }
    const normalizedPracticeNote = practiceNote.trim();
    if (normalizedPracticeNote.length > MAX_PRACTICE_NOTE_LENGTH) {
        throw new Error(`Practice note must be ${MAX_PRACTICE_NOTE_LENGTH} characters or fewer`);
    }

    const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        const methodRows = await client.query(
            `SELECT id, code, name_zh, name_zh_cn, name_en, method_type
             FROM practice_methods
             WHERE id = ANY($1::int[]) AND is_active = TRUE
             ORDER BY sort_order ASC, id ASC`,
            [methodIds]
        );

        if (methodRows.rows.length !== methodIds.length) {
            throw new Error('One or more selected practice methods are invalid');
        }

        if (methodRows.rows.some((row) => row.method_type !== 'leaf')) {
            throw new Error('Only leaf practice methods can be selected');
        }

        const methodNames = methodRows.rows.map((row) => methodName({
            nameZh: row.name_zh,
            nameZhCn: row.name_zh_cn,
            nameEn: row.name_en
        }, locale));
        const legacyMethodNames = methodRows.rows.map((row) => row.name_zh);
        const note = buildLegacyNote(legacyMethodNames, normalizedPracticeNote, locale);

        const existing = await client.query(
            `SELECT id
             FROM telegram_checkin_logs
             WHERE telegram_user_id = $1 AND checkin_date = $2`,
            [telegramUserId, today]
        );

        let checkinLogId: number;
        let alreadyCheckedIn = false;

        if (existing.rows.length > 0) {
            alreadyCheckedIn = true;
            checkinLogId = existing.rows[0].id;

            await client.query(
                 `UPDATE telegram_checkin_logs
                 SET practice_note = $1,
                     reflection_note = $1,
                     body_feeling_note = NULL,
                     note = $2,
                     source = 'webapp',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $3`,
                [normalizedPracticeNote || null, note || null, checkinLogId]
            );

            await client.query(
                `DELETE FROM telegram_checkin_method_selections
                 WHERE checkin_log_id = $1`,
                [checkinLogId]
            );
        } else {
            const inserted = await client.query(
                `INSERT INTO telegram_checkin_logs (telegram_user_id, checkin_date, practice_note, reflection_note, body_feeling_note, note, source)
                 VALUES ($1, $2, $3, $3, NULL, $4, 'webapp')
                 RETURNING id`,
                [telegramUserId, today, normalizedPracticeNote || null, note || null]
            );
            checkinLogId = inserted.rows[0].id;
        }

        for (const methodId of methodIds) {
            await client.query(
                `INSERT INTO telegram_checkin_method_selections (checkin_log_id, practice_method_id)
                 VALUES ($1, $2)
                 ON CONFLICT (checkin_log_id, practice_method_id) DO NOTHING`,
                [checkinLogId, methodId]
            );
        }

        await client.query('COMMIT');

        return {
            date: today,
            checkinLogId,
            alreadyCheckedIn,
            selectedMethods: methodNames,
            selectedMethodCodes: methodRows.rows.map((row) => row.code)
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};
