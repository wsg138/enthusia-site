export function onRequest({request}) {
  const target = new URL(request.url);
  target.pathname = '/news';
  target.searchParams.set('category', 'Changelog');
  return Response.redirect(target, 308);
}
