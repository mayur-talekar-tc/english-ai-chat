import { Component, signal, computed, inject, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AI_API_URL, API_BASE_URL } from '../../shared/api';

@Component({
  selector: 'app-voice',
  imports: [],
  templateUrl: './voice.html',
  styleUrl: './voice.css',
})
export class Voice implements OnDestroy {
  private http = inject(HttpClient);

  // Top-level section: 'single' = original feature, 'multi' = mixed-language mode
  section = signal<'single' | 'multi'>('single');

  // Sub-mode inside Single Language: 'practice' or 'translate'
  mode = signal<'practice' | 'translate'>('translate');

  isListening = signal(false);
  isPlaying = signal(false);
  isTranslating = signal(false);
  transcript = signal('');
  feedback = signal('');
  translation = signal('');
  selectedLanguage = signal(this.getSavedVoiceLanguage());
  practiceText = signal('');
  score = signal<number | null>(null);

  // Multi-voice state — each selection is a "<Language>+English" combo (e.g. "Hinglish")
  multiLanguages = signal<string[]>(['Hinglish']);
  multiTranscript = signal('');
  multiResult = signal<{
    full_translation: string;
    breakdown: Array<{ original: string; language: string; translation: string }>;
    detected_mix: string;
    confidence: string;
  } | null>(null);
  multiError = signal('');
  copied = signal(false);

  // 22 Indian language + English combinations with recognition language code
  // and primary (base) language name for downstream prompts.
  readonly multiLanguageOptions: Array<{ label: string; base: string; flag: string; code: string }> = [
    { label: 'Marathlish', base: 'Marathi', flag: '🇮🇳', code: 'mr-IN' },
    { label: 'Hinglish', base: 'Hindi', flag: '🇮🇳', code: 'hi-IN' },
    { label: 'Benglish', base: 'Bengali', flag: '🇮🇳', code: 'bn-IN' },
    { label: 'Tanglish', base: 'Tamil', flag: '🇮🇳', code: 'ta-IN' },
    { label: 'Tenglish', base: 'Telugu', flag: '🇮🇳', code: 'te-IN' },
    { label: 'Gujlish', base: 'Gujarati', flag: '🇮🇳', code: 'gu-IN' },
    { label: 'Punglish', base: 'Punjabi', flag: '🇮🇳', code: 'pa-IN' },
    { label: 'Kanglish', base: 'Kannada', flag: '🇮🇳', code: 'kn-IN' },
    { label: 'Malglish', base: 'Malayalam', flag: '🇮🇳', code: 'ml-IN' },
    { label: 'Odlish', base: 'Odia', flag: '🇮🇳', code: 'or-IN' },
    { label: 'Asslish', base: 'Assamese', flag: '🇮🇳', code: 'as-IN' },
    { label: 'Urlish', base: 'Urdu', flag: '🇮🇳', code: 'ur-IN' },
    { label: 'Sanglish', base: 'Sanskrit', flag: '🇮🇳', code: 'sa-IN' },
    { label: 'Konlish', base: 'Konkani', flag: '🇮🇳', code: 'kok-IN' },
    { label: 'Sindlish', base: 'Sindhi', flag: '🇮🇳', code: 'sd-IN' },
    { label: 'Kashlish', base: 'Kashmiri', flag: '🇮🇳', code: 'ks-IN' },
    { label: 'Neplish', base: 'Nepali', flag: '🇮🇳', code: 'ne-NP' },
    { label: 'Manlish', base: 'Manipuri', flag: '🇮🇳', code: 'mni-IN' },
    { label: 'Bodlish', base: 'Bodo', flag: '🇮🇳', code: 'brx-IN' },
    { label: 'Doglish', base: 'Dogri', flag: '🇮🇳', code: 'doi-IN' },
    { label: 'Maitlish', base: 'Maithili', flag: '🇮🇳', code: 'mai-IN' },
    { label: 'Sanlish', base: 'Santali', flag: '🇮🇳', code: 'sat-IN' },
  ];

  multiSelectionLabel = computed(() => this.multiLanguages().join(', '));
  multiSelectionValid = computed(() => {
    const n = this.multiLanguages().length;
    return n >= 1 && n <= 5;
  });

  // Color-coded badges per language
  private static readonly LANGUAGE_BADGE_CLASSES: Record<string, string> = {
    English: 'bg-blue-100 text-blue-700 border-blue-200',
    Hindi: 'bg-orange-100 text-orange-700 border-orange-200',
    Marathi: 'bg-green-100 text-green-700 border-green-200',
    Tamil: 'bg-purple-100 text-purple-700 border-purple-200',
    Telugu: 'bg-pink-100 text-pink-700 border-pink-200',
    Bengali: 'bg-rose-100 text-rose-700 border-rose-200',
    Gujarati: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    Punjabi: 'bg-red-100 text-red-700 border-red-200',
    Kannada: 'bg-amber-100 text-amber-700 border-amber-200',
    Malayalam: 'bg-teal-100 text-teal-700 border-teal-200',
    Odia: 'bg-cyan-100 text-cyan-700 border-cyan-200',
    Assamese: 'bg-lime-100 text-lime-700 border-lime-200',
    Urdu: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    Sanskrit: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    Konkani: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
    Sindhi: 'bg-sky-100 text-sky-700 border-sky-200',
    Kashmiri: 'bg-violet-100 text-violet-700 border-violet-200',
    Nepali: 'bg-slate-100 text-slate-700 border-slate-200',
  };

  languageBadgeClass(language: string): string {
    const key = (language || '').trim();
    if (key.includes('+') || key.toLowerCase() === 'mixed') {
      return 'bg-gradient-to-r from-green-100 to-blue-100 text-green-700 border-green-200';
    }
    return Voice.LANGUAGE_BADGE_CLASSES[key] || 'bg-gray-100 text-gray-700 border-gray-200';
  }

  confidenceBadgeClass(confidence: string): string {
    switch ((confidence || '').toLowerCase()) {
      case 'high': return 'bg-green-100 text-green-700 border-green-200';
      case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low': return 'bg-red-100 text-red-700 border-red-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  }

  copyTranslation() {
    const r = this.multiResult();
    if (!r?.full_translation) return;
    navigator.clipboard.writeText(r.full_translation).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    }).catch(() => {
      this.multiError.set('Copy failed');
    });
  }

  selectedLangName = computed(() => this.languages.find(l => l.code === this.selectedLanguage())?.name || 'Hindi');

  private recognition: any = null;
  private silenceTimer: any = null;

  languages = [
    // Indian Languages
    { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
    { code: 'mr-IN', name: 'Marathi', flag: '🇮🇳' },
    { code: 'ta-IN', name: 'Tamil', flag: '🇮🇳' },
    { code: 'te-IN', name: 'Telugu', flag: '🇮🇳' },
    { code: 'kn-IN', name: 'Kannada', flag: '🇮🇳' },
    { code: 'ml-IN', name: 'Malayalam', flag: '🇮🇳' },
    { code: 'pa-IN', name: 'Punjabi', flag: '🇮🇳' },
    { code: 'gu-IN', name: 'Gujarati', flag: '🇮🇳' },
    { code: 'bn-IN', name: 'Bengali', flag: '🇮🇳' },
    { code: 'or-IN', name: 'Odia', flag: '🇮🇳' },
    { code: 'as-IN', name: 'Assamese', flag: '🇮🇳' },
    { code: 'ur-IN', name: 'Urdu', flag: '🇮🇳' },
    // English
    { code: 'en-US', name: 'English', flag: '🇺🇸' },
  ];

  // English sentences for Pronunciation mode - user translates these to their language
  englishPrompts = [
    'Hello, how are you today',
    'Give me one glass of water please',
    'How far is the station from here',
    'The weather is very nice today',
    'It was nice meeting you',
    'What is your name',
    'I am going to school',
    'Please open the door',
    'I like to eat mango',
    'Where do you live',
    'What time is it now',
    'I need help please',
    'This food is very tasty',
    'I want to learn English',
    'How much does this cost',
    'My family is very big',
    'I go to work every day',
    'Can you speak slowly please',
    'The train is coming at five',
    'I love my country India',
  ];

  private static readonly LANG_MAP: Record<string, string> = {
    hindi: 'hi-IN', marathi: 'mr-IN', tamil: 'ta-IN', telugu: 'te-IN',
    kannada: 'kn-IN', malayalam: 'ml-IN', punjabi: 'pa-IN', gujarati: 'gu-IN',
    bengali: 'bn-IN', odia: 'or-IN', assamese: 'as-IN', urdu: 'ur-IN',
    english: 'en-US',
  };

  private getSavedVoiceLanguage(): string {
    const saved = localStorage.getItem('bhashaai_learn_language');
    if (saved && Voice.LANG_MAP[saved]) return Voice.LANG_MAP[saved];
    return 'hi-IN';
  }

  constructor() {
    this.loadNewPrompt();
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }

  ngOnDestroy() {
    this.stopListening();
  }

  setSection(s: 'single' | 'multi') {
    this.stopListening();
    this.section.set(s);
    this.transcript.set('');
    this.feedback.set('');
    this.translation.set('');
    this.score.set(null);
    this.multiTranscript.set('');
    this.multiResult.set(null);
    this.multiError.set('');
    this.copied.set(false);
  }

  setMode(m: 'practice' | 'translate') {
    this.mode.set(m);
    this.transcript.set('');
    this.feedback.set('');
    this.translation.set('');
    this.score.set(null);
    if (m === 'practice') {
      this.loadNewPrompt();
    }
  }

  toggleMultiLanguage(label: string) {
    const current = this.multiLanguages();
    if (current.includes(label)) {
      if (current.length <= 1) {
        this.multiError.set('Select at least 1 language combo.');
        return;
      }
      this.multiLanguages.set(current.filter((l) => l !== label));
      this.multiError.set('');
      return;
    }
    if (current.length >= 5) {
      this.multiError.set('You can select up to 5 language combos.');
      return;
    }
    this.multiLanguages.set([...current, label]);
    this.multiError.set('');
  }

  isMultiLanguageSelected(label: string): boolean {
    return this.multiLanguages().includes(label);
  }

  clearMultiResult() {
    this.multiTranscript.set('');
    this.multiResult.set(null);
    this.multiError.set('');
    this.copied.set(false);
  }

  selectLanguage(code: string) {
    this.selectedLanguage.set(code);
    this.transcript.set('');
    this.feedback.set('');
    this.translation.set('');
    this.score.set(null);
    if (this.mode() === 'practice') {
      this.loadNewPrompt();
    }
  }

  loadNewPrompt() {
    const random = this.englishPrompts[Math.floor(Math.random() * this.englishPrompts.length)];
    this.practiceText.set(random);
    this.transcript.set('');
    this.feedback.set('');
    this.translation.set('');
    this.score.set(null);
  }

  speakText(text?: string, langOverride?: string) {
    if (this.isPlaying()) return;

    const t = text || this.practiceText();
    // practiceText is always English. If text param given: in practice mode it's the selected lang translation, in translate mode it's English
    const lang = langOverride || (text
      ? (this.mode() === 'practice' ? this.selectedLanguage().split('-')[0] : 'en')
      : 'en');

    this.isPlaying.set(true);

    // Use backend TTS proxy (Google Translate voice - clear & loud)
    const audio = new Audio(
      `${API_BASE_URL}/tts?text=${encodeURIComponent(t)}&lang=${lang}`
    );
    audio.volume = 1.0;
    audio.onended = () => this.isPlaying.set(false);
    audio.onerror = () => {
      // Fallback to browser SpeechSynthesis
      this.isPlaying.set(false);
      this.speakFallback(t, text ? 'en-US' : this.selectedLanguage());
    };
    audio.play().catch(() => {
      this.isPlaying.set(false);
      this.speakFallback(t, text ? 'en-US' : this.selectedLanguage());
    });
  }

  private speakFallback(text: string, lang: string) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    utterance.rate = 0.85;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    this.isPlaying.set(true);
    utterance.onend = () => this.isPlaying.set(false);
    utterance.onerror = () => this.isPlaying.set(false);
    speechSynthesis.speak(utterance);
  }

  toggleListening() {
    if (this.isListening()) {
      this.stopListening();
    } else {
      this.startListening();
    }
  }

  private startListening() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const msg = 'Speech recognition is not supported in your browser. Please use Chrome.';
      if (this.section() === 'multi') this.multiError.set(msg);
      else this.feedback.set(msg);
      return;
    }

    const isMulti = this.section() === 'multi';

    if (isMulti && !this.multiSelectionValid()) {
      this.multiError.set('Please select 1 to 5 language combos first.');
      return;
    }

    this.recognition = new SpeechRecognition();
    if (isMulti) {
      // Bias recognition to the first selected combo's base language.
      const first = this.multiLanguages()[0];
      const opt = this.multiLanguageOptions.find((o) => o.label === first);
      this.recognition.lang = opt?.code || 'hi-IN';
    } else {
      this.recognition.lang = this.selectedLanguage();
    }
    this.recognition.interimResults = true;
    this.recognition.continuous = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => this.isListening.set(true);

    this.recognition.onresult = (event: any) => {
      let finalResult = '';
      let interimResult = '';
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalResult += event.results[i][0].transcript;
        } else {
          interimResult += event.results[i][0].transcript;
        }
      }
      const combined = (finalResult + interimResult).trim();
      if (isMulti) {
        this.multiTranscript.set(combined);
      } else {
        this.transcript.set(combined);
      }

      // Reset silence timer - auto-stop after 3s of no new speech
      clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => {
        this.stopListening();
      }, 3000);
    };

    this.recognition.onend = () => {
      clearTimeout(this.silenceTimer);
      this.isListening.set(false);
      // Only trigger translation from onend if stopListening() hasn't already
      // handled it (stopListening nulls recognition before we get here).
      if (!this.recognition) return;
      if (isMulti) {
        if (this.multiTranscript()) {
          this.translateMultiVoice();
        }
      } else if (this.transcript()) {
        if (this.mode() === 'translate') {
          this.translateToEnglish();
        } else {
          this.evaluatePronunciation();
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      this.isListening.set(false);
      const msg = event.error === 'no-speech' ? 'No speech detected. Please try again.' : 'Error: ' + event.error;
      if (isMulti) this.multiError.set(msg);
      else this.feedback.set(msg);
    };

    if (isMulti) {
      this.multiTranscript.set('');
      this.multiResult.set(null);
      this.multiError.set('');
    } else {
      this.transcript.set('');
      this.feedback.set('');
      this.translation.set('');
      this.score.set(null);
    }
    this.recognition.start();
  }

  private translateMultiVoice() {
    const transcript = this.multiTranscript();
    const languages = this.multiLanguages();

    this.isTranslating.set(true);
    this.multiResult.set(null);
    this.multiError.set('');
    this.copied.set(false);

    this.http.post<{
      success: boolean;
      full_translation?: string;
      breakdown?: Array<{ original: string; language: string; translation: string }>;
      detected_mix?: string;
      confidence?: string;
      error?: string;
    }>(`${AI_API_URL}/multi-voice`, { transcript, languages }).subscribe({
      next: (res) => {
        console.log('[MultiVoice] API response:', JSON.stringify(res));
        this.isTranslating.set(false);
        if (res.success && res.full_translation) {
          this.multiResult.set({
            full_translation: res.full_translation,
            breakdown: Array.isArray(res.breakdown) ? res.breakdown : [],
            detected_mix: res.detected_mix || 'Mixed',
            confidence: res.confidence || 'medium',
          });
        } else {
          this.multiError.set(res.error || 'Translation failed. Try again.');
        }
      },
      error: () => {
        this.isTranslating.set(false);
        this.multiError.set('Server not available. Please try again.');
      },
    });
  }

  private stopListening() {
    clearTimeout(this.silenceTimer);
    // Set listening flag to false FIRST so onend doesn't auto-restart in multi mode.
    this.isListening.set(false);

    // Capture state before killing recognition — onend is nulled below so we
    // need to trigger the translation / evaluation from here directly.
    const wasMulti = this.section() === 'multi';
    const hadMultiTranscript = this.multiTranscript();
    const hadSingleTranscript = this.transcript();

    if (this.recognition) {
      try {
        this.recognition.onend = null;
        this.recognition.stop();
      } catch {
        // ignore
      }
      this.recognition = null;
    }

    // Since onend was nulled, fire the appropriate post-recognition action.
    if (wasMulti && hadMultiTranscript) {
      this.translateMultiVoice();
    } else if (!wasMulti && hadSingleTranscript) {
      if (this.mode() === 'translate') {
        this.translateToEnglish();
      } else {
        this.evaluatePronunciation();
      }
    }
  }

  private translateToEnglish() {
    const langName = this.languages.find(l => l.code === this.selectedLanguage())?.name || 'Hindi';
    const text = this.transcript();

    this.isTranslating.set(true);
    this.translation.set('');
    this.feedback.set('');

    this.http.post<{ success: boolean; reply?: string }>(`${AI_API_URL}/chat`, {
      message: `Translate the following ${langName} text to English. Only give the English translation, nothing else. No explanation, no extra text.\n\n"${text}"`,
      language: 'english',
    }).subscribe({
      next: (res) => {
        this.isTranslating.set(false);
        if (res.success && res.reply) {
          this.translation.set(res.reply.replace(/^"|"$/g, '').trim());
        } else {
          this.feedback.set('Translation failed. Try again.');
        }
      },
      error: () => {
        this.isTranslating.set(false);
        this.feedback.set('Server not available. Please try again.');
      },
    });
  }

  private evaluatePronunciation() {
    const langName = this.selectedLangName();
    const englishText = this.practiceText();
    const spokenText = this.transcript();

    this.isTranslating.set(true);
    this.feedback.set('');
    this.translation.set('');
    this.score.set(null);

    this.http.post<{ success: boolean; reply?: string }>(`${AI_API_URL}/chat`, {
      message: `The English sentence is: "${englishText}"
The user tried to say this in ${langName}: "${spokenText}"

Evaluate how accurately the user translated the English sentence to ${langName}.
Reply ONLY in this exact JSON format, nothing else:
{"score": <number 0-100>, "feedback": "<one short line>", "correct_translation": "<correct ${langName} translation of the English sentence>"}`,
      language: 'english',
    }).subscribe({
      next: (res) => {
        this.isTranslating.set(false);
        if (res.success && res.reply) {
          try {
            // Extract JSON from response
            const jsonMatch = res.reply.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const result = JSON.parse(jsonMatch[0]);
              this.score.set(result.score || 0);
              this.feedback.set(result.feedback || '');
              this.translation.set(result.correct_translation || '');
            } else {
              this.feedback.set(res.reply);
            }
          } catch {
            this.feedback.set(res.reply);
          }
        } else {
          this.feedback.set('Evaluation failed. Try again.');
        }
      },
      error: () => {
        this.isTranslating.set(false);
        this.feedback.set('Server not available. Please try again.');
      },
    });
  }
}
