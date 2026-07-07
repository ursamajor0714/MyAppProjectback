require('dotenv').config();
const prisma = require('./db');

async function main() {
  const sessions = await prisma.telemedicineSession.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log('Recent 10 telemedicine sessions in DB:');
  console.log(JSON.stringify(sessions, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
