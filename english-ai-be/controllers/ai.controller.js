const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_CLOUD });

// In-memory cache for daily words (keyed by date+language).
// Bumped cache version to invalidate stale entries with wrong translations.
const CACHE_VERSION = 'v4';
const dailyWordsCache = new Map();

// ============================================================
// LANGUAGE TRANSLATION SAFETY NET
// The app teaches ENGLISH through the user's native language.
// LLMs frequently confuse Marathi with Hindi, Bengali with Assamese,
// etc. The constants and helpers below give us three layers of defense:
//   1. Strong per-language prompt instructions (buildLanguageGuide)
//   2. Verified English->native lookups (lookupNativeWord) that
//      OVERRIDE whatever the LLM returned for common words.
//   3. Script-level validation (hasScriptChars) that REJECTS items
//      whose native text is in the wrong script.
// ============================================================

// Canonical language name normalization. Frontend sometimes sends
// lowercase codes like "marathi"; backend bank keys are "Marathi".
function normalizeLanguageName(language) {
  if (!language) return 'Hindi';
  const lower = String(language).toLowerCase().trim();
  const map = {
    hindi: 'Hindi', marathi: 'Marathi', tamil: 'Tamil', telugu: 'Telugu',
    bengali: 'Bengali', gujarati: 'Gujarati', kannada: 'Kannada',
    malayalam: 'Malayalam', punjabi: 'Punjabi', urdu: 'Urdu', odia: 'Odia',
    assamese: 'Assamese', manipuri: 'Manipuri', sanskrit: 'Sanskrit',
    konkani: 'Konkani', nepali: 'Nepali', sindhi: 'Sindhi',
    kashmiri: 'Kashmiri', maithili: 'Maithili', dogri: 'Dogri',
    bodo: 'Bodo', santali: 'Santali', english: 'English',
  };
  return map[lower] || (lower.charAt(0).toUpperCase() + lower.slice(1));
}

// Script metadata per language. Unicode range is used to validate
// that LLM output is actually written in the expected script.
const LANGUAGE_SCRIPTS = {
  Hindi:     { script: 'Devanagari', range: '\u0900-\u097F', sample: 'पानी, बिल्ली, पेड़, माँ, स्कूल' },
  Marathi:   { script: 'Devanagari', range: '\u0900-\u097F', sample: 'पाणी, मांजर, झाड, आई, शाळा' },
  Sanskrit:  { script: 'Devanagari', range: '\u0900-\u097F', sample: 'जलम्, मार्जारः, वृक्षः, माता, विद्यालयः' },
  Nepali:    { script: 'Devanagari', range: '\u0900-\u097F', sample: 'पानी, बिरालो, रुख, आमा, विद्यालय' },
  Konkani:   { script: 'Devanagari', range: '\u0900-\u097F', sample: 'उदक, माजर, रुख, आवय, इस्कोल' },
  Maithili:  { script: 'Devanagari', range: '\u0900-\u097F', sample: 'पानि, बिलाड़ि, गाछ, माँ, विद्यालय' },
  Dogri:     { script: 'Devanagari', range: '\u0900-\u097F', sample: 'पानी, बिल्ली, रुक्ख, माँ, स्कूल' },
  Bodo:      { script: 'Devanagari', range: '\u0900-\u097F', sample: 'दै, मेयो, बिफां, आय, स्कूल' },
  Bengali:   { script: 'Bengali',    range: '\u0980-\u09FF', sample: 'পানি, বিড়াল, গাছ, মা, স্কুল' },
  Assamese:  { script: 'Bengali',    range: '\u0980-\u09FF', sample: 'পানী, মেকুৰী, গছ, মা, বিদ্যালয়' },
  Manipuri:  { script: 'Bengali',    range: '\u0980-\u09FF', sample: 'ঈশিং, হৌদোং, উপাল, ইমা, স্কুল' },
  Gujarati:  { script: 'Gujarati',   range: '\u0A80-\u0AFF', sample: 'પાણી, બિલાડી, ઝાડ, મા, શાળા' },
  Punjabi:   { script: 'Gurmukhi',   range: '\u0A00-\u0A7F', sample: 'ਪਾਣੀ, ਬਿੱਲੀ, ਰੁੱਖ, ਮਾਂ, ਸਕੂਲ' },
  Tamil:     { script: 'Tamil',      range: '\u0B80-\u0BFF', sample: 'தண்ணீர், பூனை, மரம், அம்மா, பள்ளி' },
  Telugu:    { script: 'Telugu',     range: '\u0C00-\u0C7F', sample: 'నీరు, పిల్లి, చెట్టు, అమ్మ, పాఠశాల' },
  Kannada:   { script: 'Kannada',    range: '\u0C80-\u0CFF', sample: 'ನೀರು, ಬೆಕ್ಕು, ಮರ, ಅಮ್ಮ, ಶಾಲೆ' },
  Malayalam: { script: 'Malayalam',  range: '\u0D00-\u0D7F', sample: 'വെള്ളം, പൂച്ച, മരം, അമ്മ, സ്കൂൾ' },
  Odia:      { script: 'Odia',       range: '\u0B00-\u0B7F', sample: 'ପାଣି, ବିଲେଇ, ଗଛ, ମା, ବିଦ୍ୟାଳୟ' },
  Urdu:      { script: 'Arabic',     range: '\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF', sample: 'پانی, بلی, درخت, ماں, سکول' },
  Sindhi:    { script: 'Arabic',     range: '\u0600-\u06FF\u0750-\u077F', sample: 'پاڻي, ٻلي, وڻ, امان, اسڪول' },
  Kashmiri:  { script: 'Arabic',     range: '\u0600-\u06FF\u0750-\u077F', sample: 'پانؠ, بَرور, کُل, موج, سکول' },
  Santali:   { script: 'Ol Chiki',   range: '\u1C50-\u1C7F', sample: 'ᱫᱟᱜ, ᱯᱩᱥᱤ, ᱫᱟᱨᱮ, ᱟᱭᱚ, ᱥᱠᱩᱞ' },
  English:   { script: 'Latin',      range: 'A-Za-z',        sample: 'water, cat, tree, mother, school' },
};

function getLanguageScriptInfo(language) {
  return LANGUAGE_SCRIPTS[language] || LANGUAGE_SCRIPTS.Hindi;
}

// Returns true if the string contains at least one character in the
// expected script. Used to filter out wrong-language LLM output.
function hasScriptChars(text, language) {
  if (!text || typeof text !== 'string') return false;
  const info = getLanguageScriptInfo(language);
  if (!info || !info.range) return true;
  try {
    const regex = new RegExp(`[${info.range}]`);
    return regex.test(text);
  } catch {
    return true;
  }
}

// Verified word banks with rich sentence/phrase data used to
// reinforce the prompt for the most common confusion cases.
const LANGUAGE_WORD_BANKS = {
  Marathi: {
    note: 'Use ONLY Marathi words in Devanagari. Marathi and Hindi are DIFFERENT languages. NEVER mix Hindi words like पेड़, पानी, बिल्ली, कुत्ता, सेब, माँ, पिता, स्कूल, किताब, बारिश.',
    words: 'cat=मांजर, dog=कुत्रा, cow=गाय, horse=घोडा, bird=पक्षी, fish=मासा, tree=झाड, flower=फूल, water=पाणी, milk=दूध, rice=भात, bread=भाकरी, apple=सफरचंद, mango=आंबा, banana=केळ, grapes=द्राक्षे, orange=संत्रा, mother=आई, father=बाबा, sister=बहीण, brother=भाऊ, boy=मुलगा, girl=मुलगी, house=घर, school=शाळा, book=पुस्तक, pen=पेन, sun=सूर्य, moon=चंद्र, star=तारा, sky=आकाश, rain=पाऊस, river=नदी, red=लाल, blue=निळा, green=हिरवा, yellow=पिवळा, white=पांढरा, black=काळा, big=मोठा, small=लहान, one=एक, two=दोन, three=तीन, eye=डोळा, hand=हात, ear=कान, head=डोकं',
    sentences: 'I go to school=मी शाळेत जातो, I eat food=मी जेवण करतो, I drink water=मी पाणी पितो, The sun is big=सूर्य मोठा आहे, I like mangoes=मला आंबे आवडतात, Good morning=शुभ सकाळ, Thank you=धन्यवाद, How are you?=तू कसा आहेस?',
  },
  Hindi: {
    note: 'Use ONLY Hindi words in Devanagari. NEVER use Marathi words like झाड, मांजर, कुत्रा, सफरचंद, आई, बाबा, मुलगा, मुलगी, शाळा, पुस्तक, पाऊस.',
    words: 'cat=बिल्ली, dog=कुत्ता, cow=गाय, horse=घोड़ा, bird=चिड़िया, fish=मछली, tree=पेड़, flower=फूल, water=पानी, milk=दूध, rice=चावल, bread=रोटी, apple=सेब, mango=आम, banana=केला, grapes=अंगूर, orange=संतरा, mother=माँ, father=पिता, sister=बहन, brother=भाई, boy=लड़का, girl=लड़की, house=घर, school=स्कूल, book=किताब, pen=कलम, sun=सूरज, moon=चाँद, star=तारा, sky=आकाश, rain=बारिश, river=नदी, red=लाल, blue=नीला, green=हरा, yellow=पीला, white=सफेद, black=काला, big=बड़ा, small=छोटा, one=एक, two=दो, three=तीन, eye=आँख, hand=हाथ, ear=कान, head=सिर',
    sentences: 'I go to school=मैं स्कूल जाता हूँ, I eat food=मैं खाना खाता हूँ, I drink water=मैं पानी पीता हूँ, The sun is big=सूरज बड़ा है, I like mangoes=मुझे आम पसंद है, Good morning=शुभ प्रभात, Thank you=धन्यवाद, How are you?=आप कैसे हैं?',
  },
  Tamil: {
    note: 'Use ONLY Tamil words in Tamil script.',
    words: 'cat=பூனை, dog=நாய், cow=பசு, bird=பறவை, fish=மீன், tree=மரம், flower=பூ, water=தண்ணீர், milk=பால், rice=அரிசி, apple=ஆப்பிள், mango=மாம்பழம், banana=வாழைப்பழம், mother=அம்மா, father=அப்பா, house=வீடு, school=பள்ளி, book=புத்தகம், sun=சூரியன், moon=நிலா, red=சிவப்பு, blue=நீலம், green=பச்சை, big=பெரிய, small=சிறிய',
    sentences: 'I go to school=நான் பள்ளிக்கு செல்கிறேன், I eat food=நான் சாப்பிடுகிறேன், I drink water=நான் தண்ணீர் குடிக்கிறேன், Good morning=காலை வணக்கம், Thank you=நன்றி',
  },
  Telugu: {
    note: 'Use ONLY Telugu words in Telugu script.',
    words: 'cat=పిల్లి, dog=కుక్క, cow=ఆవు, bird=పక్షి, fish=చేప, tree=చెట్టు, flower=పువ్వు, water=నీరు, milk=పాలు, rice=అన్నం, apple=ఆపిల్, mango=మామిడి, banana=అరటిపండు, mother=అమ్మ, father=నాన్న, house=ఇల్లు, school=పాఠశాల, book=పుస్తకం, sun=సూర్యుడు, moon=చంద్రుడు, red=ఎరుపు, blue=నీలం, green=ఆకుపచ్చ, big=పెద్ద, small=చిన్న',
    sentences: 'I go to school=నేను పాఠశాలకు వెళ్తాను, I eat food=నేను భోజనం చేస్తాను, I drink water=నేను నీరు తాగుతాను, Good morning=శుభోదయం, Thank you=ధన్యవాదాలు',
  },
};

function buildLanguageGuide(language) {
  const normalized = normalizeLanguageName(language);
  const info = getLanguageScriptInfo(normalized);
  const bank = LANGUAGE_WORD_BANKS[normalized];

  const scriptBlock = `\nLANGUAGE ACCURACY (CRITICAL):\n- The user's native language is ${normalized}.\n- All native text MUST be written in ${info.script} script.\n- Example ${normalized} words in ${info.script}: ${info.sample}\n- NEVER write Romanized text in the "native" field — use proper ${info.script} script only.\n- NEVER use words from a different language. Marathi ≠ Hindi, Bengali ≠ Assamese, Tamil ≠ Telugu, Urdu ≠ Hindi.\n- If unsure of the exact ${normalized} translation, pick a simpler word you ARE sure of.`;

  const bankBlock = bank
    ? `\nVerified ${normalized} words: ${bank.words}\nVerified ${normalized} sentences: ${bank.sentences}\n${bank.note}`
    : '';

  return scriptBlock + bankBlock + '\n';
}

// Verified English->native lookup used to override LLM output for
// the most common beginner words. If we have a verified translation,
// we always use it.
const ENGLISH_TO_NATIVE = {
  Marathi: {
    cat: 'मांजर', dog: 'कुत्रा', cow: 'गाय', horse: 'घोडा', bird: 'पक्षी', fish: 'मासा',
    tree: 'झाड', flower: 'फूल', water: 'पाणी', milk: 'दूध', rice: 'भात', bread: 'भाकरी',
    apple: 'सफरचंद', mango: 'आंबा', banana: 'केळ', grapes: 'द्राक्षे', orange: 'संत्रा',
    mother: 'आई', father: 'बाबा', sister: 'बहीण', brother: 'भाऊ',
    boy: 'मुलगा', girl: 'मुलगी', house: 'घर', school: 'शाळा', book: 'पुस्तक', pen: 'पेन',
    sun: 'सूर्य', moon: 'चंद्र', star: 'तारा', sky: 'आकाश', rain: 'पाऊस', river: 'नदी',
    red: 'लाल', blue: 'निळा', green: 'हिरवा', yellow: 'पिवळा', white: 'पांढरा', black: 'काळा',
    big: 'मोठा', small: 'लहान', one: 'एक', two: 'दोन', three: 'तीन',
    eye: 'डोळा', hand: 'हात', ear: 'कान', head: 'डोकं',
    hello: 'नमस्कार', 'good morning': 'शुभ सकाळ', 'good night': 'शुभ रात्री',
    'thank you': 'धन्यवाद',
  },
  Hindi: {
    cat: 'बिल्ली', dog: 'कुत्ता', cow: 'गाय', horse: 'घोड़ा', bird: 'चिड़िया', fish: 'मछली',
    tree: 'पेड़', flower: 'फूल', water: 'पानी', milk: 'दूध', rice: 'चावल', bread: 'रोटी',
    apple: 'सेब', mango: 'आम', banana: 'केला', grapes: 'अंगूर', orange: 'संतरा',
    mother: 'माँ', father: 'पिता', sister: 'बहन', brother: 'भाई',
    boy: 'लड़का', girl: 'लड़की', house: 'घर', school: 'स्कूल', book: 'किताब', pen: 'कलम',
    sun: 'सूरज', moon: 'चाँद', star: 'तारा', sky: 'आकाश', rain: 'बारिश', river: 'नदी',
    red: 'लाल', blue: 'नीला', green: 'हरा', yellow: 'पीला', white: 'सफेद', black: 'काला',
    big: 'बड़ा', small: 'छोटा', one: 'एक', two: 'दो', three: 'तीन',
    eye: 'आँख', hand: 'हाथ', ear: 'कान', head: 'सिर',
    hello: 'नमस्ते', 'good morning': 'शुभ प्रभात', 'good night': 'शुभ रात्रि',
    'thank you': 'धन्यवाद',
  },
  Tamil: {
    cat: 'பூனை', dog: 'நாய்', cow: 'பசு', bird: 'பறவை', fish: 'மீன்',
    tree: 'மரம்', flower: 'பூ', water: 'தண்ணீர்', milk: 'பால்', rice: 'அரிசி',
    apple: 'ஆப்பிள்', mango: 'மாம்பழம்', banana: 'வாழைப்பழம்',
    mother: 'அம்மா', father: 'அப்பா', house: 'வீடு', school: 'பள்ளி', book: 'புத்தகம்',
    sun: 'சூரியன்', moon: 'நிலா', red: 'சிவப்பு', blue: 'நீலம்', green: 'பச்சை',
    big: 'பெரிய', small: 'சிறிய', hello: 'வணக்கம்', 'thank you': 'நன்றி',
  },
  Telugu: {
    cat: 'పిల్లి', dog: 'కుక్క', cow: 'ఆవు', bird: 'పక్షి', fish: 'చేప',
    tree: 'చెట్టు', flower: 'పువ్వు', water: 'నీరు', milk: 'పాలు', rice: 'అన్నం',
    apple: 'ఆపిల్', mango: 'మామిడి', banana: 'అరటిపండు',
    mother: 'అమ్మ', father: 'నాన్న', house: 'ఇల్లు', school: 'పాఠశాల', book: 'పుస్తకం',
    sun: 'సూర్యుడు', moon: 'చంద్రుడు', red: 'ఎరుపు', blue: 'నీలం', green: 'ఆకుపచ్చ',
    big: 'పెద్ద', small: 'చిన్న', hello: 'నమస్కారం', 'thank you': 'ధన్యవాదాలు',
  },
};

function lookupNativeWord(englishWord, language) {
  if (!englishWord) return '';
  const normalized = normalizeLanguageName(language);
  const dict = ENGLISH_TO_NATIVE[normalized];
  if (!dict) return '';
  const key = String(englishWord).toLowerCase().trim();
  return dict[key] || '';
}

// Common cross-language word confusions that must be auto-corrected.
// If user selected Marathi but LLM returned Hindi word पेड़, rewrite to झाड.
const WRONG_LANGUAGE_WORDS = {
  Marathi: {
    'पेड़': 'झाड', 'पानी': 'पाणी', 'बिल्ली': 'मांजर', 'कुत्ता': 'कुत्रा',
    'सेब': 'सफरचंद', 'आम': 'आंबा', 'केला': 'केळ', 'माँ': 'आई', 'पिता': 'बाबा',
    'लड़का': 'मुलगा', 'लड़की': 'मुलगी', 'स्कूल': 'शाळा', 'किताब': 'पुस्तक',
    'सूरज': 'सूर्य', 'चाँद': 'चंद्र', 'बारिश': 'पाऊस', 'नीला': 'निळा', 'हरा': 'हिरवा',
    'पीला': 'पिवळा', 'बड़ा': 'मोठा', 'छोटा': 'लहान', 'बहन': 'बहीण', 'भाई': 'भाऊ',
    'रोटी': 'भाकरी', 'चावल': 'भात', 'चिड़िया': 'पक्षी', 'मछली': 'मासा',
    'आँख': 'डोळा', 'हाथ': 'हात', 'सिर': 'डोकं', 'दो': 'दोन', 'सफेद': 'पांढरा', 'काला': 'काळा',
  },
  Hindi: {
    'झाड': 'पेड़', 'पाणी': 'पानी', 'मांजर': 'बिल्ली', 'कुत्रा': 'कुत्ता',
    'सफरचंद': 'सेब', 'आंबा': 'आम', 'केळ': 'केला', 'आई': 'माँ', 'बाबा': 'पिता',
    'मुलगा': 'लड़का', 'मुलगी': 'लड़की', 'शाळा': 'स्कूल', 'पुस्तक': 'किताब',
    'सूर्य': 'सूरज', 'चंद्र': 'चाँद', 'पाऊस': 'बारिश', 'निळा': 'नीला', 'हिरवा': 'हरा',
    'पिवळा': 'पीला', 'मोठा': 'बड़ा', 'लहान': 'छोटा', 'बहीण': 'बहन', 'भाऊ': 'भाई',
    'भाकरी': 'रोटी', 'भात': 'चावल', 'पक्षी': 'चिड़िया', 'मासा': 'मछली',
    'डोळा': 'आँख', 'हात': 'हाथ', 'डोकं': 'सिर', 'दोन': 'दो', 'पांढरा': 'सफेद', 'काळा': 'काला',
  },
};

function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fixWrongLanguageText(text, language) {
  if (!text || typeof text !== 'string') return text;
  const normalized = normalizeLanguageName(language);
  const corrections = WRONG_LANGUAGE_WORDS[normalized];
  if (!corrections) return text;
  let fixed = text;
  const keys = Object.keys(corrections).sort((a, b) => b.length - a.length);
  for (const wrong of keys) {
    fixed = fixed.replace(new RegExp(escapeRegex(wrong), 'g'), corrections[wrong]);
  }
  return fixed;
}

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

// Vocabulary flashcards: teach ENGLISH to native-language speakers.
// Shape: { word (English), native (native script), transliteration,
//          example (English sentence), example_native (native translation),
//          emoji, category }
function normalizeVocabularyWords(payload, language) {
  const rawWords = Array.isArray(payload?.words) ? payload.words : [];

  const words = rawWords
    .map((item) => {
      if (typeof item?.word !== 'string' || !item.word.trim()) {
        return null;
      }

      const englishWord = item.word.trim();

      // Override with verified native translation if we know it.
      const verifiedNative = lookupNativeWord(englishWord, language);
      let native =
        typeof item.native === 'string' && item.native.trim() ? item.native.trim() : '';
      if (verifiedNative) {
        native = verifiedNative;
      } else if (native) {
        native = fixWrongLanguageText(native, language);
      }

      // Script validation: if we have a native-script language and the
      // returned native text has no matching script chars, drop the item.
      if (native && !hasScriptChars(native, language)) {
        return null;
      }

      const example =
        typeof item.example === 'string' && item.example.trim()
          ? item.example.trim()
          : `This is a ${englishWord.toLowerCase()}.`;

      let exampleNative =
        typeof item.example_native === 'string' && item.example_native.trim()
          ? item.example_native.trim()
          : '';
      if (exampleNative) {
        exampleNative = fixWrongLanguageText(exampleNative, language);
      }

      return {
        word: englishWord,
        native: native || englishWord,
        transliteration:
          typeof item.transliteration === 'string' && item.transliteration.trim()
            ? item.transliteration.trim()
            : '',
        meaning:
          typeof item.meaning === 'string' && item.meaning.trim()
            ? item.meaning.trim()
            : englishWord,
        example,
        example_native: exampleNative,
        emoji: typeof item.emoji === 'string' ? item.emoji : '📚',
        category: typeof item.category === 'string' ? item.category : 'General',
      };
    })
    .filter(Boolean)
    .slice(0, 30);

  return words;
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

// Multi-voice mode: user speaks a single utterance that mixes 2-5 languages
// together (e.g. "मला water pahije aani mujhe khana chahiye"). We detect each
// language chunk and translate everything to English with a per-chunk breakdown.
exports.multiVoice = async (req, res) => {
  try {
    const { transcript, languages } = req.body || {};

    if (!transcript || !String(transcript).trim()) {
      return res.json({ success: false, error: 'Transcript is required' });
    }

    const selectedLangs = Array.isArray(languages) && languages.length > 0
      ? languages.join(', ')
      : 'Hinglish (Hindi + English)';

    const selectedLanguages = selectedLangs;
    const prompt = `You are an expert multilingual translator specializing in Indian languages mixed with English.

User said: "${String(transcript).trim()}"
Language mix: ${selectedLanguages}

TASK: Translate the EXACT words spoken into English. Every single word must be translated.

TRANSLATION RULES:

Hindi words → English:
किधर/कहाँ = where, हो/है = are/is, मैं/मुझे = I/me, तुम/आप = you,
क्या = what, कैसे = how, ठीक = fine/okay, नहीं = no, हाँ = yes,
बहुत = very, अभी = now, कल = yesterday/tomorrow, यार = friend,
खाना = food, पानी = water, घर = home, जाना = go, आना = come,
देखना = see, सुनना = hear, बोलना = speak, करना = do, होना = be

Marathi words → English:
मला = I want/to me, तू/तुम्ही = you, काय = what, आहे/आहेस = is/are,
नाही = no, हो = yes, बरं = okay/fine, कसा/कशी = how, मी = I,
जातो/जाते = going, येतो/येते = coming, बघतो = seeing, सांग = tell,
घर = home, शाळा = school, पाणी = water, जेवण = food

Tamil words → English:
எங்கே = where, என்ன = what, எப்படி = how, இல்லை = no, ஆம் = yes

Telugu words → English:
ఏమిటి = what, ఎక్కడ = where, ఎలా = how, లేదు = no, అవును = yes

English words → keep as is

IMPORTANT:
- Translate EVERY word spoken
- Keep the natural flow and meaning
- If someone says "mala water pahije" = "I want water"
- If someone says "kidhar ho can you see me" = "Where are you, can you see me"
- If someone says "kasa ahes bhai" = "How are you friend"
- Make it sound like natural English conversation

Return ONLY this JSON:
{
  "full_translation": "natural English translation of everything said",
  "breakdown": [
    {
      "original": "original word/phrase",
      "language": "Hindi/Marathi/English/Tamil/Telugu",
      "translation": "English meaning"
    }
  ],
  "detected_mix": "Hinglish/Marathlish/etc"
}`;

    console.log('[AI MultiVoice] Request:', { transcriptLength: String(transcript).length, languages: selectedLangs });

    const text_out = await generateModelText(prompt);
    const parsed = parseJsonResponse(text_out);

    if (parsed && typeof parsed.full_translation === 'string') {
      const breakdown = Array.isArray(parsed.breakdown)
        ? parsed.breakdown
            .filter((b) => b && typeof b.original === 'string' && typeof b.translation === 'string')
            .map((b) => ({
              original: String(b.original).trim(),
              language: typeof b.language === 'string'
                ? b.language.trim()
                : typeof b.detected_language === 'string'
                  ? b.detected_language.trim()
                  : 'Unknown',
              translation: String(b.translation).trim(),
            }))
        : [];

      const fullTranslation = parsed.full_translation.trim();
      const detectedMix =
        typeof parsed.detected_mix === 'string' && parsed.detected_mix.trim()
          ? parsed.detected_mix.trim()
          : 'Mixed';
      const confidence = ['high', 'medium', 'low'].includes(String(parsed.confidence).toLowerCase())
        ? String(parsed.confidence).toLowerCase()
        : 'medium';

      return res.json({
        success: true,
        full_translation: fullTranslation,
        breakdown,
        detected_mix: detectedMix,
        confidence,
      });
    }

    res.json({ success: false, error: 'Could not parse translation' });
  } catch (error) {
    console.error('[AI MultiVoice] Error:', error.message);
    res.json({ success: false, error: 'Multi-voice translation unavailable' });
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
  let { language = 'Hindi' } = req.body || {};
  language = normalizeLanguageName(language);

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
  let { language = 'Hindi', count = 10, category = '', exclude = [] } = req.body || {};
  language = normalizeLanguageName(language);
  const wordCount = Math.min(Math.max(parseInt(count) || 10, 1), 30);

  const categoryLine = category ? `- All words must belong to the category: "${category}".` : '- Use a mix of everyday beginner categories: Animals, Fruits, Family, Food, Nature, School, Body, Colors.';
  const excludeLine = Array.isArray(exclude) && exclude.length > 0
    ? `- Do NOT include any of these English words (already learned): ${exclude.join(', ')}.`
    : '';

  try {
    const languageGuide = buildLanguageGuide(language);

    const prompt = `You are creating BEGINNER ENGLISH vocabulary flashcards for a ${language} speaker.
The student knows ${language} and wants to LEARN ENGLISH.

${languageGuide}

Return ONLY valid JSON with this exact shape:
{
  "words": [
    {
      "word": "Cat",
      "native": "CORRECT ${language} word",
      "transliteration": "Roman pronunciation of the ${language} word",
      "meaning": "Short English definition",
      "example": "Short simple English sentence using the word.",
      "example_native": "CORRECT ${language} translation of that English sentence",
      "emoji": "🐱",
      "category": "Animals"
    }
  ]
}

Rules:
- Generate exactly ${wordCount} BEGINNER English vocabulary words (cat, dog, apple, water, house, school, mother, father, tree, book, sun, moon, flower, bird, fish, etc.).
${categoryLine}
${excludeLine}
- "word": simple English word (ASCII letters only).
- "native": the CORRECT ${language} translation in native script. MUST be real ${language}, not Hindi-when-we-asked-for-Marathi.
- "transliteration": Roman letters only, helps pronounce the ${language} word.
- "example": simple English sentence using the word.
- "example_native": CORRECT ${language} translation of that English sentence.
- "emoji": one relevant emoji.
- Return ONLY JSON, no markdown, no code fences.`;

    console.log('[AI Vocabulary] Request:', { language, count: wordCount, category });

    const text = await generateModelText(prompt);
    const parsed = parseJsonResponse(text);
    const words = normalizeVocabularyWords(parsed, language);

    console.log('[AI Vocabulary] Success, words:', words.length);
    res.json({ words });
  } catch (error) {
    console.error('[AI Vocabulary] Error:', error.message);
    res.json({ words: [] });
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
    let { text, language } = req.body || {};
    language = normalizeLanguageName(language);

    const prompt = `User spoke in ${language}: "${text}"

1. Correct any grammar mistakes in the ${language} sentence.
2. Give a proper natural English translation.
3. Provide the corrected version in ${language}.

Return ONLY valid JSON (no markdown, no code fences):
{
  "reply": "short friendly feedback in ${language}",
  "translation": "proper English translation of the original sentence",
  "corrected": "corrected version in ${language}"
}`;

    console.log('[AI Correct] Request:', { text, language });

    const raw = await generateModelText(prompt);
    const parsed = parseJsonResponse(raw);

    if (parsed && (parsed.reply || parsed.translation || parsed.corrected)) {
      return res.json({
        success: true,
        reply: typeof parsed.reply === 'string' ? parsed.reply.trim() : '',
        translation: typeof parsed.translation === 'string' ? parsed.translation.trim() : '',
        corrected: typeof parsed.corrected === 'string' ? parsed.corrected.trim() : '',
      });
    }

    console.log('[AI Correct] Fallback to raw text');
    res.json({ success: true, reply: raw, translation: '', corrected: '' });

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
  let { words = [], language = 'Hindi' } = req.body || {};
  language = normalizeLanguageName(language);

  if (!words.length) {
    return res.json({ success: false, error: 'Words required' });
  }

  try {
    const wordList = words.slice(0, 15).map(w => w.english || w).join(', ');
    const languageGuide = buildLanguageGuide(language);

    const prompt = `Generate exactly 10 beginner English fill-in-the-blank sentences for a ${language} speaker learning English.
Use ONLY these English words: ${wordList}

${languageGuide}

Return ONLY valid JSON with this exact shape:
{
  "sentences": [
    {
      "sentence": "The ___ is red and sweet.",
      "sentence_native": "CORRECT ${language} translation of the full sentence (with the missing word included)",
      "blank_word": "apple",
      "options": ["apple", "mango", "cat", "dog"],
      "correct": 0
    }
  ]
}

Rules:
- "sentence" is in simple English with exactly one blank shown as "___".
- "sentence_native" is the CORRECT ${language} translation of the full English sentence (with the correct word filled in).
- "blank_word" is the correct English word that fills the blank.
- "options" are 4 English word choices including the correct one.
- "correct" is the zero-based index of the correct option in "options".
- Sentences must be simple, beginner-friendly.
- Return ONLY valid JSON, no markdown.`;

    const text = await generateModelText(prompt);
    const parsed = parseJsonResponse(text);

    if (parsed && Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
      const sentences = parsed.sentences
        .filter(s => s.sentence && s.blank_word && Array.isArray(s.options) && s.options.length === 4)
        .slice(0, 10)
        .map(s => ({
          sentence: s.sentence,
          sentence_native: fixWrongLanguageText(String(s.sentence_native || '').trim(), language),
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
        sentence_native: '',
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
  let { language = 'Hindi', date, level = 'school', excludeWords = [] } = req.body || {};
  language = normalizeLanguageName(language);
  const today = date || new Date().toISOString().split('T')[0];
  const cacheKey = `${CACHE_VERSION}_${today}_${language.toLowerCase()}_${level}`;

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

      const languageGuide = buildLanguageGuide(language);

      const prompt = `${levelDesc}
The student speaks ${language} and wants to learn ENGLISH.

${languageGuide}

Generate exactly 10 unique BEGINNER English vocabulary words.
Mix different categories. Every word must be different.
${excludeLine}${batchExclude}

Return ONLY valid JSON with this exact shape:
{
  "words": [
    {
      "english": "Apple",
      "native": "CORRECT ${language} translation of Apple",
      "transliteration": "Roman pronunciation of the ${language} word",
      "meaning": "A sweet red fruit",
      "example": "I eat an apple every day.",
      "example_native": "CORRECT ${language} translation of that English sentence",
      "emoji": "🍎",
      "category": "Fruits"
    }
  ]
}

Rules:
- "english": simple English word in ASCII letters (e.g. "Apple", "Dog", "Mother").
- "native": the CORRECT, fully spelled ${language} word in its native script. NEVER use Hindi when asked for Marathi. NEVER use a single character.
- "transliteration": Roman pronunciation of the ${language} word.
- "meaning": short English meaning (4-8 words).
- "example": simple English sentence using the word.
- "example_native": CORRECT ${language} translation of that English sentence.
- "emoji": one relevant emoji.
- "category": one of ${categoryList}.
- All 10 words MUST be unique and from different categories.
- Return ONLY valid JSON, no markdown, no code fences.`;

      const text = await generateModelText(prompt);
      const parsed = parseJsonResponse(text);

      if (parsed && Array.isArray(parsed.words)) {
        const batchWords = parsed.words
          .filter(w => w.english && w.native && w.meaning)
          .filter(w => !allWords.some(existing => existing.english.toLowerCase() === w.english.toLowerCase()))
          .map(w => {
            const englishWord = String(w.english || '').trim();
            const verified = lookupNativeWord(englishWord, language);
            let native = verified || fixWrongLanguageText(String(w.native || '').trim(), language);
            // Reject if native text is in wrong script.
            if (!native || !hasScriptChars(native, language)) {
              return null;
            }
            const exampleNative = fixWrongLanguageText(String(w.example_native || '').trim(), language);
            return {
              english: englishWord,
              native,
              transliteration: w.transliteration || englishWord,
              meaning: w.meaning || '',
              example: w.example || `This is ${englishWord}.`,
              example_native: exampleNative,
              emoji: w.emoji || '📚',
              category: w.category || 'General',
            };
          })
          .filter(Boolean)
          .slice(0, remaining);
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
