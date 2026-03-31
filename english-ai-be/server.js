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

app.get('/', (req, res) => {
  res.json({ message: 'BhashaAI Backend Running!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});