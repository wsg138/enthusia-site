import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

function database() {
  const sql = new DatabaseSync(':memory:');
  for (const file of ['0001_community.sql', '0002_market_generation_fence.sql']) {
    sql.exec(readFileSync(new URL(`../migrations/community/${file}`, import.meta.url), 'utf8'));
  }
  const db = {
    prepare(query) { let values = []; return {
      bind(...args) { values = args; return this; },
      async first() { return sql.prepare(query).get(...values) ?? null; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; },
    }; },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const results=[]; for(const statement of statements) results.push(await statement.run()); sql.exec('COMMIT'); return results; }
      catch(error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return { sql, db };
}
const generation = '4a200000-0000-4000-8000-000000000001';
const source = 'https://source.example/sales';

test('v2 sends both Access headers and the Market bearer only to the configured route', async () => {
  const { readSalesV2 } = await import('../functions/lib/community/upstream.js');
  const config = { COMMUNITY_SALES_API_URL: source, COMMUNITY_SALES_API_TOKEN: 'market-token',
    COMMUNITY_SALES_ACCESS_CLIENT_ID: 'test-client', COMMUNITY_SALES_ACCESS_CLIENT_SECRET: 'test-secret' };
  const fetchImpl = async (url, options) => {
    assert.equal(url.href, source + '?protocol=2');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.authorization, 'Bearer market-token');
    assert.equal(options.headers['CF-Access-Client-Id'], 'test-client');
    assert.equal(options.headers['CF-Access-Client-Secret'], 'test-secret');
    return Response.json({ protocol: 2, generation });
  };
  assert.deepEqual(await readSalesV2(config, fetchImpl), { generation });
  let called = false;
  const partial = { ...config, COMMUNITY_SALES_ACCESS_CLIENT_SECRET: undefined };
  assert.equal(await readSalesV2(partial, () => { called = true; }), null);
  assert.equal(called, false);
});
const env = db => ({ COMMUNITY_DB: db, COMMUNITY_SALES_API_URL: source, COMMUNITY_SALES_API_TOKEN: 'test-token' });

test('candidate commits an authenticated discovered page with a generation-bound checkpoint', async () => {
  const { synchronizeSalesV2 } = await import('../functions/lib/community/v2-sales-sync.js');
  const { sql, db } = database();
  sql.prepare("INSERT INTO market_generation_state VALUES (1,?,1,'active')").run(generation);
  const requests = [];
  const fetchImpl = async url => {
    requests.push(url.search);
    return Response.json(url.search === '?protocol=2' ? { protocol: 2, generation } : {
      protocol: 2, generation, items: [{ id: 'market-event', stall: 'stall12', guild: '', item: 'diamond',
        quantity: 1, gold: 2, occurredAt: '2026-01-01T00:00:00Z', direction: 'SELL', currency: 'RAW_GOLD' }],
      nextCursor: null, checkpointCursor: '1', complete: false });
  };
  const result = await synchronizeSalesV2(env(db), fetchImpl);
  assert.equal(result.status, 'updated');
  assert.deepEqual(requests, ['?protocol=2', `?protocol=2&after=0&generation=${generation}`]);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 1);
  const checkpoint = JSON.parse(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_cursor'").get().payload);
  assert.deepEqual(checkpoint, { source, generation, cursor: '1' });
  assert.equal(JSON.parse(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_coverage'").get().payload).complete, false);
});

test('candidate fails closed for a changed generation or an unreconciled legacy checkpoint', async () => {
  const { synchronizeSalesV2 } = await import('../functions/lib/community/v2-sales-sync.js');
  const { sql, db } = database();
  sql.prepare("INSERT INTO market_generation_state VALUES (1,?,1,'active')").run(generation);
  const other = '4a200000-0000-4000-8000-000000000002';
  const mismatch = await synchronizeSalesV2(env(db), async () => Response.json({ protocol: 2, generation: other }));
  assert.equal(mismatch.status, 'reconcile_required');
  sql.prepare("INSERT INTO community_snapshots VALUES ('sales_cursor',?,?)")
    .run(JSON.stringify({ source, cursor: '9' }), '2026-01-01T00:00:00Z');
  const legacy = await synchronizeSalesV2(env(db), async () => Response.json({ protocol: 2, generation }));
  assert.equal(legacy.status, 'reconcile_required');
  assert.equal(sql.prepare('SELECT revision FROM market_generation_state WHERE id=1').get().revision, 1);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 0);
});

test('candidate rolls back a page if reconciliation begins while its producer response is in flight', async () => {
  const { synchronizeSalesV2 } = await import('../functions/lib/community/v2-sales-sync.js');
  const { sql, db } = database();
  sql.prepare("INSERT INTO market_generation_state VALUES (1,?,1,'active')").run(generation);
  const fetchImpl = async url => {
    if (url.search === '?protocol=2') return Response.json({ protocol: 2, generation });
    sql.prepare("UPDATE market_generation_state SET mode='reconcile',revision=2 WHERE id=1").run();
    return Response.json({ protocol: 2, generation, items: [{ id: 'market-event', stall: 'stall12', guild: '', item: 'diamond',
      quantity: 1, gold: 2, occurredAt: '2026-01-01T00:00:00Z', direction: 'SELL', currency: 'RAW_GOLD' }],
    nextCursor: null, checkpointCursor: '1', complete: false });
  };
  assert.equal((await synchronizeSalesV2(env(db), fetchImpl)).status, 'failed');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 0);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM community_snapshots WHERE kind='sales_cursor'").get().n, 0);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM community_snapshots WHERE kind='sales_coverage'").get().n, 0);
});

test('candidate refuses to start with pre-existing legacy sales even without a checkpoint', async () => {
  const { synchronizeSalesV2 } = await import('../functions/lib/community/v2-sales-sync.js');
  const { sql, db } = database();
  sql.prepare("INSERT INTO market_generation_state VALUES (1,?,1,'active')").run(generation);
  sql.prepare("INSERT INTO market_sales VALUES ('legacy','stall','','diamond',1,2,'2026-01-01T00:00:00Z')").run();
  const fetchImpl = async url => Response.json(url.search === '?protocol=2' ? { protocol: 2, generation } :
    { protocol: 2, generation, items: [], nextCursor: null, checkpointCursor: '0', complete: false });
  assert.equal((await synchronizeSalesV2(env(db), fetchImpl)).status, 'failed');
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 1);
  assert.equal(sql.prepare('SELECT revision FROM market_generation_state WHERE id=1').get().revision, 1);
});
