import { api, el } from './community-dom.js';
import { formattedDate } from './exact-markup.js?v=news-images-20261103';
import { orderNewsPosts } from './news-order.js';

const categories = new Map([['All', 'All posts'], ['Announcement', 'Announcements'], ['Changelog', 'Changelogs'], ['Event', 'Events']]);

export async function attachNewsMenu(article) {
  const layout = el('div', {class:'release-layout'});
  const summary = el('summary', {text:'Browse news'});
  const menu = el('details', {class:'news-menu'}, [summary]);
  article.before(layout);
  layout.append(menu, article);
  const desktop = matchMedia('(min-width: 840px)');
  menu.open = desktop.matches;
  desktop.addEventListener('change', event => { menu.open = event.matches; });

  const filters = el('div', {class:'news-menu-filters', role:'group', 'aria-label':'Filter posts'});
  const sort = el('select', {'aria-label':'Sort by date'}, [
    el('option', {value:'newest', text:'Newest first'}), el('option', {value:'oldest', text:'Oldest first'})
  ]);
  const sortRow = el('label', {class:'news-menu-sort'}, [el('span', {text:'Sort by date'}), sort]);
  const list = el('div', {class:'news-menu-list'});
  const nav = el('nav', {'aria-label':'Browse news'}, [filters, sortRow, list, el('a', {class:'news-menu-write', href:'/newseditor', text:'Write a post (staff)'})]);
  menu.append(nav);
  const params = new URLSearchParams(location.search);
  let category = categories.has(params.get('category')) ? params.get('category') : 'All';
  sort.value = params.get('order') === 'oldest' ? 'oldest' : 'newest';
  let posts;
  function draw() {
    for (const button of filters.children) button.setAttribute('aria-pressed',String(button.value === category));
    if (!posts) return;
    const items = orderNewsPosts(posts.filter(post => category === 'All' || category === post.category),sort.value);
    const query = new URLSearchParams();
    if (category !== 'All') query.set('category', category);
    if (sort.value === 'oldest') query.set('order','oldest');
    list.replaceChildren(...items.map(post => {
      const path = '/news/'+encodeURIComponent(post.slug);
      const current = location.pathname.replace(/\/$/,'') === path;
      const date = formattedDate(post.date);
      return el('a', {class:'news-menu-post', href:path+(query.size?'?'+query:''), 'aria-current':current?'page':null}, [
        el('small', {class:'news-menu-category',text:post.category}),
        el('span', {text:post.title}),
        el('small', {text:[date,post.authorName].filter(Boolean).join(' · ')})
      ]);
    }));
    if (!items.length) list.append(el('p', {text:'No posts in this category.'}));
  }
  for (const [value,label] of categories) {
    filters.append(el('button', {type:'button', value, text:label, onclick:()=>{category=value; draw();}}));
  }
  sort.addEventListener('change', draw);
  draw();
  try { posts=(await api('news')).items; draw(); }
  catch { list.replaceChildren(el('a',{href:'/news',text:'Open the news index'})); }
}
