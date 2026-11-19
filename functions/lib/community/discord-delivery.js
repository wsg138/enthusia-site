// Delivery receipts use a private record kind outside CONTENT_KINDS. One receipt per
// News slug survives edits and retries without requiring a separate deployment migration.
const receipt = "kind='discord_news_delivery' AND slug=?";
const site = 'https://enthusia.info';

export function queueAnnouncement(db, article, actor, now) {
  const url = site + '/news#' + encodeURIComponent(article.slug);
  const channel = article.category === 'Changelog' ? 'CHANGELOG' : 'NEWS';
  const embed = {
    author: {name: '✦ ENTHUSIA SMP · ' + (channel === 'NEWS' ? 'ANNOUNCEMENT' : 'CHANGELOG')},
    title: article.title, url, color: Number.parseInt('b3201a',16),
    description: article.discordSummary + '\n\n[Read the full post](' + url + ')'
  };
  if (article.image) embed.image = {url: new URL(article.image, site).href};
  // The preceding audit statement changes one row only after a successful article write.
  return db.prepare(`INSERT INTO community_records(kind,slug,status,payload,editor,updated_at)
    SELECT 'discord_news_delivery',?,'pending',?,?,? WHERE changes()>0
    ON CONFLICT(kind,slug) DO NOTHING`)
    .bind(article.slug, JSON.stringify({channel, embed}), actor.id, now);
}

export async function deliveryStatus(db, slug) {
  const row = await db.prepare('SELECT status,updated_at FROM community_records WHERE ' + receipt).bind(slug).first();
  if (row?.status === 'processing' && Date.now() - Date.parse(row.updated_at) > 120000) return 'uncertain';
  return row?.status ?? null;
}

function webhook(raw) {
  if (typeof raw !== 'string') return null;
  const parts = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/(\d{16,22})\/([A-Za-z0-9._-]+)$/.exec(raw);
  return parts ? {id:parts[1], token:parts[2]} : null;
}

async function send(embed, endpoint) {
  if (!endpoint) return {status:'unconfigured'};
  const destination = new URL('https://discord.com/api/webhooks/');
  destination.pathname += encodeURIComponent(endpoint.id) + '/' + encodeURIComponent(endpoint.token);
  destination.searchParams.set('wait','true');
  try {
    const request = new Request(destination, {
      method:'POST', headers:{'content-type':'application/json'}, redirect:'error',
      signal:globalThis.AbortSignal.timeout(8000),
      body:JSON.stringify({embeds:[embed], allowed_mentions:{parse:[]}})
    });
    const response = await fetch(request);
    if (response.ok) {
      const message = await response.json();
      if (/^\d{16,22}$/.test(message?.id)) return {status:'sent', messageId:message.id};
    } else if (response.status >= 400 && response.status < 500) {
      return {status:'rejected'};
    }
  } catch { /* Discord may have accepted a request even when its reply is lost. */ }
  return {status:'uncertain'};
}

export async function deliverAnnouncement(env, slug, retry = false) {
  const db = env.COMMUNITY_DB;
  const eligible = retry ? "('pending','unconfigured','rejected')" : "('pending')";
  const row = await db.prepare(`UPDATE community_records SET status='processing',updated_at=?
    WHERE ${receipt} AND status IN ${eligible}
      AND EXISTS (SELECT 1 FROM community_records WHERE kind='news' AND slug=? AND status='published')
    RETURNING payload`).bind(new Date().toISOString(),slug,slug).first();
  if (!row) return deliveryStatus(db,slug);
  const {channel,embed} = JSON.parse(row.payload);
  const result = await send(embed,webhook(env['COMMUNITY_DISCORD_' + channel + '_WEBHOOK']));
  await db.prepare(`UPDATE community_records SET status=?,updated_at=?,payload=json_set(payload,'$.messageId',?)
    WHERE ${receipt} AND status='processing'`)
    .bind(result.status,new Date().toISOString(),result.messageId ?? null,slug).run();
  return result.status;
}
