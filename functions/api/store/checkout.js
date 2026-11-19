function json(body, status) {
  return Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
}

function checkoutUrl(raw) {
  const url = new URL(raw);
  if (url.hostname !== 'enthusia-shop.tebex.io' || url.username || url.password || url.port ||
      !['http:', 'https:'].includes(url.protocol) || !url.pathname.startsWith('/buy/')) {
    throw new Error('Unexpected checkout URL');
  }
  url.protocol = 'https:';
  return url.href;
}

export async function checkout({request, env}, send) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({error:'invalid_origin'},403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'expected_json'},415);
  const input = await request.json().catch(()=>null);
  const packages = new Map([['avid',env.TEBEX_AVID_PACKAGE_ID],['devotee',env.TEBEX_DEVOTEE_PACKAGE_ID]]);
  if (!packages.has(input?.rank) || typeof input.username !== 'string' || !/^[^\s\p{C}]{1,32}$/u.test(input.username)) {
    return json({error:'invalid_selection'},400);
  }
  const packageId = packages.get(input.rank);
  if (!env.TEBEX_PLUGIN_SECRET || !/^\d+$/.test(packageId)) return json({error:'checkout_unconfigured'},503);
  try {
    const response = await send('https://plugin.tebex.io/checkout',{
      method:'POST', redirect:'error', headers:{'Content-Type':'application/json','X-Tebex-Secret':env.TEBEX_PLUGIN_SECRET},
      body:JSON.stringify({package_id:packageId, username:input.username})
    });
    if (!response.ok) return json({error:'tebex_unavailable'},502);
    return json({url:checkoutUrl((await response.json()).url)},200);
  } catch {
    return json({error:'tebex_unavailable'},502);
  }
}
export function onRequestPost(context) {
  return checkout(context, fetch);
}
