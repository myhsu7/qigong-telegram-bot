import { db } from '../db';

export interface PracticeMethodRow {
    id: number;
    code: string;
    nameZh: string;
    nameEn: string | null;
    estimatedMinutes: number | null;
    sortOrder: number;
    parentId: number | null;
    methodType: 'group' | 'leaf';
}

export interface PracticeMethod extends Omit<PracticeMethodRow, 'sortOrder'> {
    children: PracticeMethod[];
}

export interface MethodTaxonomy {
    rows: PracticeMethodRow[];
    tree: PracticeMethod[];
    rowById: Map<number, PracticeMethodRow>;
    parentByLeafId: Map<number, PracticeMethodRow>;
    leafIdsByParentId: Map<number, number[]>;
    leafCodesByParentCode: Map<string, string[]>;
}

const toPracticeMethodRow = (row: {
    id: number;
    code: string;
    name_zh: string;
    name_en: string | null;
    estimated_minutes: number | null;
    sort_order: number;
    parent_id: number | null;
    method_type: string | null;
}): PracticeMethodRow => ({
    id: row.id,
    code: row.code,
    nameZh: row.name_zh,
    nameEn: row.name_en,
    estimatedMinutes: row.estimated_minutes,
    sortOrder: row.sort_order,
    parentId: row.parent_id,
    methodType: row.method_type === 'group' ? 'group' : 'leaf'
});

export const getPracticeMethodRows = async (): Promise<PracticeMethodRow[]> => {
    const { rows } = await db.queryWithRetry(
        `SELECT id, code, name_zh, name_en, estimated_minutes, sort_order, parent_id, method_type
         FROM practice_methods
         WHERE is_active = TRUE
         ORDER BY sort_order ASC, id ASC`
    );

    return rows.map(toPracticeMethodRow);
};

export const buildPracticeMethodTree = (rows: PracticeMethodRow[]): PracticeMethod[] => {
    const methodMap = new Map<number, PracticeMethod>();

    rows.forEach((row) => {
        methodMap.set(row.id, {
            id: row.id,
            code: row.code,
            nameZh: row.nameZh,
            nameEn: row.nameEn,
            estimatedMinutes: row.estimatedMinutes,
            parentId: row.parentId,
            methodType: row.methodType,
            children: []
        });
    });

    const roots: PracticeMethod[] = [];
    rows.forEach((row) => {
        const method = methodMap.get(row.id);
        if (!method) return;

        if (row.parentId) {
            const parent = methodMap.get(row.parentId);
            if (parent) {
                parent.children.push(method);
                return;
            }
        }

        roots.push(method);
    });

    return roots;
};

export const buildMethodTaxonomy = (rows: PracticeMethodRow[]): MethodTaxonomy => {
    const rowById = new Map<number, PracticeMethodRow>();
    const parentByLeafId = new Map<number, PracticeMethodRow>();
    const leafIdsByParentId = new Map<number, number[]>();
    const leafCodesByParentCode = new Map<string, string[]>();

    rows.forEach((row) => {
        rowById.set(row.id, row);
    });

    rows.forEach((row) => {
        if (row.methodType !== 'leaf' || !row.parentId) return;

        const parent = rowById.get(row.parentId);
        if (!parent) return;

        parentByLeafId.set(row.id, parent);
        leafIdsByParentId.set(parent.id, [...(leafIdsByParentId.get(parent.id) || []), row.id]);
        leafCodesByParentCode.set(parent.code, [...(leafCodesByParentCode.get(parent.code) || []), row.code]);
    });

    return {
        rows,
        tree: buildPracticeMethodTree(rows),
        rowById,
        parentByLeafId,
        leafIdsByParentId,
        leafCodesByParentCode
    };
};

export const getMethodTaxonomy = async (): Promise<MethodTaxonomy> => {
    return buildMethodTaxonomy(await getPracticeMethodRows());
};

export const normalizeSelectedLeafIds = (selectedIds: number[], rows: PracticeMethodRow[]): number[] => {
    const { leafIdsByParentId, rowById } = buildMethodTaxonomy(rows);
    const normalized = new Set<number>();

    selectedIds.forEach((selectedId) => {
        const method = rowById.get(selectedId);
        if (!method) return;

        if (method.methodType === 'group') {
            (leafIdsByParentId.get(method.id) || []).forEach((leafId) => normalized.add(leafId));
            return;
        }

        normalized.add(method.id);
    });

    return Array.from(normalized.values());
};

export const getGroupedMethodRowsForLeafIds = (leafIds: number[], taxonomy: MethodTaxonomy): PracticeMethodRow[] => {
    const grouped = new Map<number, PracticeMethodRow>();

    leafIds.forEach((leafId) => {
        const leaf = taxonomy.rowById.get(leafId);
        if (!leaf) return;

        const groupedMethod = taxonomy.parentByLeafId.get(leafId) || leaf;
        grouped.set(groupedMethod.id, groupedMethod);
    });

    return Array.from(grouped.values()).sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.id - b.id;
    });
};

export interface LeafMethodCount {
    methodId: number;
    methodName: string;
    methodCode: string;
    matchedDays: number;
}

export interface GroupedMethodCount extends LeafMethodCount {
    childMethodIds: number[];
}

export const aggregateLeafCountsByGroup = (
    leafCounts: LeafMethodCount[],
    taxonomy: MethodTaxonomy
): GroupedMethodCount[] => {
    const grouped = new Map<number, GroupedMethodCount>();

    leafCounts.forEach((item) => {
        const groupedRow = taxonomy.parentByLeafId.get(item.methodId) || taxonomy.rowById.get(item.methodId);
        if (!groupedRow) return;

        const existing = grouped.get(groupedRow.id);
        if (existing) {
            existing.matchedDays += item.matchedDays;
            existing.childMethodIds.push(item.methodId);
            return;
        }

        grouped.set(groupedRow.id, {
            methodId: groupedRow.id,
            methodCode: groupedRow.code,
            methodName: groupedRow.nameZh,
            matchedDays: item.matchedDays,
            childMethodIds: [item.methodId]
        });
    });

    return Array.from(grouped.values()).sort((a, b) => {
        if (b.matchedDays !== a.matchedDays) return b.matchedDays - a.matchedDays;
        return a.methodName.localeCompare(b.methodName, 'zh-Hant');
    });
};
