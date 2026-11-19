const descriptionLimit = 4096;
export const changelogColor = '#ffcf1f';

function* changeLines(body) {
  let heading = 'Changes';
  for (const original of body.split('\n')) {
    const line = original.trim();
    if (!line || /^!\[[^\]]*\]\(\/api\/community\/news-media\/[a-f0-9]{32}\)$/.test(line)) continue;
    const topic = /^#{1,3}\s+(.+)$/.exec(line);
    if (topic) {
      heading = topic[1];
      continue;
    }
    const item = line.replace(/^(?:[-*•]|\d+\.)\s+/, '');
    yield (heading ? '\n\n**' + heading + '**' : '') + '\n> • ' + item;
    heading = '';
  }
}

export function changelogEmbed(article, avatarUrl) {
  const url = 'https://enthusia.info/news/' + encodeURIComponent(article.slug);
  const link = '[Read the full changelog](' + url + ')';
  const overflow = 'More changes on the site. ';
  let description = (article.discordSummary || '').trim();
  const lines = [...changeLines(article.body || '')];
  const complete = (description + lines.join('')).trim();
  if (complete.length + link.length + 2 <= descriptionLimit) {
    description = complete;
  } else {
    for (const line of lines) {
      if (description.length + line.length + overflow.length + link.length + 4 > descriptionLimit) break;
      description += line;
    }
    description = description.trim() + '\n\n' + overflow;
    return buildEmbed(article, url, description.trimStart() + link, avatarUrl);
  }
  return buildEmbed(article, url, [description, link].filter(Boolean).join('\n\n'), avatarUrl);
}

function buildEmbed(article, url, description, avatarUrl) {
  return {
    title: article.title, url, description, color: Number.parseInt(changelogColor.slice(1), 16),
    author: {name: '✦ ENTHUSIA SMP · CHANGELOG'},
    footer: {text: 'by ' + (article.authorName || 'Staff'), ...(avatarUrl && {icon_url: avatarUrl})}
  };
}
