import { validateSale } from './contracts.js';
export async function salesStatements(db,input) {
  if(!Array.isArray(input.items)||input.items.length>250)throw new Error('invalid_sales_batch');
  const sales=input.items.map(value=>validateSale(value)),seen=new Map();
  for(const sale of sales) {
    const stored=await db.prepare('SELECT id,stall,guild,item,quantity,gold,occurred_at AS occurredAt FROM market_sales WHERE id=?').bind(sale.id).first();
    const existing=stored??seen.get(sale.id);
    if(existing&&Object.keys(sale).some(key=>sale[key]!==existing[key]))throw new Error('invalid_sale_id_reuse');
    seen.set(sale.id,sale);
  }
  // Enforce equality inside the batch as well as in the early diagnostic read:
  // another writer can insert this ID between that read and the transaction.
  // A differing row violates the existing NOT NULL constraint, rolling back the
  // complete D1 batch; an identical replay remains a no-op.
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
