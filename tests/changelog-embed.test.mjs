import { test } from 'node:test';
import assert from 'node:assert/strict';
import { changelogEmbed } from '../public/assets/changelog-embed.js';

const article = {slug:'release', title:'November update', authorName:'Fain'};
const link = '[Read the full changelog](https://enthusia.info/news#release)';

test('changelog groups unheaded notes and emoji topics without an intro', () => {
  const body = 'General fix\n## 🏠 Homes\n- Use `/home`\n• Claim changes\n# Empty section';
  const embed = changelogEmbed({...article, body});
  assert.equal(embed.description, '**Changes**\n> • General fix\n\n**🏠 Homes**\n> • Use `/home`\n> • Claim changes\n\n' + link);
  assert.equal(embed.footer.text, 'by Fain');
});

test('oversized changelog links out after the last complete bullet', () => {
  const body = '## First\n- Included\n## Second\n- ' + '🪵'.repeat(3000);
  const embed = changelogEmbed({...article, body});
  assert.equal(embed.description, '**First**\n> • Included\n\nMore changes on the site. ' + link);
  assert.ok(embed.description.length <= 4096);
});
