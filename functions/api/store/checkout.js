function json(body, status) {
  return Response.json(body, {status, headers:{'Cache-Control':'no-store'}});
}

function checkoutUrl(raw) {
  const url = new URL(raw);
  if (url.hostname !== 'enthusia-shop.tebex.io' || url.username || url.password || url.port ||
      !['http:', 'https:'].includes(url.protocol) || !url.pathname.startsWith('/buy/')) {
    return null;
  }
  url.protocol = 'https:';
  return url.href;
}

async function readCheckoutResponse(response) {
  if (!response.ok) return json({error:'tebex_rejected', providerStatus:response.status},502);
  const result = await response.json().catch(() => null);
  const raw = result?.url ?? result?.data?.url;
  if (typeof raw !== 'string' || !URL.canParse(raw)) return json({error:'invalid_checkout_response'},502);
  const url = checkoutUrl(raw);
  if (!url) return json({error:'unexpected_checkout_url', providerHost:new URL(raw).hostname},502);
  return json({url},200);
}

function validSelection(input, packages) {
  if (!packages.has(input?.rank) || typeof input.username !== 'string') return false;
  const name = input.username;
  return name.length > 0 && name.length <= 64 && Array.from(name).length <= 32 && name.search(/[\s\p{C}]/u) === -1;
}

export async function checkout({request, env}, send) {
  if (request.headers.get('origin') !== new URL(request.url).origin) return json({error:'invalid_origin'},403);
  if (!request.headers.get('content-type')?.startsWith('application/json')) return json({error:'expected_json'},415);
  const input = await request.json().catch(()=>null);
  const packages = new Map([['avid',env.TEBEX_AVID_PACKAGE_ID],['devotee',env.TEBEX_DEVOTEE_PACKAGE_ID]]);
  if (!validSelection(input, packages)) {
    return json({error:'invalid_selection'},400);
  }
  const packageId = packages.get(input.rank);
  if (!env.TEBEX_PLUGIN_SECRET || !/^\d+$/.test(packageId)) return json({error:'checkout_unconfigured'},503);
  try {
    const response = await send('https://plugin.tebex.io/checkout',{
      method:'POST', redirect:'manual', headers:{Accept:'application/json','Content-Type':'application/json','X-Tebex-Secret':env.TEBEX_PLUGIN_SECRET},
      body:JSON.stringify({package_id:packageId, username:input.username})
    });
    return await readCheckoutResponse(response);
  } catch {
    return json({error:'tebex_unavailable'},502);
  }
}
export function onRequestPost(context) {
  return checkout(context, fetch);
}
