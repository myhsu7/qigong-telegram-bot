export const supportedLocales = ['zh_TW', 'zh_CN', 'en'] as const;
export type Locale = typeof supportedLocales[number];

export const normalizeLocale = (value?: string | null): Locale => {
    const normalized = (value || '').trim().replace(/_/g, '-').toLowerCase();
    if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
    if (/^zh-(hans|cn|sg)(-|$)/.test(normalized)) return 'zh_CN';
    if (normalized === 'zh-cn' || normalized === 'zh-sg') return 'zh_CN';
    return 'zh_TW';
};

export const isLocale = (value: unknown): value is Locale =>
    typeof value === 'string' && supportedLocales.includes(value as Locale);

export const localeTag = (locale: Locale) => ({ zh_TW: 'zh-Hant', zh_CN: 'zh-Hans', en: 'en' })[locale];

export const methodName = (
    method: { nameZh: string; nameZhCn?: string | null; nameEn?: string | null },
    locale: Locale
) => locale === 'en'
    ? (method.nameEn || method.nameZh)
    : locale === 'zh_CN'
        ? (method.nameZhCn || method.nameZh)
        : method.nameZh;

export const botText = {
    zh_TW: {
        privateOnly: '請到 Bot 私人聊天室使用此功能。',
        checkinButton: '✅ 開始打卡', leaderboardButton: '🏆 排行榜', achievementsButton: '🏮 開啟成就頁', analysisButton: '📈 功法分析',
        openCheckin: '請點下方按鈕開啟打卡表單。', openAchievements: '請點下方按鈕開啟你的成就頁。', openAnalysis: '請點下方按鈕查看你的 30／90 天功法分析與練功點評。',
        welcome: '歡迎使用氣功打卡小幫手（Telegram 版）！\n\n你可以直接使用下方四個主要入口：\n1. ✅ 打卡\n2. 🏆 排行榜\n3. 🏮 成就頁\n4. 📈 功法分析\n\n每天練功、每天記錄，穩穩累積你的功力與成就。',
        groupWelcome: '歡迎使用氣功打卡小幫手！請到 Bot 私人聊天室使用 /start 開啟完整功能選單。',
        languagePrompt: '請選擇介面語言：', languageSaved: '介面語言已更新為繁體中文。'
    },
    zh_CN: {
        privateOnly: '请到 Bot 私人聊天使用此功能。',
        checkinButton: '✅ 开始打卡', leaderboardButton: '🏆 排行榜', achievementsButton: '🏮 打开成就页', analysisButton: '📈 功法分析',
        openCheckin: '请点击下方按钮打开打卡表单。', openAchievements: '请点击下方按钮打开你的成就页。', openAnalysis: '请点击下方按钮查看你的 30／90 天功法分析与练功点评。',
        welcome: '欢迎使用气功打卡小助手（Telegram 版）！\n\n你可以直接使用下方四个主要入口：\n1. ✅ 打卡\n2. 🏆 排行榜\n3. 🏮 成就页\n4. 📈 功法分析\n\n每天练功、每天记录，稳步积累你的功力与成就。',
        groupWelcome: '欢迎使用气功打卡小助手！请到 Bot 私人聊天使用 /start 打开完整功能菜单。',
        languagePrompt: '请选择界面语言：', languageSaved: '界面语言已更新为简体中文。'
    },
    en: {
        privateOnly: 'Please use this feature in a private chat with the bot.',
        checkinButton: '✅ Start check-in', leaderboardButton: '🏆 Leaderboard', achievementsButton: '🏮 Achievements', analysisButton: '📈 Practice analysis',
        openCheckin: 'Tap the button below to open today’s check-in.', openAchievements: 'Tap the button below to view your achievements.', openAnalysis: 'Tap the button below to view your 30/90-day practice analysis and guidance.',
        welcome: 'Welcome to the Qigong Check-in Companion on Telegram!\n\nUse the four main options below:\n1. ✅ Check in\n2. 🏆 Leaderboard\n3. 🏮 Achievements\n4. 📈 Practice analysis\n\nPractice and record each day to build steady progress.',
        groupWelcome: 'Welcome to the Qigong Check-in Companion! Open a private chat with the bot and use /start for the full menu.',
        languagePrompt: 'Choose your interface language:', languageSaved: 'Interface language updated to English.'
    }
} as const;

const badgeNames: Record<string, Record<Locale, [string, string]>> = {
    streak_3: { zh_TW: ['入門', '連續打卡 3 天'], zh_CN: ['入门', '连续打卡 3 天'], en: ['First Steps', 'Checked in for 3 consecutive days'] },
    streak_7: { zh_TW: ['小成', '連續打卡 7 天'], zh_CN: ['小成', '连续打卡 7 天'], en: ['Early Progress', 'Checked in for 7 consecutive days'] },
    streak_21: { zh_TW: ['結丹', '連續打卡 21 天'], zh_CN: ['结丹', '连续打卡 21 天'], en: ['Inner Foundation', 'Checked in for 21 consecutive days'] },
    streak_100: { zh_TW: ['百日築基', '連續打卡 100 天'], zh_CN: ['百日筑基', '连续打卡 100 天'], en: ['Hundred-Day Foundation', 'Checked in for 100 consecutive days'] },
    total_10: { zh_TW: ['初芽', '總計打卡 10 天'], zh_CN: ['初芽', '累计打卡 10 天'], en: ['First Sprout', 'Completed 10 total check-in days'] },
    total_100: { zh_TW: ['大樹', '總計打卡 100 天'], zh_CN: ['大树', '累计打卡 100 天'], en: ['Flourishing Tree', 'Completed 100 total check-in days'] },
    time_morning: { zh_TW: ['晨露', '連續 5 天在早上 5:00 - 7:00 打卡'], zh_CN: ['晨露', '连续 5 天在早上 5:00 - 7:00 打卡'], en: ['Morning Dew', 'Checked in between 5:00 and 7:00 AM for 5 consecutive days'] },
    time_night: { zh_TW: ['夜靜', '連續 5 天在晚上 9:00 - 11:00 打卡'], zh_CN: ['夜静', '连续 5 天在晚上 9:00 - 11:00 打卡'], en: ['Quiet Night', 'Checked in between 9:00 and 11:00 PM for 5 consecutive days'] },
    seasonal_summer_27: { zh_TW: ['夏練三伏', '於當年三伏期間完成全程打卡'], zh_CN: ['夏练三伏', '在当年三伏期间完成全程打卡'], en: ['Summer Sanfu Practice', 'Completed every check-in during the annual Sanfu period'] },
    seasonal_winter_27: { zh_TW: ['冬練三九', '冬至過後，連續打卡 27 天，且練習龜壽功'], zh_CN: ['冬练三九', '冬至过后连续打卡 27 天，并练习龟寿功'], en: ['Winter Sanjiu Practice', 'Checked in for 27 days after the winter solstice while practicing Longevity Guishou'] }
};

const badgeMethodNames: Record<string, Record<Locale, string>> = {
    dayan: { zh_TW: '大雁功', zh_CN: '大雁功', en: 'EnerQi Dayan' },
    wuqinxi: { zh_TW: '五禽戲', zh_CN: '五禽戏', en: 'Five Animal Frolics Wuqinxi' },
    huichun: { zh_TW: '回春功', zh_CN: '回春功', en: 'YoungQi Huichun' },
    guishou: { zh_TW: '龜壽功', zh_CN: '龟寿功', en: 'Longevity Guishou' },
    zhengyang: { zh_TW: '正陽功', zh_CN: '正阳功', en: 'VitalQi' },
    huanghai: { zh_TW: '神奇晃海功', zh_CN: '神奇晃海功', en: 'FlowQi-Neuro' },
    lotus: { zh_TW: '蓮花養心法', zh_CN: '莲花养心法', en: 'LotusQi' },
    heqi: { zh_TW: '和氣舒壓法', zh_CN: '和气舒压法', en: 'HarmonyQi' },
    sanwo: { zh_TW: '三窩功', zh_CN: '三窝功', en: 'Sanwo Gong' },
    liuyin: { zh_TW: '六音理臟法', zh_CN: '六音理脏法', en: 'DetoxQi Liuyin' },
    jinggong: { zh_TW: '靜功', zh_CN: '静功', en: 'Quiet Practice' }
};

export const localizeBadge = <T extends { id?: string; name: string; description?: string | null }>(badge: T, locale: Locale): T => {
    if (locale === 'zh_TW') return badge;
    const id = badge.id || '';
    const fixed = badgeNames[id]?.[locale];
    if (fixed) return { ...badge, name: fixed[0], description: fixed[1] };

    const methodMatch = id.match(/^method_(.+)_(7|30|100)$/);
    if (methodMatch) {
        const name = badgeMethodNames[methodMatch[1]]?.[locale];
        const days = methodMatch[2];
        if (name) return {
            ...badge,
            name: locale === 'en' ? `${name} | ${days}-Day Milestone` : locale === 'zh_CN' ? `${name}｜累计 ${days} 天` : `${name}｜累計 ${days} 天`,
            description: locale === 'en' ? `Practiced ${name} on ${days} days` : locale === 'zh_CN' ? `累计练习「${name}」${days} 天` : `累計練習「${name}」${days} 天`
        };
    }

    const comboMatch = id.match(/^combo_(.+)$/);
    if (comboMatch) {
        const name = badgeMethodNames[comboMatch[1]]?.[locale];
        if (name) return {
            ...badge,
            name: locale === 'en' ? `${name} Complete Set` : `${name}全套完成`,
            description: locale === 'en' ? `Completed every form of ${name} on the same day. Unlockable again each year.` : `同日完成“${name}”全套功法，每年可重新解锁`
        };
    }
    return badge;
};
