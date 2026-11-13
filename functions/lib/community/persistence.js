import { validateSale } from './contracts.js';
export function salesStatements(db,input) {
  if(!Array.isArray(input.items)||input.items.length>250)throw new Error('invalid_sales_batch');
  const sales=input.items.map(value=>validateSale(value));
  // Enforce immutable IDs in the same D1 batch as the checkpoint.
  // A conflicting row violates NOT NULL and rolls back the whole page.
  // An identical replay is a no-op.
  return sales.map(sale=>db.prepare(`INSERT INTO market_sales(id,stall,guild,item,quantity,gold,occurred_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET quantity=NULL WHERE
      market_sales.stall<>excluded.stall OR market_sales.guild<>excluded.guild OR
      market_sales.item<>excluded.item OR market_sales.quantity<>excluded.quantity OR
      market_sales.gold<>excluded.gold OR market_sales.occurred_at<>excluded.occurred_at`)
    .bind(sale.id,sale.stall,sale.guild,sale.item,sale.quantity,sale.gold,sale.occurredAt));
}
export function snapshotStatement(db,kind,snapshot,now=new Date().toISOString()) {
  return db.prepare(`INSERT INTO community_snapshots(kind,payload,updated_at) VALUES (?,?,?)
    ON CONFLICT(kind) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at
    WHERE json_extract(community_snapshots.payload,'$.generatedAt') IS NULL
      OR json_extract(excluded.payload,'$.generatedAt')>json_extract(community_snapshots.payload,'$.generatedAt')`)
    .bind(kind,JSON.stringify(snapshot),snapshot.generatedAt??now);
}
