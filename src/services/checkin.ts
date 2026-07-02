import moment from 'moment-timezone';
import { db } from '../db';
import { TelegramWebAppUser } from '../utils/telegramWebApp';
import { PracticeMethod, getPracticeMethodRows, buildPracticeMethodTree } from './taxonomy';
import { normalizeSelectedLeafIds } from './taxonomy';

const TIMEZONE = 'Asia/Taipei';

export interface TodayCheckinResponse {
    date: string;
    alreadyCheckedIn: boolean;
    checkinLogId: number | null;
    selectedMethodIds: number[];
    reflectionNote: string;
    bodyFeelingNote: string;
}

export const upsertTelegramUser = async (user: TelegramWebAppUser) => {
    await db.query(
        `INSERT INTO telegram_users (telegram_user_id, username, first_name, last_name, language_code)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (telegram_user_id) DO UPDATE SET
             username = EXCLUDED.username,
             first_name = EXCLUDED.first_name,
             last_name = EXCLUDED.last_name,
             language_code = EXCLUDED.language_code,
             updated_at = CURRENT_TIMESTAMP`,
        [user.id, user.username || null, user.first_name || null, user.last_name || null, user.language_code || null]
    );
};

export const getPracticeMethods = async (): Promise<PracticeMethod[]> => {
    return buildPracticeMethodTree(await getPracticeMethodRows());
};

export const getTodayCheckin = async (telegramUserId: number): Promise<TodayCheckinResponse> => {
    const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');

    const { rows } = await db.query(
        `SELECT id, reflection_note, body_feeling_note
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
            reflectionNote: '',
            bodyFeelingNote: ''
        };
    }

    const checkin = rows[0];
    const practiceMethodRows = await getPracticeMethodRows();
    const selected = await db.query(
        `SELECT practice_method_id
         FROM telegram_checkin_method_selections
         WHERE checkin_log_id = $1
         ORDER BY practice_method_id ASC`,
        [checkin.id]
    );

    return {
        date: today,
        alreadyCheckedIn: true,
        checkinLogId: checkin.id,
        selectedMethodIds: normalizeSelectedLeafIds(selected.rows.map((r) => r.practice_method_id), practiceMethodRows),
        reflectionNote: checkin.reflection_note || '',
        bodyFeelingNote: checkin.body_feeling_note || ''
    };
};

const buildLegacyNote = (methodNames: string[], reflectionNote: string, bodyFeelingNote: string) => {
    const parts: string[] = [];
    if (methodNames.length > 0) {
        parts.push(`功法：${methodNames.join('、')}`);
    }
    if (reflectionNote.trim()) {
        parts.push(`心得：${reflectionNote.trim()}`);
    }
    if (bodyFeelingNote.trim()) {
        parts.push(`身體感受：${bodyFeelingNote.trim()}`);
    }
    return parts.join('；');
};

export const saveTodayCheckin = async (telegramUserId: number, methodIds: number[], reflectionNote: string, bodyFeelingNote: string) => {
    if (methodIds.length === 0) {
        throw new Error('At least one practice method must be selected');
    }

    const today = moment().tz(TIMEZONE).format('YYYY-MM-DD');
    const client = await db.getClient();

    try {
        await client.query('BEGIN');

        const methodRows = await client.query(
            `SELECT id, code, name_zh, method_type
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

        const methodNames = methodRows.rows.map((row) => row.name_zh);
        const note = buildLegacyNote(methodNames, reflectionNote, bodyFeelingNote);

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
                 SET reflection_note = $1,
                     body_feeling_note = $2,
                     note = $3,
                     source = 'webapp',
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4`,
                [reflectionNote || null, bodyFeelingNote || null, note || null, checkinLogId]
            );

            await client.query(
                `DELETE FROM telegram_checkin_method_selections
                 WHERE checkin_log_id = $1`,
                [checkinLogId]
            );
        } else {
            const inserted = await client.query(
                `INSERT INTO telegram_checkin_logs (telegram_user_id, checkin_date, reflection_note, body_feeling_note, note, source)
                 VALUES ($1, $2, $3, $4, $5, 'webapp')
                 RETURNING id`,
                [telegramUserId, today, reflectionNote || null, bodyFeelingNote || null, note || null]
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
