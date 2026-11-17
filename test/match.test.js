import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compilePattern, urlMatches } from '../src/match.js';

test('compilePattern rejects empty and invalid patterns', () => {
  assert.equal(compilePattern(''), null);
  assert.equal(compilePattern('   '), null);
  assert.equal(compilePattern(undefined), null);
  assert.equal(compilePattern('teams.(microsoft'), null);
  assert.ok(compilePattern('teams\\.microsoft\\.com') instanceof RegExp);
});

test('a bare domain matches any page on that domain', () => {
  const p = 'teams\\.microsoft\\.com';
  assert.equal(urlMatches(p, 'https://teams.microsoft.com/v2/'), true);
  assert.equal(urlMatches(p, 'https://teams.microsoft.com/_#/conversations/abc'), true);
  assert.equal(urlMatches(p, 'https://www.google.com/'), false);
});

test('matching is case-insensitive', () => {
  assert.equal(urlMatches('teams\\.microsoft\\.com', 'https://Teams.Microsoft.com/'), true);
});

test('anchored patterns can pin the host', () => {
  const p = '^https://teams\\.microsoft\\.com/';
  assert.equal(urlMatches(p, 'https://teams.microsoft.com/v2/'), true);
  assert.equal(urlMatches(p, 'https://evil.example/?u=https://teams.microsoft.com/'), false);
});

test('empty pattern or missing tab URL never matches', () => {
  assert.equal(urlMatches('', 'https://teams.microsoft.com/'), false);
  assert.equal(urlMatches('teams', undefined), false);
  assert.equal(urlMatches('teams', ''), false);
});
