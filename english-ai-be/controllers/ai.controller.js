const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

exports.chat = async (req, res) => {
  try {
    const { message, language, userLevel } = req.body;

    const prompt = `You are a ${language} language tutor. 
    Student level: ${userLevel}. 
    Teach in a friendly, simple way.
    Student says: ${message}`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    res.json({ success: true, reply });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

exports.correct = async (req, res) => {
  try {
    const { text, language } = req.body;

    const prompt = `Check this ${language} sentence for grammar mistakes: 
    "${text}"
    Give corrections in simple way.`;

    const result = await model.generateContent(prompt);
    const reply = result.response.text();

    res.json({ success: true, reply });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};