/**
 * Unit tests for budgetPeriodService.getPeriodWindow.
 *
 * The backend has no formal test runner (matching the existing `test_*.ts`
 * convention), so this file is a self-contained assertion script:
 *   npx ts-node src/services/__tests__/budgetPeriodService.test.ts
 * It exits non-zero if any assertion fails.
 */
import assert from 'node:assert';
import { getPeriodWindow } from '../budgetPeriodService';

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`  ✗ ${name}`);
  }
}

/** UTC ISO date portion (valid for tz='UTC', where local midnight === UTC midnight). */
const utcDate = (d: Date) => d.toISOString().slice(0, 10);

console.log('budgetPeriodService.getPeriodWindow');

// ── DAILY ──────────────────────────────────────────────────────────────
test('DAILY: today → tomorrow, totalDays=1', () => {
  const now = new Date('2026-07-03T14:30:00Z');
  const w = getPeriodWindow('DAILY', {}, now, 'UTC');
  assert.strictEqual(utcDate(w.periodStart), '2026-07-03');
  assert.strictEqual(utcDate(w.periodEnd), '2026-07-04');
  assert.strictEqual(w.totalDays, 1);
  assert.strictEqual(w.daysElapsed, 1);
  assert.strictEqual(w.daysRemaining, 0);
  assert.strictEqual(w.periodLabel, 'Today');
});

// ── WEEKLY ─────────────────────────────────────────────────────────────
test('WEEKLY starting Monday: Wed → window Mon..next Mon', () => {
  // 2026-07-01 is a Wednesday.
  const now = new Date('2026-07-01T12:00:00Z');
  const w = getPeriodWindow('WEEKLY', { weeklyStartDay: 1 }, now, 'UTC');
  assert.strictEqual(utcDate(w.periodStart), '2026-06-29'); // Monday
  assert.strictEqual(utcDate(w.periodEnd), '2026-07-06');   // next Monday
  assert.strictEqual(w.totalDays, 7);
  assert.strictEqual(w.periodLabel, 'This week');
});

test('WEEKLY starting Sunday(0) on that Sunday: daysElapsed=1', () => {
  // 2026-07-05 is a Sunday.
  const now = new Date('2026-07-05T09:00:00Z');
  const w = getPeriodWindow('WEEKLY', { weeklyStartDay: 0 }, now, 'UTC');
  assert.strictEqual(utcDate(w.periodStart), '2026-07-05');
  assert.strictEqual(utcDate(w.periodEnd), '2026-07-12');
  assert.strictEqual(w.daysElapsed, 1);
});

// ── MONTHLY ────────────────────────────────────────────────────────────
test('MONTHLY default (null start day) = calendar month', () => {
  const now = new Date('2026-07-20T00:00:00Z');
  const w = getPeriodWindow('MONTHLY', {}, now, 'UTC');
  assert.strictEqual(utcDate(w.periodStart), '2026-07-01');
  assert.strictEqual(utcDate(w.periodEnd), '2026-08-01');
  assert.strictEqual(w.totalDays, 31);
  assert.strictEqual(w.periodLabel, 'This month');
});

test('MONTHLY start day 15, today is the 20th', () => {
  const now = new Date('2026-07-20T00:00:00Z');
  const w = getPeriodWindow('MONTHLY', { monthlyStartDay: 15 }, now, 'UTC');
  assert.strictEqual(utcDate(w.periodStart), '2026-07-15');
  assert.strictEqual(utcDate(w.periodEnd), '2026-08-15');
});

test('MONTHLY start day 15, before the 15th → previous cycle', () => {
  const now = new Date('2026-07-10T00:00:00Z');
  const w = getPeriodWindow('MONTHLY', { monthlyStartDay: 15 }, now, 'UTC');
  assert.strictEqual(utcDate(w.periodStart), '2026-06-15');
  assert.strictEqual(utcDate(w.periodEnd), '2026-07-15');
});

test('MONTHLY start day 31 clamps in February', () => {
  const now = new Date('2026-02-10T00:00:00Z');
  const w = getPeriodWindow('MONTHLY', { monthlyStartDay: 31 }, now, 'UTC');
  assert.strictEqual(utcDate(w.periodStart), '2026-01-31');
  assert.strictEqual(utcDate(w.periodEnd), '2026-02-28'); // 2026 is not a leap year
});

test('MONTHLY "last day" (-1) in April', () => {
  const now = new Date('2026-04-30T00:00:00Z');
  const w = getPeriodWindow('MONTHLY', { monthlyStartDay: -1 }, now, 'UTC');
  assert.strictEqual(utcDate(w.periodStart), '2026-04-30');
  assert.strictEqual(utcDate(w.periodEnd), '2026-05-31');
});

test('MONTHLY "last day" (-1) equals storing 31 (same window)', () => {
  const now = new Date('2026-02-10T00:00:00Z');
  const a = getPeriodWindow('MONTHLY', { monthlyStartDay: -1 }, now, 'UTC');
  const b = getPeriodWindow('MONTHLY', { monthlyStartDay: 31 }, now, 'UTC');
  assert.strictEqual(utcDate(a.periodStart), utcDate(b.periodStart));
  assert.strictEqual(utcDate(a.periodEnd), utcDate(b.periodEnd));
});

// ── CUSTOM ─────────────────────────────────────────────────────────────
test('CUSTOM 14-day, anchor 30 days ago → current 14-day slice', () => {
  const now = new Date('2026-07-15T00:00:00Z');
  const anchor = new Date('2026-06-15T00:00:00Z'); // 30 days before
  const w = getPeriodWindow('CUSTOM', { customPeriodDays: 14, anchorDate: anchor }, now, 'UTC');
  assert.strictEqual(utcDate(w.periodStart), '2026-07-13'); // anchor + 28
  assert.strictEqual(utcDate(w.periodEnd), '2026-07-27');   // anchor + 42
  assert.strictEqual(w.totalDays, 14);
});

test('CUSTOM future anchor → first window, daysElapsed clamps to 1', () => {
  const now = new Date('2026-07-01T00:00:00Z');
  const anchor = new Date('2026-07-10T00:00:00Z'); // future
  const w = getPeriodWindow('CUSTOM', { customPeriodDays: 7, anchorDate: anchor }, now, 'UTC');
  assert.strictEqual(utcDate(w.periodStart), '2026-07-10');
  assert.strictEqual(utcDate(w.periodEnd), '2026-07-17');
  assert.strictEqual(w.daysElapsed, 1);
});

// ── DST safety ─────────────────────────────────────────────────────────
test('DST: LA monthly March window still 31 total days', () => {
  // March 2026 has a spring-forward (Mar 8). Calendar month is still 31 days.
  const now = new Date('2026-03-20T12:00:00Z');
  const w = getPeriodWindow('MONTHLY', {}, now, 'America/Los_Angeles');
  assert.strictEqual(w.totalDays, 31);
});

test('DST: daysElapsed correct just after local midnight following spring-forward', () => {
  // LA springs forward Mar 8 2026. Just after local midnight on Mar 10
  // (00:15 PDT = 07:15Z) is the 10th day of the calendar-month window.
  // A fixed-ms floor would report 9 here; calendar-day math must report 10.
  const now = new Date('2026-03-10T07:15:00Z');
  const w = getPeriodWindow('MONTHLY', {}, now, 'America/Los_Angeles');
  assert.strictEqual(w.daysElapsed, 10);
  assert.strictEqual(w.daysRemaining, 21);
});

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
