import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/community/0001_community.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/community/0002_market_generation_fence.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(query) {
      let values = [];
      return { bind(...args) { values = args; return this; },
        async first() { return sql.prepare(query).get(...values) ?? null; },
        async run() { return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; } };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { for (const statement of statements) await statement.run(); sql.exec('COMMIT'); }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return { sql, db };
}

test('stale generation fence rolls back all sales and checkpoint writes', async () => {
  const { salesGenerationFence } = await import('../functions/lib/community/sales-generation-fence.js');
  const { sql, db } = database();
  sql.prepare("INSERT INTO market_generation_state VALUES (1,'generation-new',2,'active')").run();
  const write = db.prepare("INSERT INTO market_sales VALUES ('event','stall','','diamond',1,2,'2026-01-01T00:00:00Z')");
  const checkpoint = db.prepare("INSERT INTO community_snapshots VALUES ('sales_cursor','old','2026-01-01T00:00:00Z')");
  await assert.rejects(db.batch([salesGenerationFence(db, 'generation-old', 1), write, checkpoint]));
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 0);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM community_snapshots WHERE kind='sales_cursor'").get().n, 0);
});

test('a fenced sales page atomically persists partial coverage, checkpoint and revision', async () => {
  const { buildFencedSalesPage } = await import('../functions/lib/community/sales-generation-fence.js');
  const { sql, db } = database();
  const generation = '4a200000-0000-4000-8000-000000000001';
  sql.prepare("INSERT INTO market_generation_state VALUES (1,?,1,'active')").run(generation);
  const sale = { id: 'market-event', stall: 'stall12', guild: '', item: 'diamond', quantity: 1,
    gold: 2, occurredAt: '2026-01-01T00:00:00Z' };
  const batch = await buildFencedSalesPage(db, { source: 'https://source.example/sales', generation, revision: 1,
    priorCursor: null, page: { generation, checkpointCursor: '1', items: [sale], complete: false } });
  await db.batch(batch);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 1);
  const checkpoint = JSON.parse(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_cursor'").get().payload);
  assert.equal(checkpoint.generation, generation);
  assert.equal(checkpoint.cursor, '1');
  assert.equal(JSON.parse(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_coverage'").get().payload).complete, false);
  assert.equal(sql.prepare('SELECT revision FROM market_generation_state WHERE id=1').get().revision, 2);
});

test('v2 initial page refuses unreconciled legacy sales and checkpoint', async () => {
  const { buildFencedSalesPage } = await import('../functions/lib/community/sales-generation-fence.js');
  const { sql, db } = database();
  const generation = '4a200000-0000-4000-8000-000000000001';
  sql.prepare("INSERT INTO market_generation_state VALUES (1,?,1,'active')").run(generation);
  sql.prepare("INSERT INTO market_sales VALUES ('legacy','stall','','diamond',1,2,'2026-01-01T00:00:00Z')").run();
  const batch = await buildFencedSalesPage(db, { source: 'https://source.example/sales', generation, revision: 1,
    priorCursor: null, page: { generation, checkpointCursor: '1', items: [], complete: false } });
  await assert.rejects(db.batch(batch));
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM community_snapshots WHERE kind='sales_cursor'").get().n, 0);
  assert.equal(sql.prepare('SELECT revision FROM market_generation_state WHERE id=1').get().revision, 1);
});

test('a stale checkpoint rejects the whole page even when the generation revision matches', async () => {
  const { buildFencedSalesPage } = await import('../functions/lib/community/sales-generation-fence.js');
  const { sql, db } = database();
  const generation = '4a200000-0000-4000-8000-000000000001', source = 'https://source.example/sales';
  sql.prepare("INSERT INTO market_generation_state VALUES (1,?,7,'active')").run(generation);
  sql.prepare("INSERT INTO community_snapshots VALUES ('sales_cursor',?,?)")
    .run(JSON.stringify({ source, generation, cursor: '9' }), '2026-01-01T00:00:00Z');
  const sale = { id: 'stale-event', stall: 'stall12', guild: '', item: 'diamond', quantity: 1,
    gold: 2, occurredAt: '2026-01-01T00:00:00Z' };
  const batch = await buildFencedSalesPage(db, { source, generation, revision: 7, priorCursor: '5',
    page: { generation, checkpointCursor: '6', items: [sale], complete: false } });
  await assert.rejects(db.batch(batch));
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 0);
  assert.equal(sql.prepare('SELECT revision FROM market_generation_state WHERE id=1').get().revision, 7);
  assert.equal(JSON.parse(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_cursor'").get().payload).cursor, '9');
});

test('conflicting IDs abort a fenced page and preserve its original checkpoint', async () => {
  const { buildFencedSalesPage } = await import('../functions/lib/community/sales-generation-fence.js');
  const { sql, db } = database();
  const generation = '4a200000-0000-4000-8000-000000000001', source = 'https://source.example/sales';
  sql.prepare("INSERT INTO market_generation_state VALUES (1,?,7,'active')").run(generation);
  sql.prepare("INSERT INTO community_snapshots VALUES ('sales_cursor',?,?)")
    .run(JSON.stringify({ source, generation, cursor: '5' }), '2026-01-01T00:00:00Z');
  const sale = { id: 'same-event', stall: 'stall12', guild: '', item: 'diamond', quantity: 1,
    gold: 2, occurredAt: '2026-01-01T00:00:00Z' };
  const batch = await buildFencedSalesPage(db, { source, generation, revision: 7, priorCursor: '5',
    page: { generation, checkpointCursor: '6', items: [sale], complete: false } });
  sql.prepare('INSERT INTO market_sales VALUES (?,?,?,?,?,?,?)')
    .run(sale.id, sale.stall, sale.guild, sale.item, sale.quantity, 99, sale.occurredAt);
  await assert.rejects(db.batch(batch));
  assert.equal(sql.prepare('SELECT revision FROM market_generation_state WHERE id=1').get().revision, 7);
  assert.equal(JSON.parse(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_cursor'").get().payload).cursor, '5');
  assert.equal(sql.prepare('SELECT gold FROM market_sales WHERE id=?').get(sale.id).gold, 99);
});

test('matching active generation fence permits a transaction and leaves no guard rows', async () => {
  const { salesGenerationFence, clearSalesFenceAssertions } = await import('../functions/lib/community/sales-generation-fence.js');
  const { sql, db } = database();
  sql.prepare("INSERT INTO market_generation_state VALUES (1,'generation-current',7,'active')").run();
  await db.batch([salesGenerationFence(db, 'generation-current', 7),
    db.prepare("INSERT INTO community_snapshots VALUES ('sales_cursor','current','2026-01-01T00:00:00Z')"), clearSalesFenceAssertions(db)]);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM community_snapshots WHERE kind='sales_cursor'").get().n, 1);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_fence_assertion').get().n, 0);
});

test('reconciliation mode and missing state fail closed', async () => {
  const { salesGenerationFence } = await import('../functions/lib/community/sales-generation-fence.js');
  const { sql, db } = database();
  await assert.rejects(db.batch([salesGenerationFence(db, 'generation-current', 7)]));
  sql.prepare("INSERT INTO market_generation_state VALUES (1,'generation-current',7,'reconcile')").run();
  await assert.rejects(db.batch([salesGenerationFence(db, 'generation-current', 7)]));
});

test('a committed page advances the fence revision so a competing stale page cannot commit', async () => {
  const { fencedSalesBatch } = await import('../functions/lib/community/sales-generation-fence.js');
  const { sql, db } = database();
  sql.prepare("INSERT INTO market_generation_state VALUES (1,'generation-current',7,'active')").run();
  const page = (id) => db.prepare("INSERT INTO market_sales VALUES (?, 'stall','','diamond',1,2,'2026-01-01T00:00:00Z')").bind(id);
  await db.batch(fencedSalesBatch(db, 'generation-current', 7, [page('first')]));
  await assert.rejects(db.batch(fencedSalesBatch(db, 'generation-current', 7, [page('stale')])));
  assert.equal(sql.prepare('SELECT revision FROM market_generation_state WHERE id=1').get().revision, 8);
  assert.deepEqual(sql.prepare('SELECT id FROM market_sales ORDER BY id').all().map(row => row.id), ['first']);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_fence_assertion').get().n, 0);
});

test('migration keeps legacy sales and checkpoint but creates no active generation', () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/community/0001_community.sql', import.meta.url), 'utf8'));
  sql.prepare("INSERT INTO market_sales VALUES ('legacy','stall','','diamond',1,2,'2026-01-01T00:00:00Z')").run();
  sql.prepare("INSERT INTO community_snapshots VALUES ('sales_cursor','legacy-cursor','2026-01-01T00:00:00Z')").run();
  sql.exec(readFileSync(new URL('../migrations/community/0002_market_generation_fence.sql', import.meta.url), 'utf8'));
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_generation_state').get().n, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 1);
  assert.equal(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_cursor'").get().payload, 'legacy-cursor');
});

test('entering reconciliation marks coverage incomplete and invalidates an in-flight page', async () => {
  const { beginSalesReconciliation, buildFencedSalesPage } = await import('../functions/lib/community/sales-generation-fence.js');
  const { sql, db } = database();
  const generation = '4a200000-0000-4000-8000-000000000001', source = 'https://source.example/sales';
  sql.prepare("INSERT INTO market_generation_state VALUES (1,?,7,'active')").run(generation);
  sql.prepare("INSERT INTO community_snapshots VALUES ('sales_coverage',?,?)")
    .run(JSON.stringify({ complete: true }), '2026-01-01T00:00:00Z');
  const sale = { id: 'stale-event', stall: 'stall12', guild: '', item: 'diamond', quantity: 1,
    gold: 2, occurredAt: '2026-01-01T00:00:00Z' };
  const pending = await buildFencedSalesPage(db, { source, generation, revision: 7, priorCursor: null,
    page: { generation, checkpointCursor: '1', items: [sale], complete: false } });
  await db.batch(beginSalesReconciliation(db, generation, 7));
  await assert.rejects(db.batch(pending));
  const state = sql.prepare('SELECT mode,revision FROM market_generation_state WHERE id=1').get();
  assert.equal(state.mode, 'reconcile');
  assert.equal(state.revision, 8);
  assert.equal(JSON.parse(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_coverage'").get().payload).complete, false);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 0);
});

test('stale reconciliation request cannot change coverage or state', async () => {
  const { beginSalesReconciliation } = await import('../functions/lib/community/sales-generation-fence.js');
  const { sql, db } = database();
  sql.prepare("INSERT INTO market_generation_state VALUES (1,'current',8,'active')").run();
  await assert.rejects(db.batch(beginSalesReconciliation(db, 'current', 7)));
  assert.equal(sql.prepare('SELECT mode FROM market_generation_state WHERE id=1').get().mode, 'active');
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM community_snapshots WHERE kind='sales_coverage'").get().n, 0);
});
