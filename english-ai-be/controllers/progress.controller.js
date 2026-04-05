const { pool } = require('../db/connection');

// XP thresholds for levels
const LEVELS = [
  { min: 0, max: 100, level: 1, name: 'Beginner', badge: '🌱' },
  { min: 101, max: 300, level: 2, name: 'Bronze', badge: '🥉' },
  { min: 301, max: 600, level: 3, name: 'Silver', badge: '🥈' },
  { min: 601, max: 1000, level: 4, name: 'Gold', badge: '🥇' },
  { min: 1001, max: Infinity, level: 5, name: 'Champion', badge: '🏆' },
];

function getLevelFromXP(xp) {
  for (const l of LEVELS) {
    if (xp >= l.min && xp <= l.max) return l;
  }
  return LEVELS[LEVELS.length - 1];
}

// Reset weekly stats if needed
async function checkWeeklyReset(userId) {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0=Sunday, 1=Monday
  const todayStr = today.toISOString().split('T')[0];

  const result = await pool.query(
    'SELECT weekly_reset_date FROM user_progress WHERE user_id = $1 AND language = $2',
    [userId, 'general']
  );

  if (result.rowCount > 0) {
    const lastReset = result.rows[0].weekly_reset_date;
    const lastResetStr = lastReset ? new Date(lastReset).toISOString().split('T')[0] : null;

    // Reset on Monday if not already reset this week
    if (dayOfWeek === 1 && lastResetStr !== todayStr) {
      await pool.query(
        `UPDATE user_progress SET weekly_xp = 0, words_learned_week = 0,
         quiz_correct = 0, quiz_total = 0, spelling_correct = 0, spelling_total = 0,
         weekly_reset_date = $2
         WHERE user_id = $1 AND language = 'general'`,
        [userId, todayStr]
      );
    }
  }
}

// POST /api/progress/add-xp
const addXP = async (req, res) => {
  const { userId, xp, type } = req.body;

  if (!userId || !xp) {
    return res.status(400).json({ success: false, error: 'userId and xp required' });
  }

  try {
    await checkWeeklyReset(userId);

    // Update XP
    const result = await pool.query(
      `UPDATE user_progress
       SET total_xp = total_xp + $2,
           weekly_xp = weekly_xp + $2,
           xp_points = xp_points + $2,
           words_learned = CASE WHEN $3 = 'word' THEN words_learned + 1 ELSE words_learned END,
           words_learned_today = CASE WHEN $3 = 'word' THEN words_learned_today + 1 ELSE words_learned_today END,
           words_learned_week = CASE WHEN $3 = 'word' THEN words_learned_week + 1 ELSE words_learned_week END,
           quiz_correct = CASE WHEN $3 = 'quiz_correct' THEN quiz_correct + 1 ELSE quiz_correct END,
           quiz_total = CASE WHEN $3 = 'quiz_total' THEN quiz_total + 1 ELSE quiz_total END,
           spelling_correct = CASE WHEN $3 = 'spelling_correct' THEN spelling_correct + 1 ELSE spelling_correct END,
           spelling_total = CASE WHEN $3 = 'spelling_total' THEN spelling_total + 1 ELSE spelling_total END,
           last_active = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND language = 'general'
       RETURNING total_xp, weekly_xp, level, words_learned, login_streak`,
      [userId, xp, type || 'general']
    );

    if (result.rowCount === 0) {
      // Create progress row if it doesn't exist
      await pool.query(
        `INSERT INTO user_progress (user_id, language, total_xp, weekly_xp, xp_points, last_active)
         VALUES ($1, 'general', $2, $2, $2, CURRENT_TIMESTAMP)
         ON CONFLICT (user_id, language) DO NOTHING`,
        [userId, xp]
      );
      return res.json({ success: true, total_xp: xp, level: getLevelFromXP(xp) });
    }

    const row = result.rows[0];
    const levelInfo = getLevelFromXP(row.total_xp);

    // Update level in DB
    if (levelInfo.level !== row.level) {
      await pool.query(
        'UPDATE user_progress SET level = $2 WHERE user_id = $1 AND language = $3',
        [userId, levelInfo.level, 'general']
      );
    }

    res.json({
      success: true,
      total_xp: row.total_xp,
      weekly_xp: row.weekly_xp,
      level: levelInfo,
      words_learned: row.words_learned,
      levelUp: levelInfo.level !== row.level,
    });
  } catch (error) {
    console.error('[Progress] addXP error:', error);
    res.status(500).json({ success: false, error: 'Failed to add XP' });
  }
};

// GET /api/progress/leaderboard
const leaderboard = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, up.weekly_xp, up.total_xp, up.words_learned, up.level
       FROM users u
       JOIN user_progress up ON u.id = up.user_id AND up.language = 'general'
       ORDER BY up.weekly_xp DESC
       LIMIT 10`
    );

    const leaders = result.rows.map((row, index) => ({
      rank: index + 1,
      id: row.id,
      name: row.name,
      xp: row.weekly_xp,
      totalXp: row.total_xp,
      wordsLearned: row.words_learned,
      level: getLevelFromXP(row.total_xp),
    }));

    res.json({ success: true, leaders });
  } catch (error) {
    console.error('[Progress] leaderboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch leaderboard' });
  }
};

// GET /api/progress/report/:userId
const report = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT up.*, u.name
       FROM user_progress up
       JOIN users u ON u.id = up.user_id
       WHERE up.user_id = $1 AND up.language = 'general'`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.json({ success: false, error: 'User not found' });
    }

    const row = result.rows[0];
    const quizAccuracy = row.quiz_total > 0 ? Math.round((row.quiz_correct / row.quiz_total) * 100) : 0;
    const spellingScore = row.spelling_total > 0 ? Math.round((row.spelling_correct / row.spelling_total) * 100) : 0;
    const overallScore = Math.round((quizAccuracy + spellingScore) / 2) || 0;

    let grade = 'C';
    if (overallScore >= 90) grade = 'A+';
    else if (overallScore >= 80) grade = 'A';
    else if (overallScore >= 70) grade = 'B';

    res.json({
      success: true,
      report: {
        name: row.name,
        wordsLearnedWeek: row.words_learned_week,
        quizAccuracy,
        spellingScore,
        streak: row.login_streak,
        grade,
        totalXp: row.total_xp,
        level: getLevelFromXP(row.total_xp),
      },
    });
  } catch (error) {
    console.error('[Progress] report error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch report' });
  }
};

// POST /api/progress/daily-login
const dailyLogin = async (req, res) => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ success: false, error: 'userId required' });
  }

  try {
    // Use UTC date consistently to avoid timezone mismatches
    const now = new Date();
    const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

    const result = await pool.query(
      'SELECT last_login, login_streak, total_xp FROM user_progress WHERE user_id = $1 AND language = $2',
      [userId, 'general']
    );

    if (result.rowCount === 0) {
      // Create if not exists
      await pool.query(
        `INSERT INTO user_progress (user_id, language, last_login, login_streak, total_xp, xp_points)
         VALUES ($1, 'general', $2, 1, 5, 5)
         ON CONFLICT (user_id, language) DO NOTHING`,
        [userId, todayStr]
      );
      return res.json({ success: true, reward: 5, streak: 1, alreadyClaimed: false });
    }

    const row = result.rows[0];
    // PostgreSQL DATE comes as Date object at midnight UTC - extract YYYY-MM-DD safely
    let lastLogin = null;
    if (row.last_login) {
      const d = new Date(row.last_login);
      lastLogin = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    }

    // Already claimed today
    if (lastLogin === todayStr) {
      return res.json({
        success: true,
        reward: 0,
        streak: row.login_streak,
        alreadyClaimed: true,
        total_xp: row.total_xp,
        level: getLevelFromXP(row.total_xp),
      });
    }

    // Calculate streak - compare using UTC dates properly
    const yesterdayDate = new Date(Date.now() - 86400000);
    const yesterday = `${yesterdayDate.getUTCFullYear()}-${String(yesterdayDate.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterdayDate.getUTCDate()).padStart(2, '0')}`;
    let newStreak = 1;
    if (lastLogin === yesterday) {
      newStreak = (row.login_streak || 0) + 1;
    }

    // Calculate reward based on streak
    let reward = 5;
    if (newStreak >= 30) reward = 50;
    else if (newStreak >= 7) reward = 20;
    else if (newStreak >= 3) reward = 10;

    await pool.query(
      `UPDATE user_progress
       SET last_login = $2, login_streak = $3,
           total_xp = total_xp + $4, weekly_xp = weekly_xp + $4, xp_points = xp_points + $4,
           words_learned_today = 0
       WHERE user_id = $1 AND language = 'general'`,
      [userId, todayStr, newStreak, reward]
    );

    const updatedResult = await pool.query(
      'SELECT total_xp FROM user_progress WHERE user_id = $1 AND language = $2',
      [userId, 'general']
    );

    const totalXp = updatedResult.rows[0]?.total_xp || 0;

    res.json({
      success: true,
      reward,
      streak: newStreak,
      alreadyClaimed: false,
      total_xp: totalXp,
      level: getLevelFromXP(totalXp),
    });
  } catch (error) {
    console.error('[Progress] dailyLogin error:', error);
    res.status(500).json({ success: false, error: 'Failed to process daily login' });
  }
};

// GET /api/progress/user/:userId
const getUserProgress = async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      `SELECT up.*, u.name
       FROM user_progress up
       JOIN users u ON u.id = up.user_id
       WHERE up.user_id = $1 AND up.language = 'general'`,
      [userId]
    );

    if (result.rowCount === 0) {
      return res.json({
        success: true,
        progress: {
          total_xp: 0,
          weekly_xp: 0,
          level: getLevelFromXP(0),
          words_learned: 0,
          login_streak: 0,
        },
      });
    }

    const row = result.rows[0];
    res.json({
      success: true,
      progress: {
        total_xp: row.total_xp,
        weekly_xp: row.weekly_xp,
        level: getLevelFromXP(row.total_xp),
        words_learned: row.words_learned,
        login_streak: row.login_streak,
        streak_days: row.streak_days,
        name: row.name,
      },
    });
  } catch (error) {
    console.error('[Progress] getUserProgress error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch progress' });
  }
};

// GET /api/progress/teacher - Teacher dashboard data
const teacherDashboard = async (req, res) => {
  const { password } = req.query;

  if (password !== 'teacher123') {
    return res.status(401).json({ success: false, error: 'Invalid password' });
  }

  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.email, u.created_at,
              COALESCE(up.total_xp, 0) as total_xp,
              COALESCE(up.words_learned, 0) as words_learned,
              COALESCE(up.login_streak, 0) as login_streak,
              COALESCE(up.level, 1) as level,
              up.last_active
       FROM users u
       LEFT JOIN user_progress up ON u.id = up.user_id AND up.language = 'general'
       ORDER BY COALESCE(up.total_xp, 0) DESC`
    );

    const students = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      totalXp: row.total_xp,
      wordsLearned: row.words_learned,
      loginStreak: row.login_streak,
      level: getLevelFromXP(row.total_xp),
      lastActive: row.last_active,
      joinedAt: row.created_at,
    }));

    res.json({ success: true, students });
  } catch (error) {
    console.error('[Progress] teacherDashboard error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch students' });
  }
};

module.exports = { addXP, leaderboard, report, dailyLogin, getUserProgress, teacherDashboard };
