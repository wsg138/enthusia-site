const destination = new URL('news.html', location.href);
destination.search = location.search;
destination.searchParams.set('category', 'Changelog');
destination.hash = location.hash === '#changelog-title' ? '#news-title' : location.hash;
location.replace(destination.href);
