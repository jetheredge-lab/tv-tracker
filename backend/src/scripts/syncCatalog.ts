import dotenv from 'dotenv';
import catalogService from '../services/catalog.js';
import prisma from '../services/prisma.js';

dotenv.config();

/**
 * One-shot TVmaze index sync: `npm run catalog:sync`.
 * Takes a couple of minutes - ~390 pages at 250 shows each.
 */
async function main() {
  const started = Date.now();
  const count = await catalogService.syncCatalog({
    onProgress: (page, total) => {
      if (page % 25 === 0) console.log(`  page ${page} … ${total} shows`);
    },
  });
  console.log(`Catalog sync complete: ${count} shows in ${Math.round((Date.now() - started) / 1000)}s`);
}

main()
  .catch(err => {
    console.error('Catalog sync failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
