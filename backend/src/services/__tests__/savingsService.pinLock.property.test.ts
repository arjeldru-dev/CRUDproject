/**
 * Property-based test for the pure PIN-lock predicate `isPinLocked` in the
 * savings compute service.
 *
 * Feature: savings-piggybank, Property 14: PIN-lock predicate is exactly "now before expiry"
 *
 * Property 14 (design.md / tasks.md 4.15): For any `pinLockedUntil` value (a
 * `Date` or `null`) and any `now` instant, `isPinLocked(pinLockedUntil, now)`
 * returns `true` iff `pinLockedUntil` is non-null AND `now < pinLockedUntil`,
 * and `false` otherwise. A `null` `pinLockedUntil`, or one at/before `now`
 * (already elapsed), means unlocked. The predicate is pure — it never touches a
 * real clock, a database, or `bcrypt`, so identical inputs always yield an
 * identical result.
 *
 * Validates: Requirements 12.14, 12.15, 12.17
 *   - 12.14: while the lock has not yet elapsed (now < pinLockedUntil), spending
 *     is locked.
 *   - 12.15: once the cooldown has elapsed (now >= pinLockedUntil), the lock is
 *     no longer in effect.
 *   - 12.17: the lock is a boolean gate the caller consults; read-only endpoints
 *     stay available (they simply never call this predicate as a gate).
 *
 * Self-contained assertion script (project convention, no jest/vitest):
 *   npx ts-node src/services/__tests__/savingsService.pinLock.property.test.ts
 * Exits non-zero if any property fails.
 *
 * Uses `fast-check` (already installed in backend/node_modules) with a minimum
 * of 100 generated cases.
 */
import assert from 'node:assert';
import fc from 'fast-check';
import { isPinLocked } from '../savingsService';

const NUM_RUNS = 100; // task requires a minimum of 100 generated cases.

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  \u2713 ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`  \u2717 ${name}`);
    console.error(`    ${(err as Error).message}`);
  }
}

// A `now` instant across a wide range (never the real clock).
const nowArb = fc.date({
  min: new Date('2000-01-01T00:00:00.000Z'),
  max: new Date('2100-12-31T23:59:59.999Z'),
  noInvalidDate: true,
});

// A now-relative offset in milliseconds. Deliberately spans negative (past),
// zero (exactly equal — a boundary), and positive (future) values, with extra
// weight on the ±1 ms boundaries around equality.
const offsetMsArb = fc.oneof(
  fc.constantFrom(-1, 0, 1),
  fc.integer({ min: -400_000_000, max: 400_000_000 }),
);

console.log(
  '// Feature: savings-piggybank, Property 14: PIN-lock predicate is exactly "now before expiry"',
);

// ── Property 14, part A: matches the reference definition for a non-null expiry ──
//
// Validates: Requirements 12.14, 12.15
test('locked iff now < pinLockedUntil (non-null expiry, now-relative offsets)', () => {
  let sawLocked = false;
  let sawUnlocked = false;

  fc.assert(
    fc.property(nowArb, offsetMsArb, (now, offsetMs) => {
      const pinLockedUntil = new Date(now.getTime() + offsetMs);
      const expected = now.getTime() < pinLockedUntil.getTime(); // === offsetMs > 0

      const result = isPinLocked(pinLockedUntil, now);
      assert.strictEqual(
        result,
        expected,
        `now=${now.toISOString()} offsetMs=${offsetMs} pinLockedUntil=${pinLockedUntil.toISOString()}: expected ${expected}, got ${result}`,
      );

      if (result) sawLocked = true;
      else sawUnlocked = true;
    }),
    { numRuns: NUM_RUNS },
  );

  // Anti-vacuity: the run must exercise both sides of the boundary.
  assert.ok(sawLocked, 'anti-vacuity: no generated case produced a LOCKED result');
  assert.ok(sawUnlocked, 'anti-vacuity: no generated case produced an UNLOCKED result');
});

// ── Property 14, part B: a null expiry is always unlocked, for any `now` ────────
//
// Validates: Requirements 12.15, 12.17
test('null pinLockedUntil is always unlocked, regardless of now', () => {
  fc.assert(
    fc.property(nowArb, (now) => {
      assert.strictEqual(
        isPinLocked(null, now),
        false,
        `null expiry must be unlocked at now=${now.toISOString()}`,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 14, part C: an expiry at or before `now` is unlocked (12.15) ───────
//
// Validates: Requirements 12.15
test('expiry at or before now (elapsed cooldown) is unlocked', () => {
  fc.assert(
    fc.property(nowArb, fc.integer({ min: 0, max: 400_000_000 }), (now, backMs) => {
      // pinLockedUntil <= now  ⇒  cooldown elapsed (or exactly at the boundary).
      const pinLockedUntil = new Date(now.getTime() - backMs);
      assert.strictEqual(
        isPinLocked(pinLockedUntil, now),
        false,
        `elapsed lock must be unlocked: now=${now.toISOString()} pinLockedUntil=${pinLockedUntil.toISOString()}`,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 14, part D: an expiry strictly after `now` is locked (12.14) ───────
//
// Validates: Requirements 12.14
test('expiry strictly after now (cooldown not elapsed) is locked', () => {
  fc.assert(
    fc.property(nowArb, fc.integer({ min: 1, max: 400_000_000 }), (now, aheadMs) => {
      const pinLockedUntil = new Date(now.getTime() + aheadMs);
      assert.strictEqual(
        isPinLocked(pinLockedUntil, now),
        true,
        `future lock must be locked: now=${now.toISOString()} pinLockedUntil=${pinLockedUntil.toISOString()}`,
      );
    }),
    { numRuns: NUM_RUNS },
  );
});

// ── Property 14, part E: purity / determinism ──────────────────────────────────
//
// Validates: Requirements 12.14, 12.15, 12.17
test('predicate is pure — identical inputs yield identical results across repeats', () => {
  fc.assert(
    fc.property(
      nowArb,
      fc.option(offsetMsArb, { nil: undefined }),
      (now, maybeOffset) => {
        const pinLockedUntil =
          maybeOffset === undefined ? null : new Date(now.getTime() + maybeOffset);

        const a = isPinLocked(pinLockedUntil, now);
        const b = isPinLocked(pinLockedUntil, now);
        const c = isPinLocked(pinLockedUntil, now);
        assert.strictEqual(a, b, 'non-deterministic result on repeat call');
        assert.strictEqual(b, c, 'non-deterministic result on repeat call');
      },
    ),
    { numRuns: NUM_RUNS },
  );
});

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
