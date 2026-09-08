import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { buildLegacyNote, MAX_PRACTICE_NOTE_LENGTH, mergeLegacyPracticeNotes } from '../src/services/checkin';
import { normalizePracticeFeelingTags } from '../src/services/practiceFeelingTags';

assert.equal(MAX_PRACTICE_NOTE_LENGTH, 2100);
assert.equal(mergeLegacyPracticeNotes('  呼吸穩定\t', '\r\n肩頸放鬆  '), '呼吸穩定\n肩頸放鬆');
assert.equal(mergeLegacyPracticeNotes('calm', 'warm', 'en'), 'calm\nwarm');
assert.equal(mergeLegacyPracticeNotes('平静', '温暖', 'zh_CN'), '平静\n温暖');
assert.equal(mergeLegacyPracticeNotes('\t單一心得\r\n', ''), '單一心得');
assert.equal(mergeLegacyPracticeNotes('', '  單一感受  '), '單一感受');
assert.equal(mergeLegacyPracticeNotes(' \t\r\n', '\n'), '');

assert.equal(buildLegacyNote(['大雁功'], ' 呼吸穩定 '), '功法：大雁功；心得與感受：呼吸穩定');
assert.equal(buildLegacyNote(['大雁功'], 'steady', 'en'), '功法：大雁功；Reflection and sensations: steady');
assert.equal(buildLegacyNote(['大雁功'], '平静', 'zh_CN'), '功法：大雁功；心得与感受：平静');
assert.deepEqual(normalizePracticeFeelingTags([
    { id: 2, nameZh: ' 心神平靜 ', nameZhCn: '心神平静', nameEn: 'Calm', isActive: true },
    { nameZh: '發熱出汗', isActive: false }
]), [
    { id: 2, nameZh: '心神平靜', nameZhCn: '心神平静', nameEn: 'Calm', sortOrder: 10, isActive: true },
    { id: null, nameZh: '發熱出汗', nameZhCn: '', nameEn: '', sortOrder: 20, isActive: false }
]);
assert.throws(() => normalizePracticeFeelingTags([{ nameZh: '重複' }, { nameZh: '重複' }]), /重複/);
assert.throws(() => normalizePracticeFeelingTags([{ id: 1, nameZh: '甲' }, { id: 1, nameZh: '乙' }]), /ID 1 重複/);
assert.throws(() => normalizePracticeFeelingTags([{ nameZh: '甲', nameEn: 'Same' }, { nameZh: '乙', nameEn: 'same' }]), /與其他標籤重複/);

const checkinView = fs.readFileSync(path.join(process.cwd(), 'public/webapp/index.html'), 'utf8');
const apiRoute = fs.readFileSync(path.join(process.cwd(), 'src/routes/api.ts'), 'utf8');
const migration = fs.readFileSync(path.join(process.cwd(), 'migrations/013_telegram_unified_practice_note.sql'), 'utf8');
const backfill = fs.readFileSync(path.join(process.cwd(), 'migrations/014_telegram_backfill_unified_practice_note.sql'), 'utf8');
const feelingTagsMigration = fs.readFileSync(path.join(process.cwd(), 'migrations/015_practice_feeling_tags.sql'), 'utf8');
assert.match(checkinView, /id="practiceNote" maxlength="1000"/);
assert.doesNotMatch(checkinView, /id="reflectionNote"|id="bodyFeelingNote"/);
assert.match(checkinView, /practiceNote: practiceNote\.value/);
assert.match(checkinView, /reflectionNote: practiceNote\.value/);
assert.match(checkinView, /bodyFeelingNote: ''/);
assert.match(checkinView, /id="feelingTags"/);
assert.match(checkinView, /practice-feeling-tags/);
assert.match(checkinView, /toggleFeelingTag/);
assert.match(checkinView, /return \{ tags: \[\] \}/);
assert.match(apiRoute, /typeof req\.body\?\.practiceNote === 'string'/);
assert.match(apiRoute, /getTodayCheckin\(auth\.user\.id, locale\)/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS practice_note TEXT/);
assert.match(migration, /CREATE TRIGGER sync_telegram_practice_note_from_legacy/);
assert.match(migration, /BTRIM\([^)]*, E' \\t\\n\\r'\)/);
assert.doesNotMatch(migration, /UPDATE telegram_checkin_logs/);
assert.match(migration, /^BEGIN;[\s\S]*COMMIT;\s*$/);
assert.match(backfill, /WHERE practice_note IS NULL/);
assert.match(backfill, /SET LOCAL statement_timeout = '0'/);
assert.match(feelingTagsMigration, /CREATE TABLE IF NOT EXISTS telegram_practice_feeling_tags/);
assert.match(feelingTagsMigration, /ON CONFLICT \(code\) DO NOTHING/);
assert.match(feelingTagsMigration, /^BEGIN;[\s\S]*COMMIT;\s*$/);

for (const view of [
    'public/webapp/achievements.html',
    'public/webapp/method-analysis.html',
    'public/admin/journals.html',
    'public/admin/method-analysis.html'
]) {
    const html = fs.readFileSync(path.join(process.cwd(), view), 'utf8');
    assert.match(html, /entry\.practiceNote \|\|/);
    assert.match(html, /white-space:pre-wrap/);
    assert.match(html, /escapeHtml\(practiceNote/);
}

console.log('practice note tests passed');
