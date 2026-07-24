/**
 * DB-free unit tests for the category-rename → feed-post propagation helper.
 * Verifies the pure content-rewrite logic used by feedService.renameCategoryInPosts
 * so a renamed budget category updates the frozen name snapshots on feed posts.
 *
 *   npx ts-node src/services/__tests__/feedCategoryRename.test.ts
 */
import assert from 'node:assert';
import { applyCategoryRenameToContent } from '../feedService';

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

console.log('applyCategoryRenameToContent (feed rename propagation)');

test('rewrites categoryName and the name inside description', () => {
  const content = JSON.stringify({
    description: 'added a Groceries split — ₱500 with Juan',
    amount: 500,
    categoryName: 'Groceries',
    friendName: 'Juan',
  });
  const next = applyCategoryRenameToContent(content, 'Groceries', 'Palengke');
  assert.ok(next !== null, 'expected an updated content string');
  const parsed = JSON.parse(next!);
  assert.strictEqual(parsed.categoryName, 'Palengke');
  assert.strictEqual(parsed.description, 'added a Palengke split — ₱500 with Juan');
  // Untouched fields are preserved.
  assert.strictEqual(parsed.amount, 500);
  assert.strictEqual(parsed.friendName, 'Juan');
});

test('rewrites a budget-milestone description (no amount/friend fields)', () => {
  const content = JSON.stringify({
    description: 'reached 80% of their Transport budget',
    categoryName: 'Transport',
    percentage: 80,
  });
  const next = applyCategoryRenameToContent(content, 'Transport', 'Pamasahe');
  assert.ok(next !== null);
  const parsed = JSON.parse(next!);
  assert.strictEqual(parsed.categoryName, 'Pamasahe');
  assert.strictEqual(parsed.description, 'reached 80% of their Pamasahe budget');
  assert.strictEqual(parsed.percentage, 80);
});

test('returns null for a post that snapshots a different category', () => {
  const content = JSON.stringify({ description: 'added a Dining split', categoryName: 'Dining' });
  assert.strictEqual(applyCategoryRenameToContent(content, 'Groceries', 'Palengke'), null);
});

test('returns null when old and new names are identical (no-op rename)', () => {
  const content = JSON.stringify({ description: 'added a Groceries split', categoryName: 'Groceries' });
  assert.strictEqual(applyCategoryRenameToContent(content, 'Groceries', 'Groceries'), null);
});

test('returns null for unparseable content (e.g. legacy/corrupt row)', () => {
  assert.strictEqual(applyCategoryRenameToContent('not json', 'Groceries', 'Palengke'), null);
});

test('returns null when there is no categoryName (badge/streak posts)', () => {
  const content = JSON.stringify({ description: 'earned the Nest Egg badge 🔥', badgeName: 'Nest Egg' });
  assert.strictEqual(applyCategoryRenameToContent(content, 'Groceries', 'Palengke'), null);
});

test('only rewrites the category token, never a friend name that contains it', () => {
  // Category "Ben" whose split partner is "Bennett" — a blanket replace would
  // corrupt the friend name. Anchored replacement must leave "Bennett" intact.
  const content = JSON.stringify({
    description: 'added a Ben split — ₱500 with Bennett',
    amount: 500,
    categoryName: 'Ben',
    friendName: 'Bennett',
  });
  const next = applyCategoryRenameToContent(content, 'Ben', 'Kuya');
  assert.ok(next !== null);
  const parsed = JSON.parse(next!);
  assert.strictEqual(parsed.categoryName, 'Kuya');
  assert.strictEqual(parsed.description, 'added a Kuya split — ₱500 with Bennett');
  assert.strictEqual(parsed.friendName, 'Bennett');
});

test('corrects the categoryName field even when the description template does not match', () => {
  // If a description ever uses wording without the known anchor, the exact
  // categoryName field is still fixed while the prose is left untouched (stale,
  // never corrupted) rather than blindly string-replaced.
  const content = JSON.stringify({
    description: 'logged a Food purchase',
    categoryName: 'Food',
  });
  const next = applyCategoryRenameToContent(content, 'Food', 'Meals');
  assert.ok(next !== null);
  const parsed = JSON.parse(next!);
  assert.strictEqual(parsed.categoryName, 'Meals');
  assert.strictEqual(parsed.description, 'logged a Food purchase');
});

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('\nFailures:');
  failures.forEach((f) => console.error(`  - ${f}`));
  process.exit(1);
}
