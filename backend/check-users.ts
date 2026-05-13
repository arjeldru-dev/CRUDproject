import { prisma } from './src/config/db';

async function main() {
  const users = await prisma.user.findMany({ select: { id: true, username: true, displayName: true } });
  console.log("Users:", users);
}

main().catch(console.error).finally(() => prisma.$disconnect());
