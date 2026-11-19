const calendar = new URL('../events.html', location.href);
calendar.search = location.search;
const period = {'#archive-title':'past','#now-title':'active','#next-title':'upcoming'}[location.hash];
if (period) calendar.searchParams.set('status', period);
location.replace(calendar.href);
