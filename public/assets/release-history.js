import { api, el } from './community-dom.js';
import { renderMarkup, formattedDate } from './exact-markup.js';
import { orderNewsPosts } from './news-order.js';

export function releaseHistory(section) {
  const search = section.querySelector('[data-release-search]');
  const list = section.querySelector('[data-release-list]');
  let entries;
  let loading;
  let order = 'newest';

  function draw() {
    const term = search.value.trim().toLowerCase();
    const matches = orderNewsPosts(entries, order).filter(entry =>
      [entry.title, entry.body, entry.dateLabel, ...(entry.tags || [])]
        .join(' ').toLowerCase().includes(term)
    );
    list.replaceChildren(...matches.map(entry => {
      const summary = el('summary', {text:entry.title + ' · ' + entry.dateLabel});
      const body = el('div', {class:'md'});
      renderMarkup(body, entry.body);
      return el('details', {class:'release-note'}, [summary, body]);
    }));
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

  search.addEventListener('input', () => { if (entries) draw(); });
  return (category, direction) => {
    section.hidden = category !== 'All' && category !== 'Changelog';
    order = direction;
    if (section.hidden) return;
    if (!loading) loading = load();
    else if (entries) draw();
  };
}
