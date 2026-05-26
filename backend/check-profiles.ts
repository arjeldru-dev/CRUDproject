import { prisma } from './src/config/db';

async function main() {
  console.log("=== USERS ===");
  const users = await prisma.user.findMany();
  console.log(users.map(u => ({ id: u.id, email: u.email, username: u.username, displayName: u.displayName })));

  console.log("\n=== FRIEND PROFILES ===");
  const profiles = await prisma.friendProfile.findMany();
  console.log(profiles.map(p => ({ id: p.id, name: p.name, mainUserId: p.mainUserId, friendUserId: p.friendUserId })));
}

main().catch(console.error).finally(() => prisma.$disconnect());
