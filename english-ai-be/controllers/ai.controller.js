const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });

exports.chat = async (req, res) => {
  try {
    const { message, language, userLevel } = req.body;

    const prompt = `You are a ${language} language tutor.
    Student level: ${userLevel || 'beginner'}.
    Teach in a friendly, simple way.
    Student says: ${message}`;

    console.log('[AI Chat] Request:', { message, language, userLevel });

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    console.log('[AI Chat] Success, reply length:', reply.length);
    res.json({ success: true, reply });

  } catch (error) {
    console.error('[AI Chat] Error:', error.message);
    const msg = error.message || 'Something went wrong';
    if (msg.includes('429') || msg.includes('quota')) {
      res.json({ success: false, reply: 'AI service is temporarily busy. Please try again in a few seconds.' });
    } else {
      res.json({ success: false, reply: 'Sorry, something went wrong. Please try again.' });
    }
  }
};

exports.correct = async (req, res) => {
  try {
    const { text, language } = req.body;

    const prompt = `Check this ${language} sentence for grammar mistakes:
    "${text}"
    Give corrections in simple way.`;

    console.log('[AI Correct] Request:', { text, language });

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    console.log('[AI Correct] Success');
    res.json({ success: true, reply });

  } catch (error) {
    console.error('[AI Correct] Error:', error.message);
    const msg = error.message || 'Something went wrong';
    if (msg.includes('429') || msg.includes('quota')) {
      res.json({ success: false, reply: 'AI service is temporarily busy. Please try again in a few seconds.' });
    } else {
      res.json({ success: false, reply: 'Sorry, something went wrong. Please try again.' });
    }
  }
};
