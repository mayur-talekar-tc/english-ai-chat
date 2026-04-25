const express = require('express');
const router = express.Router();
const aiController = require('../controllers/ai.controller');

router.post('/chat', aiController.chat);
router.post('/translate', aiController.translate);
router.post('/multi-voice', aiController.multiVoice);
router.post('/correct', aiController.correct);
router.post('/quiz', aiController.quiz);
router.post('/vocabulary', aiController.vocabulary);
router.post('/word-details', aiController.wordDetails);
router.post('/daily-words', aiController.dailyWords);
router.post('/fill-blank', aiController.fillBlank);
router.post('/reading', aiController.reading);
router.post('/book-summary', aiController.bookSummary);

module.exports = router;
