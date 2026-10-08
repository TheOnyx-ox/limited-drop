import 'dotenv/config';

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl || !/test/i.test(new URL(testUrl).pathname)) {
  throw new Error('Set TEST_DATABASE_URL in .env to a database whose name contains "test".');
}
process.env.DATABASE_URL = testUrl;
process.env.RESERVATION_TTL_MS = '120000';
process.env.SWEEPER_ENABLED = 'false'; // tests call the sweeper explicitly
process.env.SEED_ON_BOOT = 'false';