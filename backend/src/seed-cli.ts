import { DATA_DB_PATH } from './db.ts';
import { demoDataset } from './demo-dataset.ts';
import { seedFile } from './seed.ts';

try {
  seedFile(DATA_DB_PATH, demoDataset);
  console.log(`Seeded ${DATA_DB_PATH}`);
} catch (error) {
  console.error(`Seed failed: ${(error as Error).message}`);
  process.exitCode = 1;
}
