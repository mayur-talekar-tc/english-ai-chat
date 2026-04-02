export interface LanguageOption {
  code: string;
  name: string;
  flag: string;
  family: 'global' | 'indian';
}

export const INDIAN_LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'hindi', name: 'Hindi', flag: '🇮🇳', family: 'indian' },
  { code: 'marathi', name: 'Marathi', flag: '🇮🇳', family: 'indian' },
  { code: 'bengali', name: 'Bengali', flag: '🇮🇳', family: 'indian' },
  { code: 'telugu', name: 'Telugu', flag: '🇮🇳', family: 'indian' },
  { code: 'tamil', name: 'Tamil', flag: '🇮🇳', family: 'indian' },
  { code: 'gujarati', name: 'Gujarati', flag: '🇮🇳', family: 'indian' },
  { code: 'kannada', name: 'Kannada', flag: '🇮🇳', family: 'indian' },
  { code: 'malayalam', name: 'Malayalam', flag: '🇮🇳', family: 'indian' },
  { code: 'punjabi', name: 'Punjabi', flag: '🇮🇳', family: 'indian' },
  { code: 'odia', name: 'Odia', flag: '🇮🇳', family: 'indian' },
  { code: 'assamese', name: 'Assamese', flag: '🇮🇳', family: 'indian' },
  { code: 'urdu', name: 'Urdu', flag: '🇮🇳', family: 'indian' },
  { code: 'sanskrit', name: 'Sanskrit', flag: '🇮🇳', family: 'indian' },
  { code: 'konkani', name: 'Konkani', flag: '🇮🇳', family: 'indian' },
  { code: 'nepali', name: 'Nepali', flag: '🇮🇳', family: 'indian' },
  { code: 'sindhi', name: 'Sindhi', flag: '🇮🇳', family: 'indian' },
  { code: 'kashmiri', name: 'Kashmiri', flag: '🇮🇳', family: 'indian' },
  { code: 'manipuri', name: 'Manipuri', flag: '🇮🇳', family: 'indian' },
  { code: 'bodo', name: 'Bodo', flag: '🇮🇳', family: 'indian' },
  { code: 'dogri', name: 'Dogri', flag: '🇮🇳', family: 'indian' },
  { code: 'maithili', name: 'Maithili', flag: '🇮🇳', family: 'indian' },
  { code: 'santali', name: 'Santali', flag: '🇮🇳', family: 'indian' },
];

export const GLOBAL_LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'english', name: 'English', flag: '🇺🇸', family: 'global' },
  { code: 'spanish', name: 'Spanish', flag: '🇪🇸', family: 'global' },
  { code: 'french', name: 'French', flag: '🇫🇷', family: 'global' },
  { code: 'japanese', name: 'Japanese', flag: '🇯🇵', family: 'global' },
  { code: 'german', name: 'German', flag: '🇩🇪', family: 'global' },
];

export const SUPPORTED_LANGUAGE_OPTIONS: LanguageOption[] = [
  ...GLOBAL_LANGUAGE_OPTIONS,
  ...INDIAN_LANGUAGE_OPTIONS,
];

const LANGUAGE_LOOKUP = new Map(SUPPORTED_LANGUAGE_OPTIONS.map((language) => [language.code, language]));
const INDIAN_LANGUAGE_CODES = new Set(INDIAN_LANGUAGE_OPTIONS.map((language) => language.code));

export function getLanguageOption(code: string): LanguageOption | undefined {
  return LANGUAGE_LOOKUP.get(code);
}

export function isIndianLanguage(code: string): boolean {
  return INDIAN_LANGUAGE_CODES.has(code);
}
