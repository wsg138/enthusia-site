import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/changelog.js';

test('legacy Changelog opens News with archive pagination and sorting intact', async () => {
  const request = new Request('https://example.test/changelog?releasePage=3&order=oldest&category=Event');
  const response = await onRequest({request});
  assert.equal(response.status, 308);
  const target = new URL(response.headers.get('location'));
  assert.equal(target.pathname, '/news');
  assert.equal(target.searchParams.get('category'), 'Changelog');
  assert.equal(target.searchParams.get('releasePage'), '3');
  assert.equal(target.searchParams.get('order'), 'oldest');
});
