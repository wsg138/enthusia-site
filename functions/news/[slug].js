import { identifier, publicUrl } from '../lib/community/contracts.js';

const entities = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => entities[char]);

function articleContent(post) {
  const cover = publicUrl(post.image);
  const date = post.date ? new Date(post.date).toLocaleDateString('en-US',{dateStyle:'long',timeZone:'UTC'}) : '';
  const name = post.authorName || 'Staff';
  const skin = name === 'Fain' && post.authorRank === 'Founder' ? 'FainNeito' : name;
  return `<article class="release panel">
    <a class="release-back" href="/news">← All news</a>
    <header class="release-header"><div class="release-meta"><span class="tag ${post.category === 'Changelog' ? 'tag-dark' : post.category === 'Event' ? 'tag-gold' : 'tag-red'}">${escape(post.category)}</span><time datetime="${escape(post.date)}">${escape(date)}</time></div>
    <h1>${escape(post.title)}</h1>
    <div class="release-byline"><img alt="" width="40" height="40" src="https://minotar.net/helm/${encodeURIComponent(skin)}/40"> ${escape(name)} <span class="tag tag-gold">${escape(post.authorRank)}</span></div></header>
    ${cover ? `<figure class="release-cover"><img class="news-cover" src="${escape(cover)}" alt="Cover for ${escape(post.title)}"></figure>` : ''}
    <div class="release-body md">${escape(post.body)}</div>
    <footer class="release-actions"><a class="chip" href="/news">← All news</a><button class="chip" data-copy-article>Copy link to post</button></footer>
    </article>
    <dialog class="release-lightbox" aria-label="Enlarged image"><button type="button" class="chip" autofocus>Close ✕</button><img alt=""></dialog>`;
}

export async function onRequestGet({params,env,request}) {
  let slug;
  try { slug = identifier(params.slug); } catch { return new Response('Post not found',{status:404}); }
  const row = await env.COMMUNITY_DB.prepare("SELECT payload FROM community_records WHERE kind='news' AND slug=? AND status='published'").bind(slug).first();
  const page = await env.ASSETS.fetch(new URL('/news',request.url));
  if (!page.ok) return page;
  const post = row && JSON.parse(row.payload);
  const title = escape(post ? post.title+' · Enthusia SMP' : 'Post not found · Enthusia SMP');
  const content = post ? articleContent(post) : '<article class="release panel"><h1>Post not found</h1><a href="/news">← All news</a></article>';
  // The index supplies the shared navigation and footer. Root its relative assets at the site homepage.
  const html = (await page.text()).replace('<head>','<head><base href="/">')
    .replace(/<title>[^<]*<\/title>/,()=>'<title>'+title+'</title>')
    .replace('href="#main-content"',()=> 'href="'+escape(new URL(request.url).pathname)+'#main-content"')
    .replace(/<section class="s-cream" aria-label="Posts"[\s\S]*?<\/main>/,()=>'<section class="s-cream release-main">'+content+'</section></main>')
    .replace(/src="assets\/exact-news\.js[^"]*"/,'src="/assets/news-article.js"')
    .replace('</head>','<link rel="stylesheet" href="/assets/news-article.css"></head>');
  const headers = new Headers(page.headers);
  for (const key of ['etag','content-length','content-encoding','last-modified']) headers.delete(key);
  headers.set('cache-control','no-store');
  return new Response(html,{headers,status:post?200:404});
}
