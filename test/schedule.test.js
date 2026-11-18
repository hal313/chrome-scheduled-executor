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

test('invalid times never execute', () => {
  assert.equal(isWithinWindow(at(12, 0), '', '17:00'), false);
  assert.equal(isWithinWindow(at(12, 0), '09:00', 'bad'), false);
});

test('nextMinuteBoundary', () => {
  const d = new Date(2026, 0, 15, 23, 59, 42, 500);
  assert.equal(nextMinuteBoundary(d), new Date(2026, 0, 16, 0, 0, 0, 0).getTime());
});

import { activeOverride, effectiveState, OVERRIDE_MS } from '../src/schedule.js';

const noon = new Date(2026, 0, 15, 12, 0, 0);
const base = { enabled: true, startTime: '09:00', stopTime: '17:00' };

test('activeOverride ignores missing, malformed and expired overrides', () => {
  assert.equal(activeOverride(undefined, noon.getTime()), null);
  assert.equal(activeOverride({ mode: 'sideways', until: noon.getTime() + 1 }, noon.getTime()), null);
  assert.equal(activeOverride({ mode: 'on', until: noon.getTime() }, noon.getTime()), null);
  assert.deepEqual(activeOverride({ mode: 'off', until: noon.getTime() + 1 }, noon.getTime()), { mode: 'off', until: noon.getTime() + 1 });
});

test('effectiveState without override follows the schedule', () => {
  assert.equal(effectiveState(base, noon).mode, 'executing');
  assert.equal(effectiveState({ ...base, startTime: '13:00' }, noon).mode, 'waiting');
  assert.equal(effectiveState({ ...base, enabled: false }, noon).mode, 'disabled');
});

test('"on" override executes even when disabled or outside the window', () => {
  const override = { mode: 'on', until: noon.getTime() + OVERRIDE_MS };
  assert.equal(effectiveState({ ...base, enabled: false, override }, noon).executing, true);
  assert.equal(effectiveState({ ...base, startTime: '13:00', override }, noon).executing, true);
});

test('"off" override stops execution inside the window', () => {
  const override = { mode: 'off', until: noon.getTime() + OVERRIDE_MS };
  const s = effectiveState({ ...base, override }, noon);
  assert.equal(s.executing, false);
  assert.equal(s.mode, 'disabled');
  assert.equal(s.override, override);
});

test('an expired override falls back to the schedule', () => {
  const override = { mode: 'off', until: noon.getTime() - 1 };
  const s = effectiveState({ ...base, override }, noon);
  assert.equal(s.mode, 'executing');
  assert.equal(s.override, null);
});
