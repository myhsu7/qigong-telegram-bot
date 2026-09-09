import assert from 'node:assert/strict';
import { db } from '../src/db';
import { getPracticeMethodRows, invalidatePracticeMethodCache } from '../src/services/taxonomy';
import { createAsyncTtlCache } from '../src/utils/asyncTtlCache';

const main = async () => {
    let now = 100;
    let loads = 0;
    const cache = createAsyncTtlCache(50, () => now);
    const loader = async () => ++loads;
    assert.equal(await cache.get(loader), 1);
    now = 149;
    assert.equal(await cache.get(loader), 1);
    now = 150;
    assert.equal(await cache.get(loader), 2);

    let resolveLoad: ((value: number) => void) | undefined;
    loads = 0;
    const concurrentCache = createAsyncTtlCache<number>(300000);
    const concurrentLoader = () => {
        loads += 1;
        return new Promise<number>((resolve) => { resolveLoad = resolve; });
    };
    const firstLoad = concurrentCache.get(concurrentLoader);
    const secondLoad = concurrentCache.get(concurrentLoader);
    assert.equal(loads, 1);
    resolveLoad?.(7);
    assert.deepEqual(await Promise.all([firstLoad, secondLoad]), [7, 7]);

    concurrentCache.invalidate();
    await assert.rejects(concurrentCache.get(async () => { throw new Error('temporary'); }), /temporary/);
    assert.equal(await concurrentCache.get(async () => 8), 8);

    let resolveStale: ((value: number) => void) | undefined;
    loads = 0;
    const invalidatedCache = createAsyncTtlCache<number>(300000);
    const staleLoad = invalidatedCache.get(() => {
        loads += 1;
        return new Promise<number>((resolve) => { resolveStale = resolve; });
    });
    invalidatedCache.invalidate();
    assert.equal(await invalidatedCache.get(async () => ++loads), 2);
    resolveStale?.(1);
    assert.equal(await staleLoad, 1);
    assert.equal(await invalidatedCache.get(async () => ++loads), 2);

    const originalQuery = db.queryWithRetry;
    let queries = 0;
    (db as { queryWithRetry: typeof db.queryWithRetry }).queryWithRetry = async () => {
        queries += 1;
        return {
            rows: [{ id: 1, code: 'dayan', name_zh: '大雁功', name_zh_cn: '大雁功', name_en: 'Dayan Qigong', estimated_minutes: 20, sort_order: 10, parent_id: null, method_type: 'leaf' }]
        } as Awaited<ReturnType<typeof db.queryWithRetry>>;
    };

    try {
        invalidatePracticeMethodCache();
        const [first, second] = await Promise.all([getPracticeMethodRows(), getPracticeMethodRows()]);
        assert.equal(queries, 1);
        assert.notEqual(first, second);
        first.pop();
        assert.equal(second.length, 1);
        second[0].nameZh = '已修改';
        const third = await getPracticeMethodRows();
        assert.equal(third.length, 1);
        assert.equal(third[0].nameZh, '大雁功');
    } finally {
        invalidatePracticeMethodCache();
        (db as { queryWithRetry: typeof db.queryWithRetry }).queryWithRetry = originalQuery;
    }

    console.log('practice method cache tests passed');
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
