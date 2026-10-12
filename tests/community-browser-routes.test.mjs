import assert from 'node:assert/strict';
import test from 'node:test';
import { api } from '../public/assets/community-dom.js';

test('community requests reject traversal and unsupported routes before fetch', async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.redirect, 'error');
    calls.push(url);
    return { ok: true, json: async () => ({ items: [] }) };
  };
  try {
    for (const path of ['../auth/logout', 'polls/..', 'polls/%2e%2e', 'polls/%252e%252e',
      'polls/a%2fb', 'polls/a\\b', 'admin/unknown', 'https://evil.example', '//evil.example',
      'news#fragment', 'news?unexpected=yes', 'insights?week=x&week=y']) {
      await assert.rejects(api(path), /Unsupported community/);
    }
    assert.equal(calls.length, 0);
    for (const path of ['news', 'guilds', 'polls/test-poll', 'admin/session', 'admin/timeline',
      'insights?week=2026-10-12&mode=guild&item=minecraft%3Adiamond', 'market-design', 'alerts']) {
      await api(path);
    }
    assert.equal(calls.length, 8);
    await api('news', {credentials:'include',redirect:'follow'});
    assert.ok(calls.every(url => url.startsWith('/api/community/')));
  } finally {
    globalThis.fetch = original;
  }
});
