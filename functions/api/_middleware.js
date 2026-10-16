const HEADERS=Object.freeze({
  'strict-transport-security':'max-age=31536000; includeSubDomains; preload',
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'no-referrer',
  'content-security-policy':"default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'permissions-policy':'camera=(), microphone=(), geolocation=(), payment=()'
});

export async function onRequest(context) {
  let response;
  try {response=await context.next();}
  catch {response=new Response(JSON.stringify({error:'internal_error'}),{status:500,
    headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
  const headers=new Headers(response.headers);
  for(const [name,value] of Object.entries(HEADERS))headers.set(name,value);
  if(new URL(context.request.url).pathname.startsWith('/api/competitions/auth/'))headers.set('cache-control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
