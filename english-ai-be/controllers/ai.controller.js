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

async function generateWithSystem(systemPrompt, userPrompt) {
  const result = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.8,
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
  const { language = 'Hindi' } = req.body || {};

  console.log('[AI Quiz] Generating question for language:', language);

  // Language-specific word banks for accuracy
  const wordBanks = {
    Marathi: {
      note: 'Use ONLY Marathi words. Marathi and Hindi are DIFFERENT. NEVER use Hindi words.',
      words: 'tree=झाड (Zaad), water=पाणी (Paani), cat=मांजर (Manjar), dog=कुत्रा (Kutra), mango=आंबा (Amba), apple=सफरचंद (Safarchand), house=घर (Ghar), mother=आई (Aai), father=बाबा (Baba), sun=सूर्य (Surya), moon=चंद्र (Chandra), flower=फूल (Phool), bird=पक्षी (Pakshi), fish=मासा (Maasa), cow=गाय (Gaay), horse=घोडा (Ghoda), milk=दूध (Doodh), rice=भात (Bhaat), bread=भाकरी (Bhakri), banana=केळ (Kel), grapes=द्राक्षे (Draksha), red=लाल (Laal), blue=निळा (Nila), green=हिरवा (Hirva), big=मोठा (Motha), small=लहान (Lahaan), boy=मुलगा (Mulga), girl=मुलगी (Mulgi), school=शाळा (Shaala), book=पुस्तक (Pustak), rain=पाऊस (Paus), river=नदी (Nadi), eye=डोळा (Dola), hand=हात (Haat), ear=कान (Kaan), I go to school=मी शाळेत जातो, I eat food=मी जेवण करतो, The sun is big=सूर्य मोठा आहे, I like mangoes=मला आंबे आवडतात, Good morning=शुभ सकाळ',
      wrong: 'WRONG Hindi words NEVER use: पेड़, पानी, बिल्ली, कुत्ता, सेब, माँ, पिता, लड़का, लड़की, स्कूल, किताब, बारिश',
    },
    Hindi: {
      note: 'Use ONLY Hindi words. NEVER use Marathi words.',
      words: 'tree=पेड़ (Ped), water=पानी (Pani), cat=बिल्ली (Billi), dog=कुत्ता (Kutta), mango=आम (Aam), apple=सेब (Seb), house=घर (Ghar), mother=माँ (Maa), father=पिता (Pita), sun=सूरज (Suraj), moon=चाँद (Chaand), flower=फूल (Phool), bird=चिड़िया (Chidiya), fish=मछली (Machli), cow=गाय (Gaay), horse=घोड़ा (Ghoda), milk=दूध (Doodh), rice=चावल (Chawal), bread=रोटी (Roti), banana=केला (Kela), grapes=अंगूर (Angoor), red=लाल (Laal), blue=नीला (Neela), green=हरा (Hara), big=बड़ा (Bada), small=छोटा (Chhota), boy=लड़का (Ladka), girl=लड़की (Ladki), school=स्कूल (School), book=किताब (Kitaab), rain=बारिश (Baarish), river=नदी (Nadi), I go to school=मैं स्कूल जाता हूँ, I eat food=मैं खाना खाता हूँ, The sun is big=सूरज बड़ा है, Good morning=शुभ प्रभात',
      wrong: 'WRONG Marathi words NEVER use: झाड, मांजर, कुत्रा, सफरचंद, आई, बाबा, मुलगा, मुलगी, शाळा, पुस्तक, पाऊस',
    },
    Tamil: {
      note: 'Use ONLY Tamil words.',
      words: 'tree=மரம் (Maram), water=தண்ணீர் (Thanneer), cat=பூனை (Poonai), dog=நாய் (Naai), mango=மாம்பழம் (Maambazham), apple=ஆப்பிள் (Apple), house=வீடு (Veedu), mother=அம்மா (Amma), father=அப்பா (Appa), sun=சூரியன் (Suriyan), moon=நிலா (Nila), flower=பூ (Poo)',
      wrong: '',
    },
    Telugu: {
      note: 'Use ONLY Telugu words.',
      words: 'tree=చెట్టు (Chettu), water=నీళ్ళు (Neellu), cat=పిల్లి (Pilli), dog=కుక్క (Kukka), mango=మామిడి (Maamidi), house=ఇల్లు (Illu), mother=అమ్మ (Amma), father=నాన్న (Naanna)',
      wrong: '',
    },
  };

  const bank = wordBanks[language];
  const bankSection = bank
    ? `\nLANGUAGE ACCURACY (CRITICAL):\n${bank.note}\nVerified words: ${bank.words}\n${bank.wrong ? bank.wrong : ''}\nUse ONLY words from this list or words you are 100% certain are correct ${language}.`
    : '';

  const systemPrompt = `You are a ${language} language learning quiz generator for BhashaAI app.
The student speaks English and is learning ${language}.

You generate ONE quiz question. Randomly pick one of these 3 types:
1. WORD: Show an English word → 4 ${language} translation options
2. SENTENCE: Show an English sentence → 4 ${language} translation options
3. FILL_BLANK: Show English sentence with a blank "Good ___ (morning)" → 4 ${language} options for the blank

JSON FORMAT (strict):
{
  "display": "The English word or sentence shown big to the user",
  "question_type": "word" or "sentence" or "fill_blank",
  "options": ["correct ${language} answer", "wrong1", "wrong2", "wrong3"],
  "correct": 0,
  "explanation": "Short English explanation"
}

RULES:
- "display": ALWAYS in English. This is shown big and bold to the user.
- "options": ALWAYS in ${language}. For non-Latin scripts add transliteration in brackets.
- "correct": Always 0 (frontend shuffles).
- "explanation": ALWAYS in English.
- All 4 options must be real ${language} words/sentences. NEVER mix languages.
- NEVER use Hindi words for Marathi or vice versa.${bankSection}

Return ONLY valid JSON. No markdown, no extra text.`;

  const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Examples per language for pattern matching
  const examples = {
    Marathi: `Examples:
Word: {"display":"Tree","question_type":"word","options":["झाड (Zaad)","फूल (Phool)","पक्षी (Pakshi)","नदी (Nadi)"],"correct":0,"explanation":"Tree is 'झाड' (Zaad) in Marathi."}
Sentence: {"display":"I go to school","question_type":"sentence","options":["मी शाळेत जातो (Mi shalet jaato)","मी बाजारात जातो (Mi bajarat jaato)","मी घरी जातो (Mi ghari jaato)","मी खेळतो (Mi khelto)"],"correct":0,"explanation":"'I go to school' = 'मी शाळेत जातो' in Marathi."}
Fill: {"display":"Good ___ (morning)","question_type":"fill_blank","options":["सकाळ (Sakaal)","संध्याकाळ (Sandhyakaal)","रात्र (Ratra)","दुपार (Dupar)"],"correct":0,"explanation":"Good morning = शुभ सकाळ in Marathi."}`,
    Hindi: `Examples:
Word: {"display":"Water","question_type":"word","options":["पानी (Pani)","आग (Aag)","हवा (Hawa)","मिट्टी (Mitti)"],"correct":0,"explanation":"Water is 'पानी' (Pani) in Hindi."}
Sentence: {"display":"I eat food","question_type":"sentence","options":["मैं खाना खाता हूँ (Main khana khata hoon)","मैं पानी पीता हूँ (Main pani peeta hoon)","मैं सोता हूँ (Main sota hoon)","मैं खेलता हूँ (Main khelta hoon)"],"correct":0,"explanation":"'I eat food' = 'मैं खाना खाता हूँ' in Hindi."}`,
    Spanish: `Examples:
Word: {"display":"Cat","question_type":"word","options":["Gato","Perro","Vaca","Caballo"],"correct":0,"explanation":"Cat is 'Gato' in Spanish."}
Sentence: {"display":"I go to school","question_type":"sentence","options":["Yo voy a la escuela","Yo como comida","Yo bebo agua","Yo duermo"],"correct":0,"explanation":"'I go to school' = 'Yo voy a la escuela' in Spanish."}`,
    English: `Examples:
Word: {"display":"Happy","question_type":"word","options":["Joyful","Angry","Tired","Hungry"],"correct":0,"explanation":"Happy means joyful."}`,
  };

  const example = examples[language] || examples.English;

  const userPrompt = `Generate 1 quiz question for someone learning ${language}.
Randomly pick type: word, sentence, or fill_blank.
Topics: fruits, animals, colors, numbers, greetings, family, food, body parts, nature, daily activities, simple sentences.
${bank ? `Use ONLY verified ${language} words: ${bank.words}` : ''}

${example}

Return ONLY JSON:
{"display":"...","question_type":"...","options":["...","...","...","..."],"correct":0,"explanation":"..."}

Seed: ${seed}`;

  try {
    const text = await generateWithSystem(systemPrompt, userPrompt);
    const parsed = parseJsonResponse(text);

    console.log('[AI Quiz] Raw response length:', text?.length);

    // Try flat structure: {display, options, correct, explanation}
    if (parsed && typeof parsed.display === 'string' && Array.isArray(parsed.options) && parsed.options.length === 4) {
      let correct = Number.isInteger(parsed.correct) ? parsed.correct : 0;
      if (correct < 0 || correct > 3) correct = 0;

      const question = {
        display: parsed.display.trim(),
        question_type: ['word', 'sentence', 'fill_blank'].includes(parsed.question_type) ? parsed.question_type : 'word',
        options: parsed.options.map(o => String(o).trim()),
        correct,
        explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : 'See the correct option above.',
      };

      console.log('[AI Quiz] Success:', question.display, '(', question.question_type, ')');
      return res.json({ question });
    }

    // Try nested: {question: {display, ...}}
    const nested = parsed?.question;
    if (nested && typeof nested.display === 'string' && Array.isArray(nested.options) && nested.options.length === 4) {
      let correct = Number.isInteger(nested.correct) ? nested.correct : 0;
      if (correct < 0 || correct > 3) correct = 0;
      console.log('[AI Quiz] Success (nested):', nested.display);
      return res.json({
        question: {
          display: nested.display.trim(),
          question_type: nested.question_type || 'word',
          options: nested.options.map(o => String(o).trim()),
          correct,
          explanation: typeof nested.explanation === 'string' ? nested.explanation.trim() : 'See the correct option above.',
        },
      });
    }

    // Try old format: {question: "...", options: [...]} → convert to new format
    if (parsed && typeof parsed.question === 'string' && Array.isArray(parsed.options) && parsed.options.length === 4) {
      let correct = Number.isInteger(parsed.correct) ? parsed.correct : 0;
      if (correct < 0 || correct > 3) correct = 0;
      console.log('[AI Quiz] Success (old format converted):', parsed.question);
      return res.json({
        question: {
          display: parsed.question.trim().replace(/^what is the .+ word for ['"]?/i, '').replace(/['"]?\??$/, '').trim() || parsed.question.trim(),
          question_type: 'word',
          options: parsed.options.map(o => String(o).trim()),
          correct,
          explanation: typeof parsed.explanation === 'string' ? parsed.explanation.trim() : 'See the correct option above.',
        },
      });
    }

    console.log('[AI Quiz] Bad response, using fallback');
    return res.json({ question: getQuizFallback(language) });
  } catch (error) {
    console.error('[AI Quiz] Error:', error.message);
    return res.json({ question: getQuizFallback(language) });
  }
};

function getQuizFallback(language) {
  const fallbacks = {
    Marathi: [
      { display: 'Cat', question_type: 'word', options: ['मांजर (Manjar)', 'कुत्रा (Kutra)', 'गाय (Gaay)', 'घोडा (Ghoda)'], correct: 0, explanation: "Cat is 'मांजर' (Manjar) in Marathi." },
      { display: 'Tree', question_type: 'word', options: ['झाड (Zaad)', 'फूल (Phool)', 'पक्षी (Pakshi)', 'नदी (Nadi)'], correct: 0, explanation: "Tree is 'झाड' (Zaad) in Marathi." },
      { display: 'Water', question_type: 'word', options: ['पाणी (Paani)', 'दूध (Doodh)', 'चहा (Chaha)', 'भात (Bhaat)'], correct: 0, explanation: "Water is 'पाणी' (Paani) in Marathi." },
      { display: 'I go to school', question_type: 'sentence', options: ['मी शाळेत जातो (Mi shalet jaato)', 'मी बाजारात जातो (Mi bajarat jaato)', 'मी घरी जातो (Mi ghari jaato)', 'मी खेळतो (Mi khelto)'], correct: 0, explanation: "'I go to school' = 'मी शाळेत जातो' in Marathi." },
      { display: 'Mother', question_type: 'word', options: ['आई (Aai)', 'बाबा (Baba)', 'मुलगा (Mulga)', 'मुलगी (Mulgi)'], correct: 0, explanation: "Mother is 'आई' (Aai) in Marathi." },
      { display: 'Mango', question_type: 'word', options: ['आंबा (Amba)', 'केळ (Kel)', 'सफरचंद (Safarchand)', 'द्राक्षे (Draksha)'], correct: 0, explanation: "Mango is 'आंबा' (Amba) in Marathi." },
      { display: 'Good ___ (morning)', question_type: 'fill_blank', options: ['सकाळ (Sakaal)', 'संध्याकाळ (Sandhyakaal)', 'रात्र (Ratra)', 'दुपार (Dupar)'], correct: 0, explanation: "Good morning = शुभ सकाळ in Marathi." },
    ],
    Hindi: [
      { display: 'Water', question_type: 'word', options: ['पानी (Pani)', 'आग (Aag)', 'हवा (Hawa)', 'मिट्टी (Mitti)'], correct: 0, explanation: "Water is 'पानी' (Pani) in Hindi." },
      { display: 'Cat', question_type: 'word', options: ['बिल्ली (Billi)', 'कुत्ता (Kutta)', 'गाय (Gaay)', 'घोड़ा (Ghoda)'], correct: 0, explanation: "Cat is 'बिल्ली' (Billi) in Hindi." },
      { display: 'Tree', question_type: 'word', options: ['पेड़ (Ped)', 'फूल (Phool)', 'चिड़िया (Chidiya)', 'नदी (Nadi)'], correct: 0, explanation: "Tree is 'पेड़' (Ped) in Hindi." },
      { display: 'I eat food', question_type: 'sentence', options: ['मैं खाना खाता हूँ (Main khana khata hoon)', 'मैं पानी पीता हूँ (Main pani peeta hoon)', 'मैं सोता हूँ (Main sota hoon)', 'मैं खेलता हूँ (Main khelta hoon)'], correct: 0, explanation: "'I eat food' = 'मैं खाना खाता हूँ' in Hindi." },
      { display: 'Mango', question_type: 'word', options: ['आम (Aam)', 'सेब (Seb)', 'केला (Kela)', 'अंगूर (Angoor)'], correct: 0, explanation: "Mango is 'आम' (Aam) in Hindi." },
      { display: 'Good ___ (morning)', question_type: 'fill_blank', options: ['सुबह (Subah)', 'शाम (Shaam)', 'रात (Raat)', 'दोपहर (Dopahar)'], correct: 0, explanation: "Good morning = शुभ प्रभात / सुप्रभात in Hindi." },
    ],
    Spanish: [
      { display: 'Hello', question_type: 'word', options: ['Hola', 'Adiós', 'Gracias', 'Amigo'], correct: 0, explanation: "'Hola' means 'hello' in Spanish." },
      { display: 'Cat', question_type: 'word', options: ['Gato', 'Perro', 'Vaca', 'Caballo'], correct: 0, explanation: "'Gato' means 'cat' in Spanish." },
      { display: 'I go to school', question_type: 'sentence', options: ['Yo voy a la escuela', 'Yo como comida', 'Yo bebo agua', 'Yo duermo'], correct: 0, explanation: "'I go to school' = 'Yo voy a la escuela' in Spanish." },
    ],
    French: [
      { display: 'Thank you', question_type: 'word', options: ['Merci', 'Bonjour', 'Au revoir', 'Oui'], correct: 0, explanation: "'Merci' means 'thank you' in French." },
      { display: 'Cat', question_type: 'word', options: ['Chat', 'Chien', 'Vache', 'Cheval'], correct: 0, explanation: "'Chat' means 'cat' in French." },
    ],
    English: [
      { display: 'Happy', question_type: 'word', options: ['Joyful', 'Angry', 'Tired', 'Hungry'], correct: 0, explanation: "'Happy' means joyful or glad." },
      { display: 'She is running', question_type: 'sentence', options: ['She moves fast on foot', 'She is sleeping', 'She is eating', 'She is reading'], correct: 0, explanation: "'Running' means moving fast on foot." },
    ],
  };
  const set = fallbacks[language] || fallbacks.English;
  return set[Math.floor(Math.random() * set.length)];
}

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
