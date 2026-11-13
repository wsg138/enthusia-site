import { salesStatements } from './persistence.js';

// These statements must be included in the SAME db.batch as every guarded
// mutation. A failed assertion aborts the entire batch, including earlier work.
export function salesGenerationFence(db, generation, revision) {
  if (typeof generation !== 'string' || !generation || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('invalid_sales_generation_fence');
  }
  return db.prepare(`INSERT INTO market_fence_assertion(valid)
    VALUES (CASE WHEN EXISTS (SELECT 1 FROM market_generation_state
      WHERE id=1 AND generation=? AND revision=? AND mode='active') THEN 1 ELSE NULL END)`)
    .bind(generation, revision);
}

export function clearSalesFenceAssertions(db) {
  return db.prepare('DELETE FROM market_fence_assertion');
}

// Legacy writers must refuse both active and reconciliation states. This
// assertion belongs inside the same batch as the legacy writes and nonce.
export function legacySalesFence(db) {
  return db.prepare(`INSERT INTO market_fence_assertion(valid) VALUES
    (CASE WHEN NOT EXISTS (SELECT 1 FROM market_generation_state WHERE id=1) THEN 1 ELSE NULL END)`);
}

export function fencedSalesBatch(db, generation, revision, statements) {
  if (!Array.isArray(statements) || !Number.isSafeInteger(revision) || revision >= Number.MAX_SAFE_INTEGER) {
    throw new Error('invalid_sales_generation_batch');
  }
  return [salesGenerationFence(db, generation, revision), ...statements,
    db.prepare('UPDATE market_generation_state SET revision=revision+1 WHERE id=1'),
    clearSalesFenceAssertions(db)];
}

// Offline candidate only: callers must supply a separately authorized operator
// workflow. No route currently invokes this transition.
export function beginSalesReconciliation(db, generation, revision) {
  const now = new Date().toISOString();
  const mark = db.prepare("UPDATE market_generation_state SET mode='reconcile' WHERE id=1");
  const coverage = db.prepare(`INSERT INTO community_snapshots(kind,payload,updated_at) VALUES ('sales_coverage',?,?)
    ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`)
    .bind(JSON.stringify({ complete:false, generation }), now);
  return fencedSalesBatch(db, generation, revision, [mark, coverage]);
}

// Stages consumer-side state only. The external producer generation must be
// rotated and independently verified by an authorized operator. Never activates.
export function stageSalesGenerationRotation(db, oldGeneration, revision, newGeneration) {
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
  if(!uuid.test(oldGeneration??'')||!uuid.test(newGeneration??'')||oldGeneration===newGeneration||
    !Number.isSafeInteger(revision)||revision<0||revision>=Number.MAX_SAFE_INTEGER) throw new Error('invalid_sales_generation_rotation');
  const guard=db.prepare(`INSERT INTO market_fence_assertion(valid) VALUES (CASE WHEN EXISTS
    (SELECT 1 FROM market_generation_state WHERE id=1 AND generation=? AND revision=? AND mode='reconcile')
    THEN 1 ELSE NULL END)`).bind(oldGeneration,revision);
  const rememberOld=db.prepare('INSERT INTO market_generation_history(generation) VALUES (?) ON CONFLICT(generation) DO NOTHING').bind(oldGeneration);
  const reserveNew=db.prepare('INSERT INTO market_generation_history(generation) VALUES (?)').bind(newGeneration);
  const rotate=db.prepare("UPDATE market_generation_state SET generation=?,revision=revision+1 WHERE id=1").bind(newGeneration);
  const coverage=db.prepare(`INSERT INTO community_snapshots(kind,payload,updated_at) VALUES ('sales_coverage',?,?)
    ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`)
    .bind(JSON.stringify({complete:false,generation:newGeneration}),new Date().toISOString());
  return [guard,rememberOld,reserveNew,rotate,coverage,clearSalesFenceAssertions(db)];
}

// Preparation only: neither writer calls this until migration, reconciliation,
// D1 transaction behavior and both deployment environments have been verified.
export async function buildFencedSalesPage(db, { source, generation, revision, priorCursor, page }) {
  const cursor = page?.checkpointCursor;
  if (typeof source !== 'string' || !source || page?.generation !== generation || page?.complete !== false ||
      typeof cursor !== 'string' || !/^\d{1,19}$/.test(cursor) || BigInt(cursor) > 9223372036854775807n ||
      (priorCursor !== null && (typeof priorCursor !== 'string' || !/^\d{1,19}$/.test(priorCursor) || BigInt(cursor) < BigInt(priorCursor)))) {
    throw new Error('invalid_fenced_sales_page');
  }
  const rows = await salesStatements(db, page);
  const checkpointGuard = db.prepare(`INSERT INTO market_fence_assertion(valid) VALUES (CASE WHEN
    (? IS NULL AND NOT EXISTS (SELECT 1 FROM community_snapshots WHERE kind='sales_cursor')
      AND NOT EXISTS (SELECT 1 FROM market_sales)) OR
    (? IS NOT NULL AND EXISTS (SELECT 1 FROM community_snapshots WHERE kind='sales_cursor'
      AND json_extract(payload,'$.source')=? AND json_extract(payload,'$.generation')=?
      AND json_extract(payload,'$.cursor')=?)) THEN 1 ELSE NULL END)`)
    .bind(priorCursor, priorCursor, source, generation, priorCursor);
  const now = new Date().toISOString();
  const checkpoint = db.prepare(`INSERT INTO community_snapshots(kind,payload,updated_at) VALUES ('sales_cursor',?,?)
    ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`)
    .bind(JSON.stringify({ source, generation, cursor }), now);
  const coverage = db.prepare(`INSERT INTO community_snapshots(kind,payload,updated_at) VALUES ('sales_coverage',?,?)
    ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`)
    .bind(JSON.stringify({ complete:false, generation }), now);
  return fencedSalesBatch(db, generation, revision, [checkpointGuard, ...rows, checkpoint, coverage]);
}
