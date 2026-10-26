import { resolve } from 'node:path';

export const STORAGE_DIR = process.env.STORAGE_DIR ?? resolve(__dirname, '..', 'storage');
export const EVALS_DIR = process.env.EVALS_DIR ?? resolve(__dirname, '..', '..', '..', 'evals', 'results');
