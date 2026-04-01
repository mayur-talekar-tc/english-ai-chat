import { Component, signal, computed, inject, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-voice',
  imports: [],
  templateUrl: './voice.html',
  styleUrl: './voice.css',
})
export class Voice implements OnDestroy {
  private http = inject(HttpClient);

  // Mode: 'practice' = pronunciation practice, 'translate' = speak & translate to English
  mode = signal<'practice' | 'translate'>('translate');

  isListening = signal(false);
  isPlaying = signal(false);
  isTranslating = signal(false);
  transcript = signal('');
  feedback = signal('');
  translation = signal('');
  selectedLanguage = signal('hi-IN');
  practiceText = signal('');
  score = signal<number | null>(null);

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

  constructor() {
    this.loadNewPrompt();
    // Pre-load voices (Chrome loads them async)
    speechSynthesis.getVoices();
    speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
  }

  ngOnDestroy() {
    this.stopListening();
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
      `http://127.0.0.1:3001/api/tts?text=${encodeURIComponent(t)}&lang=${lang}`
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
      this.feedback.set('Speech recognition is not supported in your browser. Please use Chrome.');
      return;
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = this.selectedLanguage();
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
      this.transcript.set((finalResult + interimResult).trim());

      // Reset silence timer - auto-stop after 3s of no new speech
      clearTimeout(this.silenceTimer);
      this.silenceTimer = setTimeout(() => {
        this.stopListening();
      }, 3000);
    };

    this.recognition.onend = () => {
      clearTimeout(this.silenceTimer);
      this.isListening.set(false);
      if (this.transcript()) {
        if (this.mode() === 'translate') {
          this.translateToEnglish();
        } else {
          this.evaluatePronunciation();
        }
      }
    };

    this.recognition.onerror = (event: any) => {
      this.isListening.set(false);
      if (event.error === 'no-speech') {
        this.feedback.set('No speech detected. Please try again.');
      } else {
        this.feedback.set('Error: ' + event.error);
      }
    };

    this.transcript.set('');
    this.feedback.set('');
    this.translation.set('');
    this.score.set(null);
    this.recognition.start();
  }

  private stopListening() {
    clearTimeout(this.silenceTimer);
    if (this.recognition) {
      this.recognition.stop();
      this.recognition = null;
    }
    this.isListening.set(false);
  }

  private translateToEnglish() {
    const langName = this.languages.find(l => l.code === this.selectedLanguage())?.name || 'Hindi';
    const text = this.transcript();

    this.isTranslating.set(true);
    this.translation.set('');
    this.feedback.set('');

    this.http.post<{ success: boolean; reply?: string }>('http://127.0.0.1:3001/api/ai/chat', {
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

    this.http.post<{ success: boolean; reply?: string }>('http://127.0.0.1:3001/api/ai/chat', {
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
