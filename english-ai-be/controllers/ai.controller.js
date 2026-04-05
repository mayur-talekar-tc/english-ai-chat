const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_CLOUD });

// In-memory cache for daily words (keyed by date+language)
const dailyWordsCache = new Map();

const QUIZ_FALLBACKS = {
  vocabulary: [
    {
      question: 'Which word is closest in meaning to "helpful"?',
      options: ['Kind', 'Lazy', 'Silent', 'Tiny'],
      correct: 0,
      explanation: '"Helpful" means useful or kind in action, so "Kind" is the best match.',
    },
    {
      question: 'What does "rapid" mean?',
      options: ['Slow', 'Fast', 'Broken', 'Bright'],
      correct: 1,
      explanation: '"Rapid" means fast or quick.',
    },
    {
      question: 'Choose the best antonym for "ancient".',
      options: ['Modern', 'Wide', 'Quiet', 'Strong'],
      correct: 0,
      explanation: '"Ancient" means very old, so its opposite is "Modern."',
    },
    {
      question: 'What is the meaning of "beginner"?',
      options: ['Expert', 'New learner', 'Teacher', 'Judge'],
      correct: 1,
      explanation: 'A beginner is someone who is just starting to learn.',
    },
    {
      question: 'Which word means "very small"?',
      options: ['Huge', 'Tiny', 'Brave', 'Polite'],
      correct: 1,
      explanation: '"Tiny" means very small.',
    },
  ],
  grammar: [
    {
      question: 'Choose the correct sentence.',
      options: ['She go to school.', 'She goes to school.', 'She going to school.', 'She gone to school.'],
      correct: 1,
      explanation: 'With "she" in the simple present, the verb takes "s": "goes."',
    },
    {
      question: 'Fill in the blank: They _____ playing football.',
      options: ['is', 'am', 'are', 'be'],
      correct: 2,
      explanation: '"They" takes "are" in the present continuous tense.',
    },
    {
      question: 'Which sentence is in the past tense?',
      options: ['I eat breakfast.', 'I am eating breakfast.', 'I ate breakfast.', 'I will eat breakfast.'],
      correct: 2,
      explanation: '"Ate" is the past-tense form of "eat."',
    },
    {
      question: 'Choose the correct article: I saw _____ elephant.',
      options: ['a', 'an', 'the', 'no article'],
      correct: 1,
      explanation: '"Elephant" starts with a vowel sound, so "an" is correct.',
    },
    {
      question: 'Which sentence uses the plural noun correctly?',
      options: ['Two child are here.', 'Two children are here.', 'Two childs are here.', 'Two children is here.'],
      correct: 1,
      explanation: 'The plural of "child" is "children," and it takes "are."',
    },
  ],
  listening: [
    {
      question: 'In listening practice, what helps most with understanding fast speech?',
      options: ['Ignoring stress patterns', 'Listening once only', 'Noticing key words and tone', 'Memorizing spelling only'],
      correct: 2,
      explanation: 'Key words, stress, and tone help listeners understand meaning even when speech is fast.',
    },
    {
      question: 'What should you focus on first in a short audio clip?',
      options: ['Every single word', 'Main idea', 'Punctuation', 'Handwriting'],
      correct: 1,
      explanation: 'Understanding the main idea first makes detailed listening easier.',
    },
    {
      question: 'If you miss one word while listening, the best strategy is to:',
      options: ['Stop paying attention', 'Guess from context and continue', 'Translate every word', 'Replay in your head only'],
      correct: 1,
      explanation: 'Good listeners use context and keep going instead of getting stuck.',
    },
    {
      question: 'Which clue often shows that a speaker is asking a question?',
      options: ['Flat tone', 'Rising intonation', 'Lower volume only', 'Slower handwriting'],
      correct: 1,
      explanation: 'Questions often use rising intonation in speech.',
    },
    {
      question: 'Listening for connectors like "because" and "but" helps you understand:',
      options: ['Speaker logic', 'Only pronunciation', 'Alphabet order', 'Typing speed'],
      correct: 0,
      explanation: 'Connectors show contrast, reason, and flow of ideas.',
    },
  ],
  speaking: [
    {
      question: 'What improves speaking fluency most over time?',
      options: ['Staying silent', 'Regular speaking practice', 'Only reading rules', 'Avoiding mistakes completely'],
      correct: 1,
      explanation: 'Fluency grows through consistent speaking practice, not perfection.',
    },
    {
      question: 'If you forget a word while speaking, you should:',
      options: ['Stop immediately', 'Use simpler words to explain it', 'Switch off the conversation', 'Repeat the same sound'],
      correct: 1,
      explanation: 'Paraphrasing keeps the conversation moving.',
    },
    {
      question: 'Clear pronunciation depends a lot on:',
      options: ['Speaking as fast as possible', 'Stress and mouth movement', 'Only grammar drills', 'Writing long essays'],
      correct: 1,
      explanation: 'Stress, rhythm, and articulation are central to understandable speech.',
    },
    {
      question: 'Which habit helps build confidence while speaking?',
      options: ['Waiting to be perfect', 'Using short, correct sentences first', 'Avoiding practice', 'Speaking without listening'],
      correct: 1,
      explanation: 'Short, accurate sentences help speakers build confidence steadily.',
    },
    {
      question: 'What is the best response when you make a small speaking mistake?',
      options: ['Quit the conversation', 'Correct it and continue', 'Hide your voice', 'Restart from the beginning every time'],
      correct: 1,
      explanation: 'Small self-corrections are normal and help communication continue smoothly.',
    },
  ],
};

function extractJsonBlock(text) {
  if (!text) return null;

  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectStart = text.indexOf('{');
  const objectEnd = text.lastIndexOf('}');
  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    return text.slice(objectStart, objectEnd + 1);
  }

  return text.trim();
}

function parseJsonResponse(text) {
  const jsonBlock = extractJsonBlock(text);
  if (!jsonBlock) return null;

  try {
    return JSON.parse(jsonBlock);
  } catch (error) {
    console.error('[AI JSON Parse] Error:', error.message);
    return null;
  }
}

function getQuizFallbackQuestions(category) {
  return QUIZ_FALLBACKS[category] || QUIZ_FALLBACKS.vocabulary;
}

function localizeFallbackQuestions(language, category) {
  if (!language || ['english', 'spanish', 'french', 'japanese', 'german'].includes(String(language).toLowerCase())) {
    return getQuizFallbackQuestions(category);
  }

  if (category === 'vocabulary') {
    return [
      {
        question: "What is the correct " + language + " word for 'water'?",
        options: ['पानी (Pani)', 'घर (Ghar)', 'किताब (Kitaab)', 'दोस्त (Dost)'],
        correct: 0,
        explanation: "'पानी (Pani)' means water. The other options mean house, book, and friend.",
      },
      {
        question: "Choose the " + language + " word for 'mango'.",
        options: ['आम (Aam)', 'सूरज (Suraj)', 'रास्ता (Raasta)', 'खाना (Khana)'],
        correct: 0,
        explanation: "'आम (Aam)' means mango. The other options mean sun, road, and food.",
      },
      {
        question: "Which option means 'friend' in " + language + '?',
        options: ['घर (Ghar)', 'दोस्त (Dost)', 'पानी (Pani)', 'स्कूल (School)'],
        correct: 1,
        explanation: "'दोस्त (Dost)' means friend. The other options mean house, water, and school.",
      },
      {
        question: "Select the " + language + " word for 'book'.",
        options: ['सूरज (Suraj)', 'किताब (Kitaab)', 'आम (Aam)', 'रास्ता (Raasta)'],
        correct: 1,
        explanation: "'किताब (Kitaab)' means book. The other options mean sun, mango, and road.",
      },
      {
        question: "What is the " + language + " word for 'house'?",
        options: ['खाना (Khana)', 'दोस्त (Dost)', 'घर (Ghar)', 'पानी (Pani)'],
        correct: 2,
        explanation: "'घर (Ghar)' means house. The other options mean food, friend, and water.",
      },
    ];
  }

  return getQuizFallbackQuestions(category);
}

function normalizeQuizQuestions(payload, category) {
  const fallbackQuestions = getQuizFallbackQuestions(category);
  const rawQuestions = Array.isArray(payload?.questions) ? payload.questions : [];

  const questions = rawQuestions
    .map((item, index) => {
      const options = Array.isArray(item?.options)
        ? item.options.filter((option) => typeof option === 'string' && option.trim()).slice(0, 4)
        : [];

      if (typeof item?.question !== 'string' || !item.question.trim() || options.length !== 4) {
        return null;
      }

      let correct = Number.isInteger(item.correct) ? item.correct : -1;
      if (correct < 0 || correct > 3) {
        const stringCorrect = typeof item.correct === 'string' ? item.correct.trim() : '';
        correct = options.findIndex((option) => option === stringCorrect);
      }

      if (correct < 0 || correct > 3) {
        return null;
      }

      return {
        question: item.question.trim(),
        options,
        correct,
        explanation:
          typeof item.explanation === 'string' && item.explanation.trim()
            ? item.explanation.trim()
            : `Option ${String.fromCharCode(65 + correct)} is correct for this question.`,
      };
    })
    .filter(Boolean)
    .slice(0, 5);

  if (questions.length === 5) {
    return questions;
  }

  return fallbackQuestions.map((question, index) => ({
    ...question,
    explanation:
      question.explanation ||
      `Option ${String.fromCharCode(65 + question.correct)} is correct for question ${index + 1}.`,
  }));
}

function normalizeVocabularyWords(payload, language) {
  const rawWords = Array.isArray(payload?.words) ? payload.words : [];

  const words = rawWords
    .map((item) => {
      if (typeof item?.word !== 'string' || !item.word.trim()) {
        return null;
      }

      const meaning =
        typeof item.meaning === 'string' && item.meaning.trim() ? item.meaning.trim() : 'Meaning unavailable';

      return {
        word: item.word.trim(),
        transliteration:
          typeof item.transliteration === 'string' && item.transliteration.trim()
            ? item.transliteration.trim()
            : item.word.trim(),
        meaning,
        example:
          typeof item.example === 'string' && item.example.trim()
            ? item.example.trim()
            : `${item.word.trim()} means ${meaning.toLowerCase()} in English.`,
      };
    })
    .filter(Boolean)
    .slice(0, 30);

  if (words.length >= 1) {
    return words;
  }

  const fallbacks = [
    { word: 'नमस्ते', transliteration: 'Namaste', meaning: 'Hello', example: 'नमस्ते, आप कैसे हैं?' },
    { word: 'पानी', transliteration: 'Pani', meaning: 'Water', example: 'मुझे पानी चाहिए।' },
    { word: 'घर', transliteration: 'Ghar', meaning: 'House', example: 'मेरा घर पास में है।' },
    { word: 'आम', transliteration: 'Aam', meaning: 'Mango', example: 'मुझे आम खाना पसंद है।' },
    { word: 'दोस्त', transliteration: 'Dost', meaning: 'Friend', example: 'वह मेरा अच्छा दोस्त है।' },
    { word: 'किताब', transliteration: 'Kitaab', meaning: 'Book', example: 'यह किताब बहुत अच्छी है।' },
    { word: 'स्कूल', transliteration: 'School', meaning: 'School', example: 'मैं रोज स्कूल जाता हूँ।' },
    { word: 'सूरज', transliteration: 'Suraj', meaning: 'Sun', example: 'आज सूरज बहुत तेज है।' },
    { word: 'खाना', transliteration: 'Khana', meaning: 'Food', example: 'खाना तैयार है।' },
    { word: 'रास्ता', transliteration: 'Raasta', meaning: 'Road', example: 'यह रास्ता बाजार जाता है।' },
  ];

  return fallbacks.map((word) => ({
    ...word,
    example: `${word.example} (${language})`,
  }));
}

async function generateModelText(prompt) {
  const result = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [{ role: 'user', content: prompt }],
  });
  return result.choices[0].message.content;
}

async function generateChatWithHistory(systemPrompt, history) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history,
  ];
  const result = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages,
    temperature: 0.7,
  });
  return result.choices[0].message.content;
}

exports.chat = async (req, res) => {
  try {
    const { message, history } = req.body;

    const systemPrompt = `You are a friendly conversational AI assistant who is fluent in all Indian and world languages.

RULES:
1. Detect the EXACT language the user is writing in.
2. Reply ONLY in that same language - naturally, correctly and fluently.
3. Be natural, friendly and conversational.
4. Do NOT give wrong, irrelevant or nonsensical responses.
5. Do NOT mix up languages. Marathi is NOT Hindi. Tamil is NOT Telugu.
6. If user writes in Romanized script (like "kasa ahes"), reply in Romanized script of THAT SAME language.

MARATHI examples (learn these patterns):
- "kasa ahes" / "kasa aahes" = How are you → Reply: "Mi ekdam barobar ahe! Tumhi kase aahat?" (I am perfectly fine! How are you?)
- "kay karto" = What are you doing → Reply: "Mi tumchi madad karayala tayar ahe!" (I am ready to help you!)
- "dhanyawad" = Thank you → Reply: "Tumche swagat aahe!" (You're welcome!)

HINDI examples:
- "kaise ho" = How are you → Reply: "Main bahut accha hoon! Aap kaise hain?" (I am very good! How are you?)
- "namaste" = Hello → Reply: "Namaste! Kaise madad kar sakta hoon?" (Hello! How can I help?)

ENGLISH examples:
- "hey" / "hello" → Reply: "Hey! How can I help you today?"
- "how are you" → Reply: "I'm doing great! How can I help you?"

IMPORTANT: You MUST respond in this exact JSON format and nothing else:
{"reply": "your natural conversational response in detected language", "translation": "English translation of your reply"}

If the user is already writing in English, set translation to the same text as reply.
Return ONLY valid JSON. No markdown, no code fences, no extra text.`;

    // Build conversation history (last 5 messages)
    const chatHistory = [];
    if (Array.isArray(history)) {
      const recentHistory = history.slice(-5);
      for (const msg of recentHistory) {
        if (msg.role === 'user') {
          chatHistory.push({ role: 'user', content: msg.content });
        } else if (msg.role === 'ai') {
          chatHistory.push({ role: 'assistant', content: msg.content });
        }
      }
    }
    chatHistory.push({ role: 'user', content: message });

    console.log('[AI Chat] Request:', { message, historyLength: chatHistory.length });

    const rawReply = await generateChatWithHistory(systemPrompt, chatHistory);

    // Parse JSON response from AI
    let reply = rawReply;
    let translation = '';

    const parsed = parseJsonResponse(rawReply);
    if (parsed && parsed.reply) {
      reply = parsed.reply;
      translation = parsed.translation || '';
    }

    console.log('[AI Chat] Success, reply length:', reply.length);
    res.json({ success: true, reply, translation });

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

exports.translate = async (req, res) => {
  try {
    const { text, targetLanguage } = req.body;

    if (!text || !text.trim()) {
      return res.json({ success: false, error: 'Text is required' });
    }

    const target = targetLanguage || 'English';
    const prompt = `Translate the following text to ${target}. Return ONLY the translation, nothing else. No explanations, no quotes, just the translated text.

Text: ${text}`;

    console.log('[AI Translate] Request:', { textLength: text.length, targetLanguage: target });

    const translation = await generateModelText(prompt);

    console.log('[AI Translate] Success');
    res.json({ success: true, translation: translation.trim() });
  } catch (error) {
    console.error('[AI Translate] Error:', error.message);
    res.json({ success: false, error: 'Translation service unavailable' });
  }
};

exports.quiz = async (req, res) => {
  const { language = 'English', difficulty = 'beginner', category = 'vocabulary', variationSeed = Date.now().toString() } = req.body || {};

  try {
    const prompt = `You are creating a language-learning multiple choice quiz.
Return only valid JSON with this exact shape:
{
  "questions": [
    {
      "question": "string",
      "options": ["string", "string", "string", "string"],
      "correct": 0,
      "explanation": "string"
    }
  ]
}

Rules:
- Generate exactly 5 questions.
- Category: ${category}
- Difficulty: ${difficulty}
- Target learner language: ${language}
- Variation seed for this request: ${variationSeed}
- The quiz should help the learner practice ${category}.
- For Indian-language learning, prefer this pattern:
  1. The question/instruction can be in simple English.
  2. The 4 answer options should be in the target language script.
  3. Add short transliteration in brackets when helpful.
- Example style for Hindi: question in English, options like "पानी (Pani)", "घर (Ghar)".
- Each question must have exactly 4 unique options.
- "correct" must be the zero-based index of the correct option.
- Explanation must say why the correct option is right and why a common wrong idea would be incorrect.
- Make this set noticeably different from a typical previous set by changing examples, wording, and answer choices.
- Keep language clear and classroom-friendly.`;

    console.log('[AI Quiz] Request:', { language, difficulty, category, variationSeed });

    const text = await generateModelText(prompt);
    const parsed = parseJsonResponse(text);
    const questions = normalizeQuizQuestions(parsed, category);

    console.log('[AI Quiz] Success, questions:', questions.length);
    res.json({ questions });
  } catch (error) {
    console.error('[AI Quiz] Error:', error.message);
    res.json({ questions: localizeFallbackQuestions(language, category) });
  }
};

exports.vocabulary = async (req, res) => {
  const { language = 'Hindi', count = 10, category = '', exclude = [] } = req.body || {};
  const wordCount = Math.min(Math.max(parseInt(count) || 10, 1), 30);

  const categoryLine = category ? `- All words must belong to the category: "${category}".` : '- Use a mix of everyday categories.';
  const excludeLine = Array.isArray(exclude) && exclude.length > 0
    ? `- Do NOT include any of these words (already learned): ${exclude.join(', ')}.`
    : '';

  try {
    const prompt = `You are creating vocabulary flashcards for ${language}.
Return only valid JSON with this exact shape:
{
  "words": [
    {
      "word": "string",
      "transliteration": "string",
      "meaning": "string",
      "example": "string"
    }
  ]
}

Rules:
- Generate exactly ${wordCount} vocabulary words.
${categoryLine}
${excludeLine}
- If the language uses a non-Latin script, "word" must use the native script and "transliteration" must be Romanized.
- "meaning" must be the English meaning.
- "example" should be a short natural example in the target language, optionally followed by a short English gloss only if needed.
- Prefer beginner-friendly, practical vocabulary.`;

    console.log('[AI Vocabulary] Request:', { language, count: wordCount, category });

    const text = await generateModelText(prompt);
    const parsed = parseJsonResponse(text);
    const words = normalizeVocabularyWords(parsed, language);

    console.log('[AI Vocabulary] Success, words:', words.length);
    res.json({ words });
  } catch (error) {
    console.error('[AI Vocabulary] Error:', error.message);
    res.json({ words: normalizeVocabularyWords(null, language) });
  }
};

exports.wordDetails = async (req, res) => {
  const { word = '', language = 'Hindi' } = req.body || {};

  if (!word.trim()) {
    return res.json({ success: false, error: 'Word is required' });
  }

  try {
    const prompt = `You are a ${language} language expert. Provide detailed information about the word "${word}" in ${language}.
Return only valid JSON with this exact shape:
{
  "word": "${word}",
  "transliteration": "string",
  "meaning": "string",
  "examples": ["sentence 1", "sentence 2", "sentence 3"],
  "synonyms": ["synonym1", "synonym2", "synonym3"],
  "antonyms": ["antonym1", "antonym2"],
  "usageTips": "string with practical usage advice",
  "difficulty": "beginner|intermediate|advanced"
}

Rules:
- "examples" must have exactly 3 natural example sentences in ${language} with English translation in parentheses.
- "synonyms" should be 2-3 words in ${language} with transliteration.
- "antonyms" should be 1-2 words in ${language} with transliteration (empty array if not applicable).
- "usageTips" should be 1-2 sentences about when/how to use the word naturally.
- "difficulty" should be one of: beginner, intermediate, advanced.`;

    console.log('[AI WordDetails] Request:', { word, language });

    const text = await generateModelText(prompt);
    const parsed = parseJsonResponse(text);

    if (parsed) {
      res.json({
        success: true,
        details: {
          word: parsed.word || word,
          transliteration: parsed.transliteration || '',
          meaning: parsed.meaning || '',
          examples: Array.isArray(parsed.examples) ? parsed.examples.slice(0, 3) : [],
          synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms.slice(0, 3) : [],
          antonyms: Array.isArray(parsed.antonyms) ? parsed.antonyms.slice(0, 3) : [],
          usageTips: typeof parsed.usageTips === 'string' ? parsed.usageTips : '',
          difficulty: ['beginner', 'intermediate', 'advanced'].includes(parsed.difficulty) ? parsed.difficulty : 'beginner',
        },
      });
    } else {
      res.json({ success: false, error: 'Could not parse word details' });
    }
  } catch (error) {
    console.error('[AI WordDetails] Error:', error.message);
    res.json({ success: false, error: 'Word details service unavailable' });
  }
};

exports.correct = async (req, res) => {
  try {
    const { text, language } = req.body;

    const prompt = `Check this ${language} sentence for grammar mistakes:
    "${text}"
    Give corrections in simple way.`;

    console.log('[AI Correct] Request:', { text, language });

    const reply = await generateModelText(prompt);

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

exports.fillBlank = async (req, res) => {
  const { words = [] } = req.body || {};

  if (!words.length) {
    return res.json({ success: false, error: 'Words required' });
  }

  try {
    const wordList = words.slice(0, 15).map(w => w.english || w).join(', ');

    const prompt = `Generate exactly 10 fill-in-the-blank sentences for vocabulary practice.
Use ONLY these words: ${wordList}

Return ONLY valid JSON with this exact shape:
{
  "sentences": [
    {
      "sentence": "The ___ is red and sweet.",
      "blank_word": "apple",
      "options": ["apple", "mango", "cat", "dog"],
      "correct": 0
    }
  ]
}

Rules:
- Each sentence must have exactly one blank shown as "___"
- "blank_word" is the correct word that fills the blank
- "options" must have exactly 4 choices, including the correct one
- "correct" is the zero-based index of the correct option
- Sentences should be simple, suitable for school students
- Use different words from the list for each sentence
- Make sentences fun and engaging
- Return ONLY valid JSON, no markdown`;

    const text = await generateModelText(prompt);
    const parsed = parseJsonResponse(text);

    if (parsed && Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
      const sentences = parsed.sentences
        .filter(s => s.sentence && s.blank_word && Array.isArray(s.options) && s.options.length === 4)
        .slice(0, 10)
        .map(s => ({
          sentence: s.sentence,
          blank_word: s.blank_word,
          options: s.options,
          correct: typeof s.correct === 'number' ? s.correct : 0,
        }));

      return res.json({ success: true, sentences });
    }

    // Fallback: generate simple sentences from words
    const fallbackSentences = words.slice(0, 10).map((w, i) => {
      const word = w.english || w;
      const otherWords = words.filter((_, j) => j !== i).slice(0, 3).map(x => x.english || x);
      while (otherWords.length < 3) otherWords.push('thing');
      const options = [word, ...otherWords].sort(() => Math.random() - 0.5);
      return {
        sentence: `The ___ is something we know.`,
        blank_word: word,
        options,
        correct: options.indexOf(word),
      };
    });

    res.json({ success: true, sentences: fallbackSentences });
  } catch (error) {
    console.error('[AI FillBlank] Error:', error.message);
    res.json({ success: false, error: 'Fill blank generation failed' });
  }
};

exports.dailyWords = async (req, res) => {
  const { language = 'Hindi', date, level = 'school', excludeWords = [] } = req.body || {};
  const today = date || new Date().toISOString().split('T')[0];
  const cacheKey = `${today}_${language.toLowerCase()}_${level}`;

  // Return cached words for same day+language+level
  if (dailyWordsCache.has(cacheKey)) {
    console.log('[AI DailyWords] Cache hit:', cacheKey);
    return res.json({ success: true, words: dailyWordsCache.get(cacheKey), date: today });
  }

  const excludeLine = Array.isArray(excludeWords) && excludeWords.length > 0
    ? `\nIMPORTANT: Do NOT include any of these words (already learned): ${excludeWords.slice(0, 200).join(', ')}.`
    : '';

  const levelDesc = level === 'adults'
    ? 'Generate advanced/intermediate vocabulary words for adult learners. Include professional, business, medical, legal, technology, travel, and sophisticated everyday words. Words should be useful for working professionals and adults.'
    : 'Generate simple school-level vocabulary words for young students. Words should be common everyday words a school kid would use. Pick from: Animals, Fruits, Vegetables, Colors, Numbers, Body Parts, Family, School Items, Food, Nature.';

  const categoryList = level === 'adults'
    ? 'Business, Technology, Health, Travel, Emotions, Food, Nature, Society, Science, Daily Life'
    : 'Animals, Fruits, Vegetables, Colors, Numbers, Body Parts, Family, School Items, Food, Nature';

  // Generate batches of 10 until we have 30 unique words (max 5 attempts)
  const allWords = [];
  const TARGET = 30;
  const MAX_BATCHES = 5;

  try {
    console.log('[AI DailyWords] Request:', { language, date: today, level, target: TARGET });

    for (let batch = 0; batch < MAX_BATCHES && allWords.length < TARGET; batch++) {
      const remaining = TARGET - allWords.length;
      const alreadyGenerated = allWords.map(w => w.english).join(', ');
      const batchExclude = alreadyGenerated
        ? `\nDo NOT repeat these words: ${alreadyGenerated}.`
        : '';

      const prompt = `${levelDesc}
Generate exactly 10 unique ${language} vocabulary words.
Mix different categories. Every word must be different.
${excludeLine}${batchExclude}

Return ONLY valid JSON with this exact shape:
{
  "words": [
    {
      "english": "Apple",
      "native": "सेब",
      "transliteration": "Seb",
      "meaning": "A sweet red fruit",
      "example": "I eat an apple every day.",
      "emoji": "🍎",
      "category": "Fruits"
    }
  ]
}

Rules:
- "english" is the English word (e.g. "Apple", "Dog", "Mother")
- "native" is the FULL CORRECT word in ${language} native script. It must be a complete, properly spelled word in the ${language} script. Do NOT use abbreviations or single characters. For example in Hindi: "सेब" not "स", in Nepali: "स्याउ" not "स", in Marathi: "सफरचंद" not "स"
- "transliteration" is the full Romanized pronunciation (e.g. "Seb", "Syaau", "Safarchand")
- "meaning" is a simple English meaning (4-8 words)
- "example" is a simple English sentence using the word
- "emoji" is a single emoji that represents the word
- "category" must be one of: ${categoryList}
- All 10 words MUST be unique and from different categories
- IMPORTANT: Double-check every "native" word is the correct ${language} translation, fully spelled in ${language} script
- Return ONLY valid JSON, no markdown, no code fences`;

      const text = await generateModelText(prompt);
      const parsed = parseJsonResponse(text);

      if (parsed && Array.isArray(parsed.words)) {
        const batchWords = parsed.words
          .filter(w => w.english && w.native && w.meaning)
          .filter(w => !allWords.some(existing => existing.english.toLowerCase() === w.english.toLowerCase()))
          .slice(0, remaining)
          .map(w => ({
            english: w.english || '',
            native: w.native || '',
            transliteration: w.transliteration || w.english || '',
            meaning: w.meaning || '',
            example: w.example || `This is ${w.english}.`,
            emoji: w.emoji || '📚',
            category: w.category || 'General',
          }));
        allWords.push(...batchWords);
        console.log(`[AI DailyWords] Batch ${batch + 1}: got ${batchWords.length}, total: ${allWords.length}`);
      }
    }

    const words = allWords.slice(0, TARGET);

    if (words.length === 0) {
      return res.json({ success: false, words: [], date: today });
    }

    // Cache for the day
    dailyWordsCache.set(cacheKey, words);

    console.log('[AI DailyWords] Success, total words:', words.length);
    res.json({ success: true, words, date: today });
  } catch (error) {
    console.error('[AI DailyWords] Error:', error.message);
    res.json({ success: false, words: [], date: today });
  }
};
