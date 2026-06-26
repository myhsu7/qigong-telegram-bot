import { Pool } from 'pg';
import { env } from './config/env';

export const pool = new Pool({
    connectionString: env.databaseUrl || undefined
});

export const db = {
    query: (text: string, params?: unknown[]) => pool.query(text, params),
    getClient: () => pool.connect()
};
