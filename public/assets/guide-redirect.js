const target = new URL('join.html', location.href);
target.search = location.search;
target.hash = location.hash || '#guide-title';
location.replace(target.href);
