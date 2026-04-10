const Groq = require('groq-sdk');

const groq = new Groq({ apiKey: process.env.GROQ_CLOUD });

// In-memory cache for daily words (keyed by date+language)
// Bumped cache version to invalidate stale entries with wrong translations.
const CACHE_VERSION = 'v3';
const dailyWordsCache = new Map();

// Script metadata per language. Each language has a native script,
// a unicode regex range to detect/validate it, and strict rules.
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

// Check whether a string contains at least one character in the expected script.
// Used to validate LLM output — if the native text has NO characters in the target
// script, it's clearly wrong (e.g., English letters when we asked for Tamil).
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

// Shared verified translation banks for beginner English learning.
// CRITICAL: Each language has DIFFERENT words. Marathi != Hindi.
const LANGUAGE_WORD_BANKS = {
  Marathi: {
    note: 'Use ONLY Marathi words in Devanagari. Marathi and Hindi are DIFFERENT languages. NEVER mix Hindi words like पेड़, पानी, बिल्ली, कुत्ता, सेब, माँ, पिता, स्कूल, किताब, बारिश.',
    words: 'cat=मांजर (Manjar), dog=कुत्रा (Kutra), cow=गाय (Gaay), horse=घोडा (Ghoda), bird=पक्षी (Pakshi), fish=मासा (Maasa), tree=झाड (Zaad), flower=फूल (Phool), water=पाणी (Paani), milk=दूध (Doodh), rice=भात (Bhaat), bread=भाकरी (Bhakri), apple=सफरचंद (Safarchand), mango=आंबा (Amba), banana=केळ (Kel), grapes=द्राक्षे (Draksha), orange=संत्रा (Santra), mother=आई (Aai), father=बाबा (Baba), sister=बहीण (Bahin), brother=भाऊ (Bhau), boy=मुलगा (Mulga), girl=मुलगी (Mulgi), house=घर (Ghar), school=शाळा (Shaala), book=पुस्तक (Pustak), pen=पेन (Pen), sun=सूर्य (Surya), moon=चंद्र (Chandra), star=तारा (Tara), sky=आकाश (Aakash), rain=पाऊस (Paus), river=नदी (Nadi), red=लाल (Laal), blue=निळा (Nila), green=हिरवा (Hirva), yellow=पिवळा (Pivla), white=पांढरा (Pandhra), black=काळा (Kala), big=मोठा (Motha), small=लहान (Lahaan), one=एक (Ek), two=दोन (Don), three=तीन (Teen), eye=डोळा (Dola), hand=हात (Haat), ear=कान (Kaan), head=डोकं (Doke)',
    sentences: 'I go to school=मी शाळेत जातो, I eat food=मी जेवण करतो, I drink water=मी पाणी पितो, The sun is big=सूर्य मोठा आहे, I like mangoes=मला आंबे आवडतात, Good morning=शुभ सकाळ, Thank you=धन्यवाद, How are you?=तू कसा आहेस?',
  },
  Hindi: {
    note: 'Use ONLY Hindi words in Devanagari. NEVER use Marathi words like झाड, मांजर, कुत्रा, सफरचंद, आई, बाबा, मुलगा, मुलगी, शाळा, पुस्तक, पाऊस.',
    words: 'cat=बिल्ली (Billi), dog=कुत्ता (Kutta), cow=गाय (Gaay), horse=घोड़ा (Ghoda), bird=चिड़िया (Chidiya), fish=मछली (Machli), tree=पेड़ (Ped), flower=फूल (Phool), water=पानी (Pani), milk=दूध (Doodh), rice=चावल (Chawal), bread=रोटी (Roti), apple=सेब (Seb), mango=आम (Aam), banana=केला (Kela), grapes=अंगूर (Angoor), orange=संतरा (Santra), mother=माँ (Maa), father=पिता (Pita), sister=बहन (Behen), brother=भाई (Bhai), boy=लड़का (Ladka), girl=लड़की (Ladki), house=घर (Ghar), school=स्कूल (School), book=किताब (Kitaab), pen=कलम (Kalam), sun=सूरज (Suraj), moon=चाँद (Chaand), star=तारा (Tara), sky=आकाश (Aakash), rain=बारिश (Baarish), river=नदी (Nadi), red=लाल (Laal), blue=नीला (Neela), green=हरा (Hara), yellow=पीला (Peela), white=सफेद (Safed), black=काला (Kaala), big=बड़ा (Bada), small=छोटा (Chhota), one=एक (Ek), two=दो (Do), three=तीन (Teen), eye=आँख (Aankh), hand=हाथ (Haath), ear=कान (Kaan), head=सिर (Sir)',
    sentences: 'I go to school=मैं स्कूल जाता हूँ, I eat food=मैं खाना खाता हूँ, I drink water=मैं पानी पीता हूँ, The sun is big=सूरज बड़ा है, I like mangoes=मुझे आम पसंद है, Good morning=शुभ प्रभात, Thank you=धन्यवाद, How are you?=आप कैसे हैं?',
  },
  Tamil: {
    note: 'Use ONLY Tamil words in Tamil script.',
    words: 'cat=பூனை (Poonai), dog=நாய் (Naai), cow=பசு (Pasu), bird=பறவை (Paravai), fish=மீன் (Meen), tree=மரம் (Maram), flower=பூ (Poo), water=தண்ணீர் (Thanneer), milk=பால் (Paal), rice=அரிசி (Arisi), apple=ஆப்பிள் (Apple), mango=மாம்பழம் (Maambazham), banana=வாழைப்பழம் (Vaazhaippazham), mother=அம்மா (Amma), father=அப்பா (Appa), house=வீடு (Veedu), school=பள்ளி (Palli), book=புத்தகம் (Puthagam), sun=சூரியன் (Suriyan), moon=நிலா (Nila), red=சிவப்பு (Sivappu), blue=நீலம் (Neelam), green=பச்சை (Pachai), big=பெரிய (Periya), small=சிறிய (Siriya)',
    sentences: 'I go to school=நான் பள்ளிக்கு செல்கிறேன், I eat food=நான் சாப்பிடுகிறேன், I drink water=நான் தண்ணீர் குடிக்கிறேன், Good morning=காலை வணக்கம், Thank you=நன்றி',
  },
  Telugu: {
    note: 'Use ONLY Telugu words in Telugu script.',
    words: 'cat=పిల్లి (Pilli), dog=కుక్క (Kukka), cow=ఆవు (Aavu), bird=పక్షి (Pakshi), fish=చేప (Chepa), tree=చెట్టు (Chettu), flower=పువ్వు (Puvvu), water=నీరు (Neeru), milk=పాలు (Paalu), rice=అన్నం (Annam), apple=ఆపిల్ (Apple), mango=మామిడి (Maamidi), banana=అరటిపండు (Aratipandu), mother=అమ్మ (Amma), father=నాన్న (Naanna), house=ఇల్లు (Illu), school=పాఠశాల (Paathashaala), book=పుస్తకం (Pustakam), sun=సూర్యుడు (Suryudu), moon=చంద్రుడు (Chandrudu), red=ఎరుపు (Erupu), blue=నీలం (Neelam), green=ఆకుపచ్చ (Aakupachha), big=పెద్ద (Pedda), small=చిన్న (Chinna)',
    sentences: 'I go to school=నేను పాఠశాలకు వెళ్తాను, I eat food=నేను భోజనం చేస్తాను, I drink water=నేను నీరు తాగుతాను, Good morning=శుభోదయం, Thank you=ధన్యవాదాలు',
  },
};

function normalizeLanguageName(language) {
  if (!language) return 'Hindi';
  const lower = String(language).toLowerCase().trim();
  const map = {
    hindi: 'Hindi', marathi: 'Marathi', tamil: 'Tamil', telugu: 'Telugu',
    bengali: 'Bengali', gujarati: 'Gujarati', kannada: 'Kannada', malayalam: 'Malayalam',
    punjabi: 'Punjabi', urdu: 'Urdu', odia: 'Odia', english: 'English',
  };
  return map[lower] || (lower.charAt(0).toUpperCase() + lower.slice(1));
}

function buildLanguageGuide(language) {
  const normalized = normalizeLanguageName(language);
  const info = getLanguageScriptInfo(normalized);
  const bank = LANGUAGE_WORD_BANKS[normalized];

  const scriptBlock = `\nLANGUAGE ACCURACY (CRITICAL):\n- The user's native language is ${normalized}.\n- All native text MUST be written in ${info.script} script.\n- Example ${normalized} words in ${info.script}: ${info.sample}\n- NEVER write transliterated Romanized text in the "native" or "meaning" field — use proper ${info.script} script only.\n- NEVER use words from a different language. Marathi ≠ Hindi, Bengali ≠ Assamese, Tamil ≠ Telugu, Urdu ≠ Hindi.\n- If unsure of the exact ${normalized} translation for a word, pick a simpler word you ARE sure of.`;

  const bankBlock = bank
    ? `\nVerified ${normalized} words: ${bank.words}\nVerified ${normalized} sentences: ${bank.sentences}\n${bank.note}`
    : '';

  return scriptBlock + bankBlock + '\n';
}

// Word-level English -> native translation map for post-processing.
// This is the FINAL safety net if the LLM returns wrong-language translations.
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
    'thank you': 'धन्यवाद', 'how are you': 'तू कसा आहेस', 'i am fine': 'मी ठीक आहे',
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
    'thank you': 'धन्यवाद', 'how are you': 'आप कैसे हैं', 'i am fine': 'मैं ठीक हूँ',
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

// Words from the WRONG language that must be replaced.
// If user selected Marathi, these Hindi words appearing in output are wrong.
const WRONG_LANGUAGE_WORDS = {
  Marathi: {
    'पेड़': 'झाड', 'पानी': 'पाणी', 'बिल्ली': 'मांजर', 'कुत्ता': 'कुत्रा',
    'सेब': 'सफरचंद', 'आम': 'आंबा', 'केला': 'केळ', 'माँ': 'आई', 'पिता': 'बाबा',
    'लड़का': 'मुलगा', 'लड़की': 'मुलगी', 'स्कूल': 'शाळा', 'किताब': 'पुस्तक',
    'सूरज': 'सूर्य', 'चाँद': 'चंद्र', 'बारिश': 'पाऊस', 'नीला': 'निळा', 'हरा': 'हिरवा',
    'पीला': 'पिवळा', 'बड़ा': 'मोठा', 'छोटा': 'लहान', 'बहन': 'बहीण', 'भाई': 'भाऊ',
    'रोटी': 'भाकरी', 'चावल': 'भात', 'चिड़िया': 'पक्षी', 'मछली': 'मासा',
    'आँख': 'डोळा', 'हाथ': 'हात', 'सिर': 'डोकं', 'दो': 'दोन', 'सफेद': 'पांढरा', 'काला': 'काळा',
    'शुभ प्रभात': 'शुभ सकाळ', 'शुभ रात्रि': 'शुभ रात्री', 'आप कैसे हैं': 'तू कसा आहेस',
    'मैं ठीक हूँ': 'मी ठीक आहे', 'नमस्ते': 'नमस्कार',
  },
  Hindi: {
    'झाड': 'पेड़', 'पाणी': 'पानी', 'मांजर': 'बिल्ली', 'कुत्रा': 'कुत्ता',
    'सफरचंद': 'सेब', 'आंबा': 'आम', 'केळ': 'केला', 'आई': 'माँ', 'बाबा': 'पिता',
    'मुलगा': 'लड़का', 'मुलगी': 'लड़की', 'शाळा': 'स्कूल', 'पुस्तक': 'किताब',
    'सूर्य': 'सूरज', 'चंद्र': 'चाँद', 'पाऊस': 'बारिश', 'निळा': 'नीला', 'हिरवा': 'हरा',
    'पिवळा': 'पीला', 'मोठा': 'बड़ा', 'लहान': 'छोटा', 'बहीण': 'बहन', 'भाऊ': 'भाई',
    'भाकरी': 'रोटी', 'भात': 'चावल', 'पक्षी': 'चिड़िया', 'मासा': 'मछली',
    'डोळा': 'आँख', 'हात': 'हाथ', 'डोकं': 'सिर', 'दोन': 'दो', 'पांढरा': 'सफेद', 'काळा': 'काला',
    'शुभ सकाळ': 'शुभ प्रभात', 'शुभ रात्री': 'शुभ रात्रि', 'तू कसा आहेस': 'आप कैसे हैं',
    'मी ठीक आहे': 'मैं ठीक हूँ', 'नमस्कार': 'नमस्ते',
  },
};

// Escape regex special chars
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Replace wrong-language words in a native-language string.
function fixWrongLanguageText(text, language) {
  if (!text || typeof text !== 'string') return text;
  const normalized = normalizeLanguageName(language);
  const corrections = WRONG_LANGUAGE_WORDS[normalized];
  if (!corrections) return text;
  let fixed = text;
  // Sort longest first to replace multi-word phrases before single words.
  const keys = Object.keys(corrections).sort((a, b) => b.length - a.length);
  for (const wrong of keys) {
    const right = corrections[wrong];
    fixed = fixed.replace(new RegExp(escapeRegex(wrong), 'g'), right);
  }
  return fixed;
}

// Look up a verified native translation for a given English word.
function lookupNativeWord(englishWord, language) {
  if (!englishWord) return '';
  const normalized = normalizeLanguageName(language);
  const dict = ENGLISH_TO_NATIVE[normalized];
  if (!dict) return '';
  const key = String(englishWord).toLowerCase().trim();
  return dict[key] || '';
}

const DAILY_SENTENCE_FALLBACKS = {
  Marathi: [
    { english: 'Good morning', native: 'शुभ सकाळ', transliteration: 'Shubh Sakal', usage: 'Say this when you meet someone in the morning' },
    { english: 'Thank you', native: 'धन्यवाद', transliteration: 'Dhanyavaad', usage: 'Say this to show gratitude' },
    { english: 'How are you?', native: 'तू कसा आहेस?', transliteration: 'Tu kasa ahes?', usage: 'Ask this to greet someone' },
    { english: 'I am fine', native: 'मी ठीक आहे', transliteration: 'Mi theek ahe', usage: 'Reply when someone asks how you are' },
    { english: 'Good night', native: 'शुभ रात्री', transliteration: 'Shubh Ratri', usage: 'Say this before going to sleep' },
  ],
  Hindi: [
    { english: 'Good morning', native: 'शुभ प्रभात', transliteration: 'Shubh Prabhat', usage: 'Say this when you meet someone in the morning' },
    { english: 'Thank you', native: 'धन्यवाद', transliteration: 'Dhanyavaad', usage: 'Say this to show gratitude' },
    { english: 'How are you?', native: 'आप कैसे हैं?', transliteration: 'Aap kaise hain?', usage: 'Ask this to greet someone' },
    { english: 'I am fine', native: 'मैं ठीक हूँ', transliteration: 'Main theek hoon', usage: 'Reply when someone asks how you are' },
    { english: 'Good night', native: 'शुभ रात्रि', transliteration: 'Shubh Ratri', usage: 'Say this before going to sleep' },
  ],
  Tamil: [
    { english: 'Good morning', native: 'காலை வணக்கம்', transliteration: 'Kaalai Vanakkam', usage: 'Say this when you meet someone in the morning' },
    { english: 'Thank you', native: 'நன்றி', transliteration: 'Nandri', usage: 'Say this to show gratitude' },
    { english: 'How are you?', native: 'நீங்கள் எப்படி இருக்கிறீர்கள்?', transliteration: 'Neengal eppadi irukkireergal?', usage: 'Ask this to greet someone' },
    { english: 'I am fine', native: 'நான் நன்றாக இருக்கிறேன்', transliteration: 'Naan nandraga irukkiren', usage: 'Reply when someone asks how you are' },
    { english: 'Good night', native: 'இனிய இரவு', transliteration: 'Iniya Iravu', usage: 'Say this before going to sleep' },
  ],
  Telugu: [
    { english: 'Good morning', native: 'శుభోదయం', transliteration: 'Shubhodayam', usage: 'Say this when you meet someone in the morning' },
    { english: 'Thank you', native: 'ధన్యవాదాలు', transliteration: 'Dhanyavaadalu', usage: 'Say this to show gratitude' },
    { english: 'How are you?', native: 'మీరు ఎలా ఉన్నారు?', transliteration: 'Meeru elaa unnaaru?', usage: 'Ask this to greet someone' },
    { english: 'I am fine', native: 'నేను బాగున్నాను', transliteration: 'Nenu baagunnanu', usage: 'Reply when someone asks how you are' },
    { english: 'Good night', native: 'శుభ రాత్రి', transliteration: 'Shubha Raatri', usage: 'Say this before going to sleep' },
  ],
};

function getDailySentenceFallback(language) {
  return DAILY_SENTENCE_FALLBACKS[language] || DAILY_SENTENCE_FALLBACKS.Hindi;
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

function normalizeVocabularyWords(payload, language) {
  const normalizedLang = normalizeLanguageName(language);
  const rawWords = Array.isArray(payload?.words) ? payload.words : [];

  const words = rawWords
    .map((item) => {
      if (typeof item?.word !== 'string' || !item.word.trim()) {
        return null;
      }

      const word = item.word.trim();
      // Prefer verified native translation from our bank; fall back to LLM output with wrong-language fix.
      const verifiedNative = lookupNativeWord(word, normalizedLang);
      let meaning =
        typeof item.meaning === 'string' && item.meaning.trim() ? item.meaning.trim() : '';
      if (verifiedNative) {
        meaning = verifiedNative;
      } else if (meaning) {
        meaning = fixWrongLanguageText(meaning, normalizedLang);
      } else {
        meaning = 'Meaning unavailable';
      }

      let example =
        typeof item.example === 'string' && item.example.trim()
          ? item.example.trim()
          : `${word} means ${meaning.toLowerCase()} in English.`;

      return {
        word,
        transliteration:
          typeof item.transliteration === 'string' && item.transliteration.trim()
            ? item.transliteration.trim()
            : word,
        meaning,
        example,
      };
    })
    .filter(Boolean)
    // Reject items where the meaning is not in the target script.
    .filter(w => normalizedLang === 'English' || hasScriptChars(w.meaning, normalizedLang))
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

    const systemPrompt = `You are BhashaAI - a friendly English learning tutor. You help users learn English through their native language.

CORE PURPOSE: Help users learn ENGLISH. Detect their native language and teach English through it.

RULES:
1. Detect the EXACT language the user is writing in. That is their native language.
2. Reply in their native language BUT always teach English words and sentences.
3. If user asks about a word, show: English word + meaning in their language + example sentence.
4. Be encouraging, friendly and educational.
5. Do NOT mix up languages. Marathi is NOT Hindi. Tamil is NOT Telugu.
6. If user writes in Romanized script (like "kasa ahes"), reply in Romanized too but teach English.

MARATHI examples:
- "झाड ला इंग्रजीत काय म्हणतात?" → "झाड ला इंग्रजीत TREE म्हणतात. Tree म्हणजे झाड. वाक्य: The tree is big. (झाड मोठे आहे.)"
- "kasa ahes" → "Mi majat ahe! Tumhala English shikvayala tayar! 'How are you?' mhanje 'kasa ahes?'. Example: How are you today?"
- "mala English shikaycha ahe" → "Chhan! Aaj apan navi English words shiku. 'Learn' mhanje 'shikne'. I want to learn = Mala shikaycha ahe."

HINDI examples:
- "पानी को इंग्लिश में क्या बोलते हैं?" → "पानी को English में WATER कहते हैं। वाक्य: I drink water every day. (मैं रोज पानी पीता हूँ।)"
- "namaste" → "Namaste! English mein hum 'Hello' ya 'Hi' bolte hain. Example: Hello, how are you?"
- "mujhe English sikhni hai" → "Bahut accha! Aaj hum naye English words sikhenge. 'Learn' ka matlab hai 'sikhna'. I want to learn = Mujhe sikhna hai."

ENGLISH examples:
- "hello" → "Hello! I'm BhashaAI. I'll help you learn English! What's your native language? Type in your language and I'll teach you English through it!"
- "how are you" → "I'm great! Ready to teach you English! Try asking me 'How do you say ___ in English?' in your language!"

IMPORTANT: You MUST respond in this exact JSON format and nothing else:
{"reply": "your response teaching English through user's native language", "translation": "English translation of your reply"}

If the user is already writing in English, help them improve their English and set translation to the same text.
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

    const target = normalizeLanguageName(targetLanguage || 'English');
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

  const systemPrompt = `You are an English learning quiz generator for BhashaAI app.
The student's native language is ${language}. They want to LEARN ENGLISH through ${language}.

You generate ONE quiz question IN ${language} asking about the English meaning/translation.

JSON FORMAT (strict):
{
  "display": "question in ${language} script asking English meaning",
  "question_type": "word" or "sentence" or "fill_blank",
  "options": ["correct English word/sentence", "wrong English 1", "wrong English 2", "wrong English 3"],
  "correct": 0,
  "explanation": "short explanation in ${language}"
}

RULES:
- "display": ALWAYS in ${language} script. This is the question shown to the user.
- "options": ALWAYS in ENGLISH. These are the answer choices.
- "correct": Always 0 (frontend shuffles).
- "explanation": ALWAYS in ${language} with English translation.
- The quiz tests ${language} → English translation.
- NEVER put English in display. NEVER put ${language} in options.${bankSection}

Return ONLY valid JSON. No markdown, no extra text.`;

  const seed = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Examples per language for pattern matching
  const examples = {
    Marathi: `Examples:
Word: {"display":"झाड याचा इंग्रजी अर्थ काय?","question_type":"word","options":["Tree","Flower","Water","House"],"correct":0,"explanation":"झाड = Tree इंग्रजीत"}
Sentence: {"display":"मी शाळेत जातो = ?","question_type":"sentence","options":["I go to school","I go to market","I go home","I play"],"correct":0,"explanation":"मी शाळेत जातो = I go to school"}
Fill: {"display":"सूर्य = The ___ is in the sky","question_type":"fill_blank","options":["Sun","Moon","Star","Cloud"],"correct":0,"explanation":"सूर्य = Sun इंग्रजीत"}`,
    Hindi: `Examples:
Word: {"display":"पानी का अंग्रेजी अर्थ क्या है?","question_type":"word","options":["Water","Fire","Air","Earth"],"correct":0,"explanation":"पानी = Water in English"}
Sentence: {"display":"मैं स्कूल जाता हूँ = ?","question_type":"sentence","options":["I go to school","I eat food","I drink water","I sleep"],"correct":0,"explanation":"मैं स्कूल जाता हूँ = I go to school"}
Fill: {"display":"सूरज = The ___ is bright","question_type":"fill_blank","options":["Sun","Moon","Star","Cloud"],"correct":0,"explanation":"सूरज = Sun अंग्रेजी में"}`,
    Tamil: `Examples:
Word: {"display":"மரம் என்பதற்கு ஆங்கிலத்தில் என்ன?","question_type":"word","options":["Tree","Flower","River","Mountain"],"correct":0,"explanation":"மரம் = Tree ஆங்கிலத்தில்"}`,
    Telugu: `Examples:
Word: {"display":"చెట్టు అంటే ఆంగ్లంలో ఏమిటి?","question_type":"word","options":["Tree","Flower","River","Mountain"],"correct":0,"explanation":"చెట్టు = Tree ఆంగ్లంలో"}`,
    English: `Examples:
Word: {"display":"What does 'Happy' mean?","question_type":"word","options":["Joyful","Angry","Tired","Hungry"],"correct":0,"explanation":"Happy means joyful or glad."}`,
  };

  const example = examples[language] || examples.English;

  const userPrompt = `Generate 1 quiz question for someone whose native language is ${language} and is learning English.
The question must be IN ${language}. The answer options must be in ENGLISH.
Randomly pick type: word, sentence, or fill_blank.
Topics: fruits, animals, colors, numbers, greetings, family, food, body parts, nature, daily activities, simple sentences.
${bank ? `Use verified ${language} words from: ${bank.words}` : ''}

${example}

Return ONLY JSON:
{"display":"...in ${language}...","question_type":"...","options":["English option 1","English option 2","English option 3","English option 4"],"correct":0,"explanation":"...in ${language}..."}

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
      { display: 'मांजर याचा इंग्रजी अर्थ काय?', question_type: 'word', options: ['Cat', 'Dog', 'Cow', 'Horse'], correct: 0, explanation: 'मांजर = Cat इंग्रजीत' },
      { display: 'झाड याचा इंग्रजी अर्थ काय?', question_type: 'word', options: ['Tree', 'Flower', 'Bird', 'River'], correct: 0, explanation: 'झाड = Tree इंग्रजीत' },
      { display: 'पाणी याचा इंग्रजी अर्थ काय?', question_type: 'word', options: ['Water', 'Milk', 'Tea', 'Rice'], correct: 0, explanation: 'पाणी = Water इंग्रजीत' },
      { display: 'मी शाळेत जातो = ?', question_type: 'sentence', options: ['I go to school', 'I go to market', 'I go home', 'I play'], correct: 0, explanation: 'मी शाळेत जातो = I go to school' },
      { display: 'आई याचा इंग्रजी अर्थ काय?', question_type: 'word', options: ['Mother', 'Father', 'Boy', 'Girl'], correct: 0, explanation: 'आई = Mother इंग्रजीत' },
      { display: 'आंबा याचा इंग्रजी अर्थ काय?', question_type: 'word', options: ['Mango', 'Banana', 'Apple', 'Grapes'], correct: 0, explanation: 'आंबा = Mango इंग्रजीत' },
      { display: 'सूर्य = The ___ is in the sky', question_type: 'fill_blank', options: ['Sun', 'Moon', 'Star', 'Cloud'], correct: 0, explanation: 'सूर्य = Sun इंग्रजीत' },
    ],
    Hindi: [
      { display: 'पानी का अंग्रेजी अर्थ क्या है?', question_type: 'word', options: ['Water', 'Fire', 'Air', 'Earth'], correct: 0, explanation: 'पानी = Water अंग्रेजी में' },
      { display: 'बिल्ली का अंग्रेजी अर्थ क्या है?', question_type: 'word', options: ['Cat', 'Dog', 'Cow', 'Horse'], correct: 0, explanation: 'बिल्ली = Cat अंग्रेजी में' },
      { display: 'पेड़ का अंग्रेजी अर्थ क्या है?', question_type: 'word', options: ['Tree', 'Flower', 'Bird', 'River'], correct: 0, explanation: 'पेड़ = Tree अंग्रेजी में' },
      { display: 'मैं खाना खाता हूँ = ?', question_type: 'sentence', options: ['I eat food', 'I drink water', 'I sleep', 'I play'], correct: 0, explanation: 'मैं खाना खाता हूँ = I eat food' },
      { display: 'आम का अंग्रेजी अर्थ क्या है?', question_type: 'word', options: ['Mango', 'Apple', 'Banana', 'Grapes'], correct: 0, explanation: 'आम = Mango अंग्रेजी में' },
      { display: 'सूरज = The ___ is bright', question_type: 'fill_blank', options: ['Sun', 'Moon', 'Star', 'Cloud'], correct: 0, explanation: 'सूरज = Sun अंग्रेजी में' },
    ],
    Tamil: [
      { display: 'மரம் என்பதற்கு ஆங்கிலத்தில் என்ன?', question_type: 'word', options: ['Tree', 'Flower', 'River', 'Mountain'], correct: 0, explanation: 'மரம் = Tree ஆங்கிலத்தில்' },
      { display: 'பூனை என்பதற்கு ஆங்கிலத்தில் என்ன?', question_type: 'word', options: ['Cat', 'Dog', 'Cow', 'Horse'], correct: 0, explanation: 'பூனை = Cat ஆங்கிலத்தில்' },
    ],
    Telugu: [
      { display: 'చెట్టు అంటే ఆంగ్లంలో ఏమిటి?', question_type: 'word', options: ['Tree', 'Flower', 'River', 'Mountain'], correct: 0, explanation: 'చెట్టు = Tree ఆంగ్లంలో' },
      { display: 'పిల్లి అంటే ఆంగ్లంలో ఏమిటి?', question_type: 'word', options: ['Cat', 'Dog', 'Cow', 'Horse'], correct: 0, explanation: 'పిల్లి = Cat ఆంగ్లంలో' },
    ],
    English: [
      { display: 'What does "Happy" mean?', question_type: 'word', options: ['Joyful', 'Angry', 'Tired', 'Hungry'], correct: 0, explanation: 'Happy means joyful or glad.' },
      { display: 'She is running = ?', question_type: 'sentence', options: ['She moves fast on foot', 'She is sleeping', 'She is eating', 'She is reading'], correct: 0, explanation: 'Running means moving fast on foot.' },
    ],
  };
  const set = fallbacks[normalizeLanguageName(language)] || fallbacks.English;
  return set[Math.floor(Math.random() * set.length)];
}

exports.vocabulary = async (req, res) => {
  let { language = 'Hindi', count = 10, category = '', exclude = [] } = req.body || {};
  language = normalizeLanguageName(language);
  const wordCount = Math.min(Math.max(parseInt(count) || 10, 1), 30);

  const categoryLine = category ? `- All words must belong to the category: "${category}".` : '- Use a mix of everyday categories.';
  const excludeLine = Array.isArray(exclude) && exclude.length > 0
    ? `- Do NOT include any of these words (already learned): ${exclude.join(', ')}.`
    : '';

  try {
    const langGuide = buildLanguageGuide(language);
    const prompt = `You are creating English vocabulary flashcards for a BEGINNER whose native language is ${language}.
The student wants to learn ENGLISH through ${language}.
Return only valid JSON with this exact shape:
{
  "words": [
    {
      "word": "English word to learn",
      "transliteration": "pronunciation guide",
      "meaning": "CORRECT ${language} meaning in native script",
      "example": "Simple English sentence using the word",
      "example_native": "CORRECT ${language} translation of the example sentence"
    }
  ]
}

Rules:
- Generate exactly ${wordCount} simple beginner-level English vocabulary words.
${categoryLine}
${excludeLine}
- ONLY use simple common words from these categories: fruits, animals, colors, numbers, greetings, family members, body parts, food, school items
- NO complex, advanced, or uncommon words
- "word" must be a simple English word (cat, dog, apple, water, house, school, mother, tree).
- "transliteration" is Roman pronunciation of the ${language} native word.
- "meaning" MUST be the CORRECT ${language} translation in native script. Marathi speakers get Marathi words, Hindi speakers get Hindi words. NEVER mix them up.
- "example" is a simple English sentence using the word.
- "example_native" is the CORRECT full ${language} translation of the example.
${langGuide}`;

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
  let { language = 'Hindi' } = req.body || {};
  language = normalizeLanguageName(language);

  try {
    console.log('[AI FillBlank] Request:', { language });

    // Generate in 3 batches of 10
    const allSentences = [];
    const TARGET = 30;
    const MAX_BATCHES = 4;

    for (let batch = 0; batch < MAX_BATCHES && allSentences.length < TARGET; batch++) {
      const already = allSentences.map(s => s.blank_word).join(', ');
      const excludeLine = already ? `\nDo NOT reuse these words: ${already}` : '';

      const langGuide = buildLanguageGuide(language);
      const prompt = `Generate exactly 10 simple fill-in-the-blank English sentences for a beginner whose native language is ${language} and is learning English.

Return ONLY valid JSON:
{
  "sentences": [
    {
      "sentence": "I ___ to school every day.",
      "sentence_native": "CORRECT ${language} translation of the full sentence",
      "blank_word": "go",
      "options": ["go", "eat", "sleep", "run"],
      "correct": 0
    }
  ]
}

Rules:
- Simple everyday beginner sentences ONLY
- Topics: going to school, eating food, playing, family, animals, fruits, colors, weather, greetings
- Words must be simple: go, eat, run, play, sit, stand, read, write, cat, dog, water, milk, red, blue, big, small, mother, father, school, book, apple, mango
- "sentence" is English with one "___" blank
- "sentence_native" is the FULL sentence translated to CORRECT ${language} (no blank, complete sentence). For Marathi use Marathi ONLY (मी दररोज शाळेत जातो). For Hindi use Hindi ONLY (मैं रोज स्कूल जाता हूँ). NEVER mix languages.
- "options" has 4 simple English words, correct at index 0
- NO complex/romantic/advanced words like honeymoon, romantic, anniversary
- Every sentence must be different${excludeLine}
${langGuide}
- Return ONLY valid JSON, no markdown`;

      const text = await generateModelText(prompt);
      const parsed = parseJsonResponse(text);

      if (parsed && Array.isArray(parsed.sentences)) {
        const batchSentences = parsed.sentences
          .filter(s => s.sentence && s.blank_word && Array.isArray(s.options) && s.options.length === 4)
          .filter(s => !allSentences.some(existing => existing.blank_word === s.blank_word))
          .map(s => ({
            sentence: s.sentence,
            sentence_native: fixWrongLanguageText(s.sentence_native || '', language),
            blank_word: s.blank_word,
            options: s.options,
            correct: typeof s.correct === 'number' ? s.correct : 0,
          }))
          // Reject items where the native sentence is not in the target script.
          .filter(s => !s.sentence_native || hasScriptChars(s.sentence_native, language))
          .slice(0, TARGET - allSentences.length);
        allSentences.push(...batchSentences);
        console.log(`[AI FillBlank] Batch ${batch + 1}: got ${batchSentences.length}, total: ${allSentences.length}`);
      }
    }

    if (allSentences.length > 0) {
      return res.json({ success: true, sentences: allSentences.slice(0, TARGET) });
    }

    // Fallback simple sentences
    const fallbackSentences = [
      { sentence: 'I ___ to school.', sentence_native: '', blank_word: 'go', options: ['go', 'eat', 'fly', 'swim'], correct: 0 },
      { sentence: 'The ___ is big.', sentence_native: '', blank_word: 'dog', options: ['dog', 'pen', 'key', 'cup'], correct: 0 },
      { sentence: 'I drink ___ every day.', sentence_native: '', blank_word: 'water', options: ['water', 'stone', 'chair', 'book'], correct: 0 },
      { sentence: 'She is my ___.', sentence_native: '', blank_word: 'mother', options: ['mother', 'table', 'door', 'lamp'], correct: 0 },
      { sentence: 'The ___ is red.', sentence_native: '', blank_word: 'apple', options: ['apple', 'fish', 'shoe', 'ring'], correct: 0 },
      { sentence: 'I ___ food at home.', sentence_native: '', blank_word: 'eat', options: ['eat', 'fly', 'cut', 'sing'], correct: 0 },
      { sentence: 'The cat is ___.', sentence_native: '', blank_word: 'small', options: ['small', 'loud', 'fast', 'dry'], correct: 0 },
      { sentence: 'I read a ___.', sentence_native: '', blank_word: 'book', options: ['book', 'tree', 'road', 'wall'], correct: 0 },
      { sentence: 'The ___ is hot today.', sentence_native: '', blank_word: 'sun', options: ['sun', 'ice', 'bed', 'bag'], correct: 0 },
      { sentence: 'I ___ with my friends.', sentence_native: '', blank_word: 'play', options: ['play', 'cook', 'wash', 'pull'], correct: 0 },
    ];
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

  const levelDesc = 'Generate simple beginner-level English vocabulary words. ONLY use very simple, common words like: cat, dog, cow, bird, fish, apple, mango, banana, orange, red, blue, green, yellow, mother, father, sister, brother, water, milk, bread, rice, book, pen, bag, tree, flower, sun, moon, house, school, hand, eye, head, one, two, three, hello, thank you, goodbye. NO complex or advanced words.';

  const categoryList = 'Animals, Fruits, Colors, Numbers, Family, School Items, Food, Nature, Greetings';

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

      const langGuide = buildLanguageGuide(language);
      const prompt = `${levelDesc}
The student's native language is ${language}. They are learning ENGLISH.
Generate exactly 10 English vocabulary words with CORRECT ${language} meanings.
Mix different categories. Every word must be different.
${excludeLine}${batchExclude}
${langGuide}

Return ONLY valid JSON with this exact shape:
{
  "words": [
    {
      "english": "Apple",
      "native": "सेब",
      "transliteration": "Seb",
      "meaning": "A sweet red fruit",
      "example": "I eat an apple every day.",
      "example_native": "मैं रोज एक सेब खाता हूँ।",
      "emoji": "🍎",
      "category": "Fruits"
    }
  ]
}

Rules:
- "english" is the simple English word to learn (shown BIG on flashcard) e.g. "Apple", "Dog", "Mother"
- "native" is the CORRECT ${language} translation in native script. Must be complete, properly spelled. Marathi: cat=मांजर, dog=कुत्रा, tree=झाड, apple=सफरचंद, mother=आई, father=बाबा, school=शाळा. Hindi: cat=बिल्ली, dog=कुत्ता, tree=पेड़, apple=सेब, mother=माँ, father=पिता, school=स्कूल. NEVER use Hindi words for Marathi users.
- "transliteration" is the Romanized pronunciation of the English word
- "meaning" is a simple meaning in ${language} (so the student understands in their language)
- "example" is a simple English sentence using the word (student reads this to learn)
- "example_native" is the same sentence translated to ${language}
- "emoji" is a single emoji that represents the word
- "category" must be one of: ${categoryList}
- All 10 words MUST be unique and from different categories
- IMPORTANT: The student is learning ENGLISH. "english" field is what they learn. "native" and "meaning" help them understand in ${language}.
- Return ONLY valid JSON, no markdown, no code fences`;

      const text = await generateModelText(prompt);
      const parsed = parseJsonResponse(text);

      if (parsed && Array.isArray(parsed.words)) {
        const batchWords = parsed.words
          .filter(w => w.english && w.native && w.meaning)
          .filter(w => !allWords.some(existing => existing.english.toLowerCase() === w.english.toLowerCase()))
          .map(w => {
            const english = w.english || '';
            // Override with verified native translation if we have one.
            const verifiedNative = lookupNativeWord(english, language);
            const native = verifiedNative || fixWrongLanguageText(w.native || '', language);
            const meaning = verifiedNative || fixWrongLanguageText(w.meaning || '', language);
            return {
              english,
              native,
              transliteration: w.transliteration || english,
              meaning,
              example: w.example || `This is ${english}.`,
              emoji: w.emoji || '📚',
              category: w.category || 'General',
            };
          })
          // Reject items where the native text is not in the target script.
          .filter(w => hasScriptChars(w.native, language))
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

// In-memory cache for daily sentences
const dailySentencesCache = new Map();

exports.dailySentences = async (req, res) => {
  let { language = 'Hindi' } = req.body || {};
  language = normalizeLanguageName(language);
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `${CACHE_VERSION}_${today}_${language.toLowerCase()}_sentences`;

  if (dailySentencesCache.has(cacheKey)) {
    console.log('[AI DailySentences] Cache hit:', cacheKey);
    return res.json({ success: true, sentences: dailySentencesCache.get(cacheKey) });
  }

  try {
    console.log('[AI DailySentences] Request:', { language });

    const langGuide = buildLanguageGuide(language);
    const prompt = `Generate exactly 5 simple daily English phrases/sentences for a beginner whose native language is ${language} and is learning English.

Return ONLY valid JSON:
{
  "sentences": [
    {
      "english": "Good morning",
      "native": "CORRECT ${language} translation in native script",
      "transliteration": "Roman pronunciation of the ${language} translation",
      "usage": "Say this when you meet someone in the morning"
    }
  ]
}

Rules:
- Simple everyday greetings and phrases ONLY
- Pick from: greetings (good morning, good night, thank you, sorry, please), daily phrases (how are you, I am fine, see you later, excuse me, welcome), common sentences (my name is, I like, I want, I need, let's go)
- "english" is the English phrase (what they learn)
- "native" MUST be the CORRECT ${language} translation in native script. For Marathi use Marathi (शुभ सकाळ, धन्यवाद, तू कसा आहेस?). For Hindi use Hindi (शुभ प्रभात, धन्यवाद, आप कैसे हैं?). NEVER confuse Marathi with Hindi.
- "transliteration" is Romanized pronunciation of the ${language} translation
- "usage" is a short tip in English about when to use this phrase
- All 5 must be different and useful for daily life
${langGuide}
- Return ONLY valid JSON, no markdown`;

    const text = await generateModelText(prompt);
    const parsed = parseJsonResponse(text);

    if (parsed && Array.isArray(parsed.sentences) && parsed.sentences.length > 0) {
      const sentences = parsed.sentences
        .filter(s => s.english && s.native)
        .map(s => {
          const verified = lookupNativeWord(s.english, language);
          return {
            english: s.english,
            native: verified || fixWrongLanguageText(s.native, language),
            transliteration: s.transliteration || '',
            usage: s.usage || '',
          };
        })
        // Reject items where the native text is not in the target script.
        .filter(s => hasScriptChars(s.native, language))
        .slice(0, 5);

      if (sentences.length > 0) {
        dailySentencesCache.set(cacheKey, sentences);
        return res.json({ success: true, sentences });
      }
    }

    // Fallback
    res.json({ success: true, sentences: getDailySentenceFallback(language) });
  } catch (error) {
    console.error('[AI DailySentences] Error:', error.message);
    res.json({ success: true, sentences: getDailySentenceFallback(language) });
  }
};
