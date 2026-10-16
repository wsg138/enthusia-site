export function topFiveByWeek(rows) {
  const weeks=new Map();
  for(const row of rows) {
    const leaders=weeks.get(row.week)??[];
    if(leaders.length<5)leaders.push(row);
    weeks.set(row.week,leaders);
  }
  return weeks;
}
export function consecutiveTopWeeks(leaders,weeks,start) {
  const streaks=new Map();
  for(const leader of leaders) {
    let streak=0;
    for(let offset=0;offset<52;offset++) {
      const week=new Date(Date.parse(start)-offset*7*86400000).toISOString().slice(0,10);
      if(!weeks.get(week)?.some(row=>row.name===leader.name))break;
      streak++;
    }
    streaks.set(leader.name,streak);
  }
  return streaks;
}
