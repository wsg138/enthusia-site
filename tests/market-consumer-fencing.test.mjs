import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runCommunitySync } from '../cloudflare/community-sync/index.js';
import { readSalesV2 } from '../functions/lib/community/upstream.js';
import { handleCommunity } from '../functions/lib/community/service.js';

function database() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../migrations/community/0001_community.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/community/0002_market_generation_fence.sql', import.meta.url), 'utf8'));
  sql.exec(readFileSync(new URL('../migrations/community/0003_weekly_stall_awards.sql', import.meta.url), 'utf8'));
  const db = {
    prepare(query) {
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async first() { return sql.prepare(query).get(...values) ?? null; },
        async all() { return { results: sql.prepare(query).all(...values) }; },
        async run() { return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; },
      };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sql.exec('COMMIT');
        return results;
      } catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return { sql, db };
}

test('a conflicting sale inserted after validation does not commit the page checkpoint', async () => {
  const { sql, db } = database();
  const occurredAt = new Date(Date.now() - 60_000).toISOString();
  const sale = { id: 'market-event', stall: 'stall12', guild: '', item: 'diamond', quantity: 1,
    gold: 20, occurredAt, direction: 'SELL', currency: 'RAW_GOLD' };
  const originalBatch = db.batch;
  let injected = false;
  db.batch = async (statements) => {
    if (!injected) {
      injected = true;
      sql.prepare('INSERT INTO market_sales(id,stall,guild,item,quantity,gold,occurred_at) VALUES (?,?,?,?,?,?,?)')
        .run(sale.id, sale.stall, sale.guild, sale.item, sale.quantity, 99, occurredAt);
    }
    return originalBatch(statements);
  };
  const env = { COMMUNITY_DB: db, COMMUNITY_SYNC_ENABLED: 'true', COMMUNITY_SALES_API_URL: 'https://source.example/sales' };
  const result = await runCommunitySync(env, async () => Response.json({ items: [sale], nextCursor: null,
    checkpointCursor: '1', complete: false }));
  assert.equal(result.results.at(-1).status, 'failed');
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM community_snapshots WHERE kind='sales_cursor'").get().n, 0);
  assert.equal(sql.prepare('SELECT gold FROM market_sales WHERE id=?').get(sale.id).gold, 99);
});

test('scheduled v2 sales do not poll until a generation is active', async () => {
  const { sql, db } = database();
  const generation = '4a200000-0000-4000-8000-000000000001';
  const requests = [];
  const env = { COMMUNITY_DB: db, COMMUNITY_SYNC_ENABLED: 'true', COMMUNITY_SALES_PROTOCOL: '2',
    COMMUNITY_SALES_API_URL: 'https://source.example/sales' };
  const result = await runCommunitySync(env, async (url) => {
    requests.push(url.search);
    if (url.search === '?protocol=2') return Response.json({ protocol: 2, generation });
    if (url.search === `?protocol=2&after=0&generation=${generation}`) {
      return Response.json({ protocol: 2, generation, items: [], nextCursor: null, checkpointCursor: '0', complete: false });
    }
    return new Response('unexpected request', { status: 400 });
  });
  assert.deepEqual(requests, []);
  assert.equal(result.results.at(-1).status, 'reconcile_required');
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM community_snapshots WHERE kind='sales_cursor'").get().n, 0);
});

test('scheduled sales feed the public price tracker without declaring an unverified weekly winner', async () => {
  const { sql, db } = database();
  const generation = '4a200000-0000-4000-8000-000000000001';
  sql.prepare("INSERT INTO market_generation_state VALUES (1,?,0,'active')").run(generation);
  const env = { COMMUNITY_DB: db, COMMUNITY_SYNC_ENABLED: 'true', COMMUNITY_SALES_PROTOCOL: '2',
    COMMUNITY_SALES_API_URL: 'https://source.example/sales', COMMUNITY_SALES_API_TOKEN: 'test-token' };
  const rows = [1, 3].map((quantity, index) => ({
    id: 'market-sale-' + index, item: 'diamond', quantity, gold: index ? 30 : 2,
    stall: 'stall12', guild: '', occurredAt: new Date(Date.now() - 8 * 86400000).toISOString(),
    direction: 'SELL', currency: 'RAW_GOLD',
  }));
  const fetchImpl = async (url, options) => {
    assert.equal(options.headers.authorization, 'Bearer test-token');
    if (url.search === '?protocol=2') return Response.json({ protocol: 2, generation });
    return Response.json({ protocol: 2, generation, items: rows, nextCursor: null, checkpointCursor: '2', complete: false });
  };
  assert.equal((await runCommunitySync(env, fetchImpl)).results.at(-1).records, 2);
  assert.equal((await runCommunitySync(env, fetchImpl)).results.at(-1).records, 0);
  async function read(query) {
    const request = new Request('https://example.com/api/community/insights?' + query);
    const response = await handleCommunity({ request, params: { path: ['insights'] }, env });
    assert.equal(response.status, 200);
    return response.json();
  }
  const prices = await read('item=diamond');
  assert.equal(prices.sales, 2);
  assert.equal(prices.prices[0].price, 8);
  assert.equal(prices.history[0].price, 8);
  assert.equal(prices.coverageComplete, false);
  const award = await read('view=stall-week');
  assert.equal(award.coverageComplete, false);
  assert.equal(award.winner, null);
});

test('v2 does not advance or insert when the producer generation differs from the stored generation', async () => {
  const { sql, db } = database();
  const oldGeneration = '4a200000-0000-4000-8000-000000000001';
  const newGeneration = '4a200000-0000-4000-8000-000000000002';
  const source = 'https://source.example/sales';
  const checkpoint = JSON.stringify({ source, cursor: '5', generation: oldGeneration });
  sql.prepare("INSERT INTO community_snapshots(kind,payload,updated_at) VALUES('sales_cursor',?,?)")
    .run(checkpoint, new Date().toISOString());
  const env = { COMMUNITY_DB: db, COMMUNITY_SYNC_ENABLED: 'true', COMMUNITY_SALES_PROTOCOL: '2', COMMUNITY_SALES_API_URL: source };
  const result = await runCommunitySync(env, async () => Response.json({ protocol: 2, generation: newGeneration }));
  assert.notEqual(result.results.at(-1).status, 'empty');
  assert.equal(sql.prepare("SELECT payload FROM community_snapshots WHERE kind='sales_cursor'").get().payload, checkpoint);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 0);
});

test('v2 transport authenticates discovery and requests the generation-bound first page', async () => {
  const generation = '4a200000-0000-4000-8000-000000000001';
  const requests = [];
  const env = { COMMUNITY_SALES_API_URL: 'https://source.example/sales', COMMUNITY_SALES_API_TOKEN: 'test-token' };
  const fetchImpl = async (url, options) => {
    requests.push([url.search, options.headers.authorization]);
    return Response.json(url.search === '?protocol=2' ? { protocol: 2, generation } :
      { protocol: 2, generation, items: [], nextCursor: null, checkpointCursor: '0', complete: false });
  };
  assert.deepEqual(await readSalesV2(env, fetchImpl), { generation });
  const page = await readSalesV2(env, fetchImpl, Date.now(), generation, '0');
  assert.equal(page?.generation, generation);
  assert.equal(page?.checkpointCursor, '0');
  assert.deepEqual(requests, [['?protocol=2', 'Bearer test-token'],
    [`?protocol=2&after=0&generation=${generation}`, 'Bearer test-token']]);
});

test('v2 transport refuses generation drift, insecure configuration and invalid checkpoints', async () => {
  const generation = '4a200000-0000-4000-8000-000000000001';
  const env = { COMMUNITY_SALES_API_URL: 'https://source.example/sales', COMMUNITY_SALES_API_TOKEN: 'test-token' };
  const changed = async () => Response.json({ protocol: 2, generation: '4a200000-0000-4000-8000-000000000002',
    items: [], nextCursor: null, checkpointCursor: '0', complete: false });
  assert.equal(await readSalesV2(env, changed, Date.now(), generation, '0'), null);
  assert.equal(await readSalesV2({ ...env, COMMUNITY_SALES_API_TOKEN: '' }, changed), null);
  assert.equal(await readSalesV2({ ...env, COMMUNITY_SALES_API_URL: 'https://source.example/sales?x=1' }, changed), null);
  assert.equal(await readSalesV2(env, changed, Date.now(), generation, '9223372036854775808'), null);
});

test('v2 hold rejects signed legacy sales without writing a sale or consuming its nonce', async () => {
  const { sql, db } = database();
  const secret = 's'.repeat(32), time = String(Date.now()), nonce = '0123456789abcdef';
  const payload = { kind: 'sales', items: [{ id: 'market-event', stall: 'stall12', guild: '', item: 'diamond',
    quantity: 1, gold: 20, occurredAt: new Date(Date.now() - 60_000).toISOString() }] };
  const raw = JSON.stringify(payload), encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${time}\n${nonce}\n/api/community/ingest\n${raw}`));
  const signature = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
  const request = new Request('https://example.com/api/community/ingest', { method: 'POST', body: raw,
    headers: { 'x-enthusia-timestamp': time, 'x-enthusia-nonce': nonce, 'x-enthusia-signature': signature } });
  const response = await handleCommunity({ request, params: { path: ['ingest'] },
    env: { COMMUNITY_DB: db, COMMUNITY_INGEST_SECRET: secret, COMMUNITY_SALES_PROTOCOL: '2' } });
  assert.equal(response.status, 503);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM community_nonces').get().n, 0);
});

test('v2 sales hold does not block other authenticated snapshot ingestion', async () => {
  const { sql, db } = database();
  const secret = 's'.repeat(32), time = String(Date.now()), nonce = 'fedcba9876543210';
  const raw = JSON.stringify({ kind: 'bounties', generatedAt: new Date().toISOString(), items: [] });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${time}\n${nonce}\n/api/community/ingest\n${raw}`));
  const signature = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
  const request = new Request('https://example.com/api/community/ingest', { method: 'POST', body: raw,
    headers: { 'x-enthusia-timestamp': time, 'x-enthusia-nonce': nonce, 'x-enthusia-signature': signature } });
  const response = await handleCommunity({ request, params: { path: ['ingest'] },
    env: { COMMUNITY_DB: db, COMMUNITY_INGEST_SECRET: secret, COMMUNITY_SALES_PROTOCOL: '2' } });
  assert.equal(response.status, 200);
  assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM community_snapshots WHERE kind='bounties'").get().n, 1);
});

test('active generation blocks a legacy signed writer even when its environment lacks the v2 flag', async () => {
  const { sql, db } = database();
  sql.exec(readFileSync(new URL('../migrations/community/0002_market_generation_fence.sql', import.meta.url), 'utf8'));
  sql.prepare("INSERT INTO market_generation_state VALUES (1,'4a200000-0000-4000-8000-000000000001',1,'active')").run();
  const secret = 's'.repeat(32), time = String(Date.now()), nonce = '1234567890abcdef';
  const raw = JSON.stringify({ kind: 'sales', items: [{ id: 'legacy-writer', stall: 'stall12', guild: '', item: 'diamond',
    quantity: 1, gold: 20, occurredAt: new Date(Date.now() - 60_000).toISOString() }] });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${time}\n${nonce}\n/api/community/ingest\n${raw}`));
  const signature = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
  const request = new Request('https://example.com/api/community/ingest', { method: 'POST', body: raw,
    headers: { 'x-enthusia-timestamp': time, 'x-enthusia-nonce': nonce, 'x-enthusia-signature': signature } });
  const response = await handleCommunity({ request, params: { path: ['ingest'] }, env: { COMMUNITY_DB: db, COMMUNITY_INGEST_SECRET: secret } });
  assert.equal(response.status, 503);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM community_nonces').get().n, 0);
});

test('a generation activated after legacy validation still rejects the signed sales batch', async () => {
  const { sql, db } = database();
  const secret = 's'.repeat(32), time = String(Date.now()), nonce = 'abcdef1234567890';
  const raw = JSON.stringify({ kind: 'sales', items: [{ id: 'late-transition', stall: 'stall12', guild: '', item: 'diamond',
    quantity: 1, gold: 20, occurredAt: new Date(Date.now() - 60_000).toISOString() }] });
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(`${time}\n${nonce}\n/api/community/ingest\n${raw}`));
  const signature = [...new Uint8Array(bytes)].map(value => value.toString(16).padStart(2, '0')).join('');
  const request = new Request('https://example.com/api/community/ingest', { method: 'POST', body: raw,
    headers: { 'x-enthusia-timestamp': time, 'x-enthusia-nonce': nonce, 'x-enthusia-signature': signature } });
  const originalBatch = db.batch;
  db.batch = async (statements) => {
    sql.prepare("INSERT INTO market_generation_state VALUES (1,'4a200000-0000-4000-8000-000000000001',1,'active')").run();
    return originalBatch(statements);
  };
  const response = await handleCommunity({ request, params: { path: ['ingest'] }, env: { COMMUNITY_DB: db, COMMUNITY_INGEST_SECRET: secret } });
  assert.equal(response.status, 503);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM market_sales').get().n, 0);
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM community_nonces').get().n, 0);
});

test('closed-week player and guild awards are independent and require verified results', async () => {
  const { sql, db } = database();
  const { marketWeekKey } = await import('../public/assets/market/eastern-week.js');
  const week = marketWeekKey(new Date(), -1);
  const representative = '4a200000-0000-4000-8000-000000000001';
  const insert = sql.prepare('INSERT INTO market_weekly_stall_awards VALUES (?, ?, ?, ?, ?)');
  insert.run(week, 'player', 'stall18', 'ExamplePlayer', representative);
  insert.run(marketWeekKey(new Date()), 'guild', 'stall20', 'WrongWeek', representative);
  const read = async view => {
    const request = new Request('https://example.com/api/community/insights?view=' + view);
    return (await handleCommunity({ request, params: { path: ['insights'] }, env: { COMMUNITY_DB: db } })).json();
  };
  assert.deepEqual(await read('stall-week'), { week, coverageComplete: true, winner: {
    name: 'stall18', ownerName: 'ExamplePlayer', representativeUuid: representative,
  } });
  assert.deepEqual(await read('guild-stall-week'), { week, coverageComplete: false, winner: null });
  insert.run(week, 'guild', 'stall69', 'Example Guild', representative);
  assert.equal((await read('guild-stall-week')).winner.ownerName, 'Example Guild');
  sql.prepare("UPDATE market_weekly_stall_awards SET stall_id=NULL,owner_name=NULL,representative_uuid=NULL WHERE week=? AND category='guild'").run(week);
  assert.deepEqual(await read('guild-stall-week'), { week, coverageComplete: true, winner: null });
});
