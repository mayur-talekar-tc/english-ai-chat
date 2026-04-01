const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/lessons', require('./routes/lessons.routes'));
app.use('/api/quiz', require('./routes/quiz.routes'));
app.use('/api/ai', require('./routes/ai.routes'));

// TTS proxy - fetches Google Translate audio and sends to frontend (avoids CORS)
app.get('/api/tts', async (req, res) => {
  const { text, lang } = req.query;
  if (!text) return res.status(400).json({ error: 'text required' });
  const tl = lang || 'en';
  const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${tl}&client=tw-ob&q=${encodeURIComponent(text)}`;
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!response.ok) throw new Error('TTS fetch failed');
    res.set('Content-Type', 'audio/mpeg');
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch {
    res.status(500).json({ error: 'TTS failed' });
  }
});

app.get('/', (req, res) => {
  res.json({ message: 'BhashaAI Backend Running!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});