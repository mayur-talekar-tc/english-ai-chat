const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');

router.post('/chat', aiController.chat);
router.post('/correct', aiController.correct);

module.exports = router;