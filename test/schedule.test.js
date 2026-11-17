import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTime, isWithinWindow, nextMinuteBoundary } from '../src/schedule.js';

const at = (h, m) => new Date(2026, 0, 15, h, m, 30);

test('parseTime', () => {
  assert.equal(parseTime('00:00'), 0);
  assert.equal(parseTime('09:05'), 545);
  assert.equal(parseTime('23:59'), 1439);
  assert.equal(parseTime('24:00'), null);
  assert.equal(parseTime('12:60'), null);
  assert.equal(parseTime('noon'), null);
  assert.equal(parseTime(undefined), null);
});

test('same-day window includes start, excludes stop', () => {
  assert.equal(isWithinWindow(at(8, 59), '09:00', '17:00'), false);
  assert.equal(isWithinWindow(at(9, 0), '09:00', '17:00'), true);
  assert.equal(isWithinWindow(at(12, 0), '09:00', '17:00'), true);
  assert.equal(isWithinWindow(at(16, 59), '09:00', '17:00'), true);
  assert.equal(isWithinWindow(at(17, 0), '09:00', '17:00'), false);
});

test('window crossing midnight', () => {
  assert.equal(isWithinWindow(at(21, 59), '22:00', '06:00'), false);
  assert.equal(isWithinWindow(at(22, 0), '22:00', '06:00'), true);
  assert.equal(isWithinWindow(at(23, 59), '22:00', '06:00'), true);
  assert.equal(isWithinWindow(at(0, 0), '22:00', '06:00'), true);
  assert.equal(isWithinWindow(at(5, 59), '22:00', '06:00'), true);
  assert.equal(isWithinWindow(at(6, 0), '22:00', '06:00'), false);
  assert.equal(isWithinWindow(at(12, 0), '22:00', '06:00'), false);
});

test('start equals stop means all day', () => {
  assert.equal(isWithinWindow(at(3, 0), '08:00', '08:00'), true);
  assert.equal(isWithinWindow(at(20, 0), '08:00', '08:00'), true);
});

test('invalid times never poll', () => {
  assert.equal(isWithinWindow(at(12, 0), '', '17:00'), false);
  assert.equal(isWithinWindow(at(12, 0), '09:00', 'bad'), false);
});

test('nextMinuteBoundary', () => {
  const d = new Date(2026, 0, 15, 23, 59, 42, 500);
  assert.equal(nextMinuteBoundary(d), new Date(2026, 0, 16, 0, 0, 0, 0).getTime());
});
