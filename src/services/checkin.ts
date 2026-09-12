import { db } from '../db';
import { TelegramWebAppUser } from '../utils/telegramWebApp';
import { PracticeMethod, getPracticeMethodRows, buildPracticeMethodTree } from './taxonomy';
import { normalizeSelectedLeafIds } from './taxonomy';
import { Locale, methodName, normalizeLocale } from '../i18n';
import { getPracticeTimezoneSettings, validateCheckinDate } from './practiceTimezone';

export const MAX_PRACTICE_NOTE_LENGTH = 2100;

export interface TodayCheckinResponse {
    date: string;
    alreadyCheckedIn: boolean;
    checkinLogId: number | null;
    selectedMethodIds: number[];
    practiceNote: string;
    reflectionNote: string;
    bodyFeelingNote: string;
    entryKind: 'regular' | 'makeup';
    practiceTimezone: string;
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

export const getCheckinForDate = async (
    telegramUserId: number,
    checkinDate: string,
    locale: Locale = 'zh_TW'
): Promise<TodayCheckinResponse> => {
    const settings = await getPracticeTimezoneSettings(telegramUserId);
    const target = validateCheckinDate(checkinDate, settings);
    if (!settings.confirmed && target.entryKind === 'makeup') throw new Error('Confirm your practice timezone before making up yesterday');

    const { rows } = await db.queryWithRetry(
        `SELECT id, practice_note, reflection_note, body_feeling_note, entry_kind, practice_timezone
         FROM telegram_checkin_logs
         WHERE telegram_user_id = $1 AND checkin_date = $2`,
        [telegramUserId, target.checkinDate]
    );

    if (rows.length === 0) {
        return {
            date: target.checkinDate,
            alreadyCheckedIn: false,
            checkinLogId: null,
            selectedMethodIds: [],
            practiceNote: '',
            reflectionNote: '',
            bodyFeelingNote: '',
            entryKind: target.entryKind,
            practiceTimezone: settings.practiceTimezone
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
        date: target.checkinDate,
        alreadyCheckedIn: true,
        checkinLogId: checkin.id,
        selectedMethodIds: normalizeSelectedLeafIds(selected.rows.map((r) => r.practice_method_id), practiceMethodRows),
        practiceNote,
        reflectionNote: practiceNote,
        bodyFeelingNote: '',
        entryKind: checkin.entry_kind === 'makeup' ? 'makeup' : 'regular',
        practiceTimezone: checkin.practice_timezone || settings.practiceTimezone
    };
};

export const getTodayCheckin = async (telegramUserId: number, locale: Locale = 'zh_TW') => {
    const settings = await getPracticeTimezoneSettings(telegramUserId);
    return getCheckinForDate(telegramUserId, settings.today, locale);
};

export const mergeLegacyPracticeNotes = (reflectionNote: string | null = '', bodyFeelingNote: string | null = '', _locale: Locale = 'zh_TW') => {
    const reflection = (reflectionNote || '').trim();
    const bodyFeeling = (bodyFeelingNote || '').trim();
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

export const saveCheckin = async (
    telegramUserId: number,
    methodIds: number[],
    practiceNote: string,
    checkinDate: unknown,
    locale: Locale = 'zh_TW'
) => {
    if (methodIds.length === 0) {
        throw new Error('At least one practice method must be selected');
    }
    const normalizedPracticeNote = practiceNote.trim();
    if (normalizedPracticeNote.length > MAX_PRACTICE_NOTE_LENGTH) {
        throw new Error(`Practice note must be ${MAX_PRACTICE_NOTE_LENGTH} characters or fewer`);
    }

    const settings = await getPracticeTimezoneSettings(telegramUserId);
    const target = validateCheckinDate(checkinDate, settings);
    if (!settings.confirmed && target.entryKind === 'makeup') throw new Error('Confirm your practice timezone before making up yesterday');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');
        await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1::text), $2::int)',
            [String(telegramUserId), Number(target.checkinDate.replaceAll('-', ''))]
        );

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
            `SELECT id, entry_kind, practice_timezone
             FROM telegram_checkin_logs
             WHERE telegram_user_id = $1 AND checkin_date = $2`,
            [telegramUserId, target.checkinDate]
        );

        let checkinLogId: number;
        let alreadyCheckedIn = false;
        let entryKind = target.entryKind;
        let practiceTimezone = settings.practiceTimezone;

        if (existing.rows.length > 0) {
            alreadyCheckedIn = true;
            checkinLogId = existing.rows[0].id;
            entryKind = existing.rows[0].entry_kind === 'makeup' ? 'makeup' : 'regular';
            practiceTimezone = existing.rows[0].practice_timezone || practiceTimezone;

            await client.query(
                 `UPDATE telegram_checkin_logs
                 SET practice_note = $1,
                     reflection_note = $1,
                     body_feeling_note = NULL,
                      note = $2,
                      source = 'webapp',
                      practice_timezone = COALESCE(practice_timezone, $4),
                     updated_at = CURRENT_TIMESTAMP
                  WHERE id = $3`,
                [normalizedPracticeNote || null, note || null, checkinLogId, practiceTimezone]
            );

            await client.query(
                `DELETE FROM telegram_checkin_method_selections
                 WHERE checkin_log_id = $1`,
                [checkinLogId]
            );
        } else {
            const inserted = await client.query(
                `INSERT INTO telegram_checkin_logs
                    (telegram_user_id, checkin_date, practice_note, reflection_note, body_feeling_note, note, source, entry_kind, practice_timezone)
                 VALUES ($1, $2, $3, $3, NULL, $4, 'webapp', $5, $6)
                 RETURNING id`,
                [telegramUserId, target.checkinDate, normalizedPracticeNote || null, note || null, target.entryKind, settings.practiceTimezone]
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
            date: target.checkinDate,
            checkinLogId,
            alreadyCheckedIn,
            selectedMethods: methodNames,
            selectedMethodCodes: methodRows.rows.map((row) => row.code),
            entryKind,
            practiceTimezone
        };
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

export const saveTodayCheckin = async (telegramUserId: number, methodIds: number[], practiceNote: string, locale: Locale = 'zh_TW') =>
    saveCheckin(telegramUserId, methodIds, practiceNote, undefined, locale);
