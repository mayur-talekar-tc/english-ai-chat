const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db/connection');

const JWT_SECRET = process.env.JWT_SECRET || 'bhashaai-dev-secret';
const JWT_EXPIRES_IN = '7d';
const DEFAULT_PROGRESS_LANGUAGE = 'general';

function buildToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    created_at: row.created_at,
  };
}

const register = async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ success: false, error: 'All fields are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (existingUser.rowCount > 0) {
      return res.status(409).json({ success: false, error: 'Email already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name.trim(), normalizedEmail, passwordHash]
    );

    const user = result.rows[0];

    await pool.query(
      `INSERT INTO user_progress (user_id, language, last_active)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, language)
       DO UPDATE SET last_active = CURRENT_TIMESTAMP`,
      [user.id, DEFAULT_PROGRESS_LANGUAGE]
    );

    const token = buildToken(user);

    return res.status(201).json({
      success: true,
      token,
      user: serializeUser(user),
      isNewUser: true,
    });
  } catch (error) {
    console.error('Register failed:', error);
    return res.status(500).json({ success: false, error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'All fields are required' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const result = await pool.query(
      `SELECT id, name, email, password_hash, created_at
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    await pool.query(
      `INSERT INTO user_progress (user_id, language, last_active)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, language)
       DO UPDATE SET last_active = CURRENT_TIMESTAMP`,
      [user.id, DEFAULT_PROGRESS_LANGUAGE]
    );

    const token = buildToken(user);

    return res.json({
      success: true,
      token,
      user: serializeUser(user),
    });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ success: false, error: 'Login failed' });
  }
};

const me = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, created_at
       FROM users
       WHERE id = $1`,
      [req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    return res.json({
      success: true,
      user: serializeUser(result.rows[0]),
    });
  } catch (error) {
    console.error('Fetching current user failed:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch user' });
  }
};

module.exports = { register, login, me };
