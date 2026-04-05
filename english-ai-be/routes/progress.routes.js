const express = require('express');
const router = express.Router();
const { addXP, leaderboard, report, dailyLogin, getUserProgress } = require('../controllers/progress.controller');

router.post('/add-xp', addXP);
router.get('/leaderboard', leaderboard);
router.get('/report/:userId', report);
router.post('/daily-login', dailyLogin);
router.get('/user/:userId', getUserProgress);

module.exports = router;
