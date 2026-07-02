INSERT INTO telegram_badges (id, name, emoji, description, category) VALUES
    ('combo_dayan', '大雁雙修', '🦢', '同日練習大雁初與大雁高，可於每年重新解鎖', 'COMBO'),
    ('combo_wuqinxi', '五禽圓滿', '🐅', '同日完成五禽戲全套五式，可於每年重新解鎖', 'COMBO'),
    ('combo_huichun', '回春雙式', '🌱', '同日練習回春初與回春中，可於每年重新解鎖', 'COMBO'),
    ('combo_guishou', '龜壽全式', '🐢', '同日完成龜壽功全套三式，可於每年重新解鎖', 'COMBO'),
    ('combo_zhengyang', '正陽雙照', '☀️', '同日練習晨功與夜功，可於每年重新解鎖', 'COMBO'),
    ('combo_jinggong', '靜功雙法', '🧘', '同日練習周天靜功與七星心法，可於每年重新解鎖', 'COMBO')
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    emoji = EXCLUDED.emoji,
    description = EXCLUDED.description,
    category = EXCLUDED.category;
