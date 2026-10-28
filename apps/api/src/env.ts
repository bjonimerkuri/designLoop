import { config } from 'dotenv';
import { resolve } from 'node:path';

config({ path: resolve(__dirname, '../../../.env') });

process.env.DATABASE_URL ??= 'postgresql://designloop:designloop@localhost:5432/designloop';
