import assert from 'node:assert/strict';
import { localizeBadge, methodName, normalizeLocale } from '../src/i18n';

assert.equal(normalizeLocale('zh-Hans'), 'zh_CN');
assert.equal(normalizeLocale('zh_CN'), 'zh_CN');
assert.equal(normalizeLocale('zh-SG'), 'zh_CN');
assert.equal(normalizeLocale('zh-Hant'), 'zh_TW');
assert.equal(normalizeLocale('zh-TW'), 'zh_TW');
assert.equal(normalizeLocale('en-US'), 'en');
assert.equal(normalizeLocale('fr'), 'zh_TW');

const method = { nameZh: '大雁功', nameZhCn: '大雁功', nameEn: 'EnerQi Dayan' };
assert.equal(methodName(method, 'zh_TW'), '大雁功');
assert.equal(methodName(method, 'zh_CN'), '大雁功');
assert.equal(methodName(method, 'en'), 'EnerQi Dayan');

const badge = { id: 'method_dayan_30', name: '大雁功｜雁翥沖虛', description: '累計練習「大雁功」30 天' };
assert.equal(localizeBadge(badge, 'en').name, 'EnerQi Dayan | 30-Day Milestone');
assert.equal(localizeBadge(badge, 'zh_CN').description, '累计练习「大雁功」30 天');

console.log('i18n tests passed');
