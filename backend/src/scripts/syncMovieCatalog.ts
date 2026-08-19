import dotenv from 'dotenv';
import movieCatalogService from '../services/movieCatalog.js';
import prisma from '../services/prisma.js';

dotenv.config();

/**
 * One-shot TMDB movie sweep: `npm run catalog:sync-movies`.
 * Banded by release year because TMDB caps any single discover query at 500
 * pages, so this walks ~1,400 requests rather than one paginated index.
 */
async function main() {
  const started = Date.now();
  const count = await movieCatalogService.syncCatalog({
    onProgress: (year, total) => console.log(`  ${year} … ${total} titles`),
  });
  console.log(
    `Movie catalog sync complete: ${count} titles in ${Math.round((Date.now() - started) / 1000)}s`
  );
}

main()
  .catch(err => {
    console.error('Movie catalog sync failed:', err.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
