import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import moment from 'moment-timezone';
import { getPracticeDateWindow, isValidPracticeTimezone, validateCheckinDate } from '../src/services/practiceTimezone';

assert.equal(isValidPracticeTimezone('America/New_York'), true);
assert.equal(isValidPracticeTimezone('Europe/London'), true);
assert.equal(isValidPracticeTimezone('UTC-5'), false);

for (const timezone of ['Asia/Taipei', 'America/Los_Angeles', 'America/New_York', 'Europe/London']) {
    const beforeCutoff = getPracticeDateWindow(timezone, moment.tz('2026-03-08 11:59:59', timezone));
    assert.equal(beforeCutoff.today, '2026-03-08');
    assert.equal(beforeCutoff.yesterday, '2026-03-07');
    assert.equal(beforeCutoff.canMakeupYesterday, true);
    assert.deepEqual(validateCheckinDate('2026-03-07', beforeCutoff), { checkinDate: '2026-03-07', entryKind: 'makeup' });

    const atCutoff = getPracticeDateWindow(timezone, moment.tz('2026-03-08 12:00:00', timezone));
    assert.equal(atCutoff.canMakeupYesterday, false);
    assert.throws(() => validateCheckinDate('2026-03-07', atCutoff), /closed at 12:00/);
    assert.deepEqual(validateCheckinDate(undefined, atCutoff), { checkinDate: '2026-03-08', entryKind: 'regular' });
    assert.throws(() => validateCheckinDate('2026-03-06', atCutoff), /today or an eligible yesterday/);
    assert.throws(() => validateCheckinDate('2026-03-09', atCutoff), /today or an eligible yesterday/);
}

const checkinView = fs.readFileSync(path.join(process.cwd(), 'public/webapp/index.html'), 'utf8');
const apiRoute = fs.readFileSync(path.join(process.cwd(), 'src/routes/api.ts'), 'utf8');
const migration = fs.readFileSync(path.join(process.cwd(), 'migrations/016_makeup_checkins.sql'), 'utf8');
assert.match(checkinView, /id="timezoneCard"/);
assert.match(checkinView, /id="todayTab"/);
assert.match(checkinView, /id="makeupTab"/);
assert.match(checkinView, /checkinDate: selectedDate/);
assert.match(checkinView, /profile\/practice-timezone/);
const achievementsView = fs.readFileSync(path.join(process.cwd(), 'public/webapp/achievements.html'), 'utf8');
assert.match(achievementsView, /profile\.today\.slice\(0, 7\)/);
assert.match(apiRoute, /getCheckinForDate/);
assert.match(apiRoute, /req\.body\?\.checkinDate/);
assert.match(apiRoute, /invalidateLeaderboardCache/);
const badgesService = fs.readFileSync(path.join(process.cwd(), 'src/services/badges.ts'), 'utf8');
assert.match(badgesService, /ON CONFLICT DO NOTHING\s+RETURNING badge_id/);
const checkinService = fs.readFileSync(path.join(process.cwd(), 'src/services/checkin.ts'), 'utf8');
assert.match(checkinService, /if \(!settings\.confirmed && target\.entryKind === 'makeup'\)/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS practice_timezone TEXT/);
assert.match(migration, /ADD COLUMN IF NOT EXISTS entry_kind VARCHAR\(16\)/);
assert.match(migration, /SET practice_timezone = 'Asia\/Taipei'/);
assert.match(migration, /ALTER COLUMN practice_timezone SET NOT NULL/);
assert.match(migration, /CHECK \(entry_kind IN \('regular', 'makeup'\)\)/);
assert.match(migration, /^BEGIN;[\s\S]*COMMIT;\s*$/);

console.log('make-up check-in tests passed');
