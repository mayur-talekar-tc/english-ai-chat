require('dotenv').config();
const { Pool } = require('pg');

const { DATABASE_URL } = process.env;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set in the environment.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

pool.on('error', (error) => {
  console.error('Unexpected PostgreSQL pool error:', error);
});

async function connectDatabase() {
  try {
    const client = await pool.connect();
    client.release();
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

module.exports = { pool, connectDatabase };
