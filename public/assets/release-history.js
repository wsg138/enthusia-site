import { api, el } from './community-dom.js';
import { renderMarkup, formattedDate, newsImageSource } from './exact-markup.js';
import { orderNewsPosts } from './news-order.js';

const pageSize = 5;

function releaseCard(entry) {
  const content = el('div', {class:'md release-note-body'});
  renderMarkup(content, entry.body);
  const firstLine = [...content.children].find(block => block.textContent.trim());
  const excerpt = firstLine?.cloneNode(true);
  if (excerpt) {
    for (const spoiler of excerpt.querySelectorAll('.md-sp')) spoiler.textContent = '…';
  }
  const copy = el('span', {class:'news-story-copy'}, [
    el('span', {class:'tag tag-dark',text:'Changelog'}),
    el('span', {class:'news-story-title',text:entry.title}),
    excerpt && el('span', {class:'news-story-excerpt',text:excerpt.textContent}),
    el('span', {class:'pm',text:entry.dateLabel})
  ]);
  const summary = el('summary', {}, [copy]);
  if (entry.image) {
    const image = el('img', {class:'news-story-cover',alt:'',loading:'lazy',src:newsImageSource(entry.image)});
    image.addEventListener('error', () => image.remove(), {once:true});
    summary.prepend(image);
  }
  return el('details', {class:'news-story release-note'}, [summary,content]);
}

function pageButton(label, number, attributes, go) {
  return el('button', {class:'chip',type:'button',text:label,...attributes,onclick:()=>go(number)});
}
function pageControls(nav, page, total, go) {
  nav.hidden = total < 2;
  if (nav.hidden) { nav.replaceChildren(); return; }
  const controls = [pageButton('«',page-1,{'aria-label':'Previous page',disabled:page===1?'':null},go)];
  let previous = 0;
  for (let n=1;n<=total;n++) {
    if (n!==1 && n!==total && Math.abs(n-page)>1 && !(page<=2 && n<=3) && !(page>=total-1 && n>=total-2)) continue;
    if (n>previous+1) controls.push(el('span',{'aria-hidden':'true',text:'…'}));
    controls.push(pageButton(n,n,{'aria-label':'Page '+n,'aria-current':n===page?'page':null},go));
    previous=n;
  }
  controls.push(pageButton('»',page+1,{'aria-label':'Next page',disabled:page===total?'':null},go));
  nav.replaceChildren(...controls);
}

export function releaseHistory(section) {
  const search = section.querySelector('[data-release-search]');
  const list = section.querySelector('[data-release-list]');
  const pager = section.querySelector('[data-release-pages]');
  let page = Number(new URL(location.href).searchParams.get('releasePage')) || 1;
  let entries;
  let loading;
  let order = 'newest';

  function draw() {
    const term = search.value.trim().toLowerCase();
    const matches = orderNewsPosts(entries, order).filter(entry =>
      [entry.title, entry.body, entry.dateLabel, ...(entry.tags || [])]
        .join(' ').toLowerCase().includes(term)
    );
    const total = Math.ceil(matches.length/pageSize);
    page = Math.max(1,Math.min(Math.trunc(page),total));
    const start = (page-1)*pageSize;
    list.replaceChildren(...matches.slice(start,start+pageSize).map(releaseCard));
    const url = new URL(location.href);
    if (page===1) url.searchParams.delete('releasePage');
    else url.searchParams.set('releasePage',page);
    history.replaceState(null,'',url);
    pageControls(pager,page,total,next=>{
      page=next;
      draw();
      section.querySelector('h2').focus();
    });
    if (!matches.length) list.append(el('p', {text:'No matching release notes.'}));
  }

  async function load() {
    list.textContent = 'Loading earlier release notes…';
    const [archive, feed] = await Promise.allSettled([
      fetch(new URL('./release-history.json', import.meta.url)).then(response => {
        if (!response.ok) throw new Error('Archive unavailable');
        return response.json();
      }),
      api('changelog')
    ]);
    if (archive.status === 'rejected' && feed.status === 'rejected') {
      list.textContent = 'Earlier release notes are unavailable.';
      return;
    }
    entries = (archive.value || []).map(item => ({...item, date:item.dateLabel}));
    for (const item of feed.value?.items || []) {
      if (item.designIndex != null || !item.title) continue;
      const entry = {...item, dateLabel:formattedDate(item.date) || 'Undated'};
      const index = entries.findIndex(old => old.title === item.title && old.body === item.body);
      if (index < 0) entries.push(entry);
    }
    draw();
  }

  search.addEventListener('input', () => { page=1; if (entries) draw(); });
  return (category, direction) => {
    section.hidden = category !== 'All' && category !== 'Changelog';
    if (entries && order!==direction) page=1;
    order = direction;
    if (section.hidden) return;
    if (!loading) loading = load();
    else if (entries) draw();
  };
}
