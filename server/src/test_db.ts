import 'dotenv/config';
import { prisma } from './config/db.js';

async function main() {
  try {
    const users = await prisma.user.findMany();
    console.log('Successfully connected! Users count:', users.length);
  } catch (error) {
    console.error('Error during connection:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
