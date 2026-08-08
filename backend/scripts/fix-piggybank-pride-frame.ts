/**
 * One-off script: Fix Piggybank Pride frame unlock requirement.
 *
 * Sets `pointsRequired` to 0 for the `blush_piggy` frame so it unlocks
 * purely via savings enablement (no points needed).
 *
 * Usage:
 *   npx ts-node scripts/fix-piggybank-pride-frame.ts
 */

import { prisma } from '../src/config/db';

async function main() {
  const frame = await prisma.avatarFrame.findUnique({
    where: { slug: 'blush_piggy' },
  });

  if (!frame) {
    console.error('❌ Frame "blush_piggy" not found in avatar_frames table.');
    process.exit(1);
  }

  console.log(`🔍 Found frame: "${frame.name}" (${frame.slug})`);
  console.log(`   Current pointsRequired: ${frame.pointsRequired}`);

  if (frame.pointsRequired === 0) {
    console.log('✅ Already set to 0 — nothing to change.');
    process.exit(0);
  }

  await prisma.avatarFrame.update({
    where: { slug: 'blush_piggy' },
    data: { pointsRequired: 0 },
  });

  console.log(`\n✅ Updated "Piggybank Pride" → pointsRequired: 0`);
  console.log('   Frame now unlocks when savings is enabled (no points needed).');
}

main()
  .catch((err) => {
    console.error('💥 Script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
