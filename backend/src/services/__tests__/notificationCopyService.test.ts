/**
 * Unit tests for notificationCopyService.
 *
 * Self-contained assertion script (no jest):
 *   npx ts-node src/services/__tests__/notificationCopyService.test.ts
 * No LLM key is set, so template pools are seeded directly via the test helper
 * and no network call is ever made (a cache miss simply returns null).
 */
import assert from 'node:assert';
import type { NotificationType } from '@prisma/client';

process.env.LLM_PROVIDER = 'gemini';
delete process.env.GEMINI_API_KEY;
delete process.env.GROQ_API_KEY;

import {
  isValidTemplate,
  isEnhancedType,
  pickTemplate,
  fillTemplate,
  resolveFriendlyCopy,
  __setPoolForTests,
  __resetCopyCacheForTests,
  type Placeholder,
} from '../notificationCopyService';

const FRIEND_REQUEST_RECEIVED = 'FRIEND_REQUEST_RECEIVED' as NotificationType;
const CHALLENGE_INVITE = 'CHALLENGE_INVITE' as NotificationType;
const FEED_REACTION = 'FEED_REACTION' as NotificationType;
const TRANSACTION_APPROVED = 'TRANSACTION_APPROVED' as NotificationType;

const actorOnly = { description: 'x', allowed: ['actor'] as Placeholder[], required: ['actor'] as Placeholder[] };

let passed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${(err as Error).message}`);
    console.error(`  ✗ ${name}`);
  }
}

async function main() {
  console.log('notificationCopyService');

  // ── isValidTemplate ───────────────────────────────────────────────────
  await test('accepts a template using only allowed + all required placeholders', () => {
    assert.strictEqual(isValidTemplate('Nice — {actor} accepted your request 🎉', actorOnly), true);
  });

  await test('discards a template with a disallowed placeholder', () => {
    assert.strictEqual(isValidTemplate('{actor} paid {amount}', actorOnly), false);
  });

  await test('discards a template missing a required placeholder', () => {
    assert.strictEqual(isValidTemplate('Someone accepted your request', actorOnly), false);
  });

  await test('discards HTML / overly long templates', () => {
    assert.strictEqual(isValidTemplate('<b>{actor}</b>', actorOnly), false);
    assert.strictEqual(isValidTemplate(`{actor} ${'x'.repeat(200)}`, actorOnly), false);
  });

  await test('multi-placeholder type requires all of them', () => {
    const cfg = {
      description: 'x',
      allowed: ['actor', 'challengeName'] as Placeholder[],
      required: ['actor', 'challengeName'] as Placeholder[],
    };
    assert.strictEqual(isValidTemplate('{actor} invited you to {challengeName}', cfg), true);
    assert.strictEqual(isValidTemplate('{actor} invited you to a challenge', cfg), false);
  });

  // ── isEnhancedType (allow-list) ───────────────────────────────────────
  await test('allow-list honored: social/money types are not enhanced', () => {
    assert.strictEqual(isEnhancedType(FRIEND_REQUEST_RECEIVED), true);
    assert.strictEqual(isEnhancedType(CHALLENGE_INVITE), true);
    assert.strictEqual(isEnhancedType(FEED_REACTION), false);
    assert.strictEqual(isEnhancedType(TRANSACTION_APPROVED), false);
  });

  // ── pickTemplate (deterministic by seed) ──────────────────────────────
  await test('pickTemplate is deterministic for the same seed', () => {
    __resetCopyCacheForTests();
    __setPoolForTests(FRIEND_REQUEST_RECEIVED, ['A {actor}', 'B {actor}', 'C {actor}']);
    const a = pickTemplate(FRIEND_REQUEST_RECEIVED, 'notif-123');
    const b = pickTemplate(FRIEND_REQUEST_RECEIVED, 'notif-123');
    assert.strictEqual(a, b);
    assert.ok(a && ['A {actor}', 'B {actor}', 'C {actor}'].includes(a));
  });

  await test('pickTemplate returns null (no network) on a cache miss with no key', () => {
    __resetCopyCacheForTests();
    assert.strictEqual(pickTemplate(FRIEND_REQUEST_RECEIVED, 'seed'), null);
  });

  await test('pickTemplate returns null for a non-enhanced type', () => {
    __resetCopyCacheForTests();
    __setPoolForTests(FEED_REACTION, ['{actor} reacted']);
    assert.strictEqual(pickTemplate(FEED_REACTION, 'seed'), null);
  });

  // ── fillTemplate (pure, injection-safe) ───────────────────────────────
  await test('fillTemplate substitutes placeholder values as plain text', () => {
    assert.strictEqual(fillTemplate('Nice — {actor} accepted! 🎉', { actor: 'Bea' }), 'Nice — Bea accepted! 🎉');
  });

  await test('fillTemplate returns null when a needed value is missing', () => {
    assert.strictEqual(fillTemplate('{actor} invited you to {challengeName}', { actor: 'Bea' }), null);
  });

  await test('fillTemplate inserts a crafted value literally (no injection)', () => {
    // A value containing braces/HTML must be inserted verbatim, never re-parsed.
    assert.strictEqual(fillTemplate('Hi {actor}', { actor: '<b>{amount}</b>' }), 'Hi <b>{amount}</b>');
  });

  // ── resolveFriendlyCopy ───────────────────────────────────────────────
  await test('resolveFriendlyCopy fills a cached template deterministically', () => {
    __resetCopyCacheForTests();
    __setPoolForTests(FRIEND_REQUEST_RECEIVED, ['Yay, {actor} said yes!']);
    const out = resolveFriendlyCopy(FRIEND_REQUEST_RECEIVED, 'seed', { actor: 'Cy' });
    assert.strictEqual(out, 'Yay, Cy said yes!');
  });

  await test('resolveFriendlyCopy returns null when no pool is cached', () => {
    __resetCopyCacheForTests();
    assert.strictEqual(resolveFriendlyCopy(CHALLENGE_INVITE, 'seed', { actor: 'Cy' }), null);
  });

  console.log(`\nnotificationCopyService: ${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) {
    failures.forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
}

main();
