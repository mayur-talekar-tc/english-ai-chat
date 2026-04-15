import { Component, computed, inject, signal, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AI_API_URL } from '../../shared/api';
import { INDIAN_LANGUAGE_OPTIONS } from '../../shared/languages';
import { ProgressService } from '../../services/progress';
import { AuthService } from '../../services/auth';

interface DailyWord {
  english: string;
  native: string;
  transliteration: string;
  meaning: string;
  example: string;
  emoji: string;
  category: string;
}

interface DayHistory {
  date: string;
  label: string;
  words: DailyWord[];
  level: string;
}

interface QuizQuestion {
  display: string;
  question_type: string;
  options: string[];
  correct: number;
  explanation: string;
}

interface FillBlankSentence {
  sentence: string;
  sentence_native?: string;
  blank_word: string;
  options: string[];
  correct: number;
  selected?: number;
}

type LearnTab = 'today' | 'previous' | 'quiz' | 'spelling' | 'practice';
type Level = 'school' | 'adults';

const DAILY_WORDS_KEY = 'bhashaai_daily_words_v4';
const STREAK_KEY = 'bhashaai_learn_streak';
const LEARNED_KEY = 'bhashaai_learned_history';
const LEVEL_KEY = 'bhashaai_learn_level';
const LANG_KEY = 'bhashaai_learn_language';

const CATEGORY_COLORS: Record<string, string> = {
  Animals: 'bg-amber-100 text-amber-700 border-amber-200',
  Fruits: 'bg-red-100 text-red-700 border-red-200',
  Vegetables: 'bg-green-100 text-green-700 border-green-200',
  Colors: 'bg-purple-100 text-purple-700 border-purple-200',
  Numbers: 'bg-blue-100 text-blue-700 border-blue-200',
  'Body Parts': 'bg-pink-100 text-pink-700 border-pink-200',
  Family: 'bg-rose-100 text-rose-700 border-rose-200',
  'School Items': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  Food: 'bg-orange-100 text-orange-700 border-orange-200',
  Nature: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  Business: 'bg-slate-100 text-slate-700 border-slate-200',
  Technology: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  Health: 'bg-teal-100 text-teal-700 border-teal-200',
  Travel: 'bg-sky-100 text-sky-700 border-sky-200',
  Emotions: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
  Society: 'bg-violet-100 text-violet-700 border-violet-200',
  Science: 'bg-lime-100 text-lime-700 border-lime-200',
  'Daily Life': 'bg-yellow-100 text-yellow-700 border-yellow-200',
};

@Component({
  selector: 'app-learn',
  imports: [FormsModule],
  templateUrl: './learn.html',
  styleUrl: './learn.css',
})
export class Learn implements OnDestroy {
  private http = inject(HttpClient);
  progress = inject(ProgressService);
  auth = inject(AuthService);

  readonly indianLanguages = INDIAN_LANGUAGE_OPTIONS;
  readonly QUIZ_TOTAL = 10;

  activeTab = signal<LearnTab>('today');
  level = signal<Level>('school');
  selectedLanguage = signal('hindi');
  words = signal<DailyWord[]>([]);
  currentIndex = signal(0);
  isFlipped = signal(false);
  isLoading = signal(false);
  learnedIndices = signal<Set<number>>(new Set());
  reviewIndices = signal<Set<number>>(new Set());
  todayComplete = signal(false);
  streak = signal(0);
  dailyHistory = signal<DayHistory[]>([]);
  reviewingDay = signal<DayHistory | null>(null);

  // Quiz state (API-based, merged from Quiz page)
  quizQuestion = signal<QuizQuestion | null>(null);
  quizShuffledOptions = signal<string[]>([]);
  quizShuffledCorrect = signal(0);
  quizQuestionNum = signal(0);
  quizScore = signal(0);
  quizSelectedOption = signal<number | null>(null);
  quizAnswered = signal(false);
  quizFinished = signal(false);
  quizLoading = signal(false);
  quizError = signal('');
  quizStarted = signal(false);
  quizDifficulty = signal<'beginner' | 'intermediate' | 'advanced'>('beginner');
  private quizRequestId = 0;

  // Quiz timer
  quizTimer = signal(30);
  quizTimerExpired = signal(false);
  private quizTimerInterval: ReturnType<typeof setInterval> | null = null;
  readonly quizCircumference = 2 * Math.PI * 38;

  quizTimerColor = computed(() => {
    const t = this.quizTimer();
    if (t > 20) return '#22c55e';
    if (t > 10) return '#eab308';
    return '#ef4444';
  });

  quizTimerDash = computed(() => {
    return this.quizCircumference - (this.quizTimer() / 30) * this.quizCircumference;
  });

  quizScorePercent = computed(() => Math.round((this.quizScore() / this.QUIZ_TOTAL) * 100));

  quizResultMessage = computed(() => {
    const p = this.quizScorePercent();
    if (p === 100) return 'Perfect! You are amazing! 🏆';
    if (p >= 80) return 'Great job! Keep learning! 🌟';
    if (p >= 60) return 'Good effort! Practice more! 📚';
    return 'Keep going! You will get better! 💪';
  });

  // Confetti
  quizConfetti = signal<{ left: string; color: string; delay: string }[]>([]);

  showQuizButton = signal(false);

  // Spelling state
  spellingWords = signal<DailyWord[]>([]);
  spellingIndex = signal(0);
  spellingInput = signal('');
  spellingResult = signal<'correct' | 'wrong' | null>(null);
  spellingCorrectWord = signal('');
  spellingScore = signal(0);
  spellingTotal = signal(0);
  spellingFinished = signal(false);

  // Fill in the blank state
  fillBlankSentences = signal<FillBlankSentence[]>([]);
  fillBlankIndex = signal(0);
  fillBlankFinished = signal(false);
  fillBlankScore = signal(0);
  fillBlankLoading = signal(false);
  fillBlankResult = signal<'correct' | 'wrong' | null>(null);

  // Computed
  currentCard = computed(() => this.words()[this.currentIndex()] ?? null);
  learnedCount = computed(() => this.learnedIndices().size);
  totalWords = computed(() => this.words().length);
  goalProgress = computed(() => {
    const total = this.totalWords();
    if (!total) return 0;
    return Math.min((this.learnedCount() / total) * 100, 100);
  });
  goalComplete = computed(() => this.learnedCount() >= this.totalWords() && this.totalWords() > 0);
  levelLabel = computed(() => this.level() === 'school' ? 'School' : 'Adults');
  selectedLanguageName = computed(() => {
    const lang = this.indianLanguages.find(l => l.code === this.selectedLanguage());
    return lang ? lang.name : 'Hindi';
  });

  constructor() {
    this.loadLevel();
    this.loadLanguage();
    this.loadStreak();
    this.loadHistory();
    this.loadTodayWords();
  }

  ngOnDestroy() {
    this.stopQuizTimer();
  }

  setTab(tab: LearnTab) {
    this.activeTab.set(tab);
    if (tab === 'previous') {
      this.loadHistory();
      this.reviewingDay.set(null);
    }
    if (tab === 'spelling') {
      this.startSpelling();
    }
    if (tab === 'practice' && this.fillBlankSentences().length === 0) {
      this.loadFillBlank();
    }
  }

  onLevelChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const newLevel = select.value as Level;
    this.level.set(newLevel);
    localStorage.setItem(LEVEL_KEY, newLevel);
    this.todayComplete.set(false);
    this.learnedIndices.set(new Set());
    this.reviewIndices.set(new Set());
    this.currentIndex.set(0);
    this.isFlipped.set(false);
    this.fetchDailyWords(new Date().toISOString().split('T')[0]);
  }

  private loadLevel() {
    const saved = localStorage.getItem(LEVEL_KEY);
    if (saved === 'school' || saved === 'adults') {
      this.level.set(saved);
    }
  }

  private loadLanguage() {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved) {
      this.selectedLanguage.set(saved);
    }
  }

  onLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedLanguage.set(select.value);
    localStorage.setItem(LANG_KEY, select.value);
    this.todayComplete.set(false);
    this.learnedIndices.set(new Set());
    this.reviewIndices.set(new Set());
    this.currentIndex.set(0);
    this.isFlipped.set(false);
    this.fetchDailyWords(new Date().toISOString().split('T')[0]);
  }

  // === LOAD TODAY'S WORDS ===
  private loadTodayWords() {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(DAILY_WORDS_KEY);

    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.date === today && data.level === this.level() && data.language === this.selectedLanguage() && Array.isArray(data.words) && data.words.length > 0) {
          this.words.set(data.words);
          const learned = new Set<number>(data.learned || []);
          this.learnedIndices.set(learned);
          if (learned.size >= data.words.length) {
            this.todayComplete.set(true);
          }
          // Show quiz button after 10 words learned
          if (learned.size >= 10) {
            this.showQuizButton.set(true);
          }
          return;
        }
      } catch {}
    }

    this.fetchDailyWords(today);
  }

  private fetchDailyWords(today: string) {
    this.isLoading.set(true);
    const allLearned = this.getAllLearnedWords();

    this.http
      .post<{ success: boolean; words: DailyWord[]; date: string }>(`${AI_API_URL}/daily-words`, {
        language: this.selectedLanguageName(),
        date: today,
        level: this.level(),
        excludeWords: allLearned,
      })
      .subscribe({
        next: (res) => {
          if (res.success && res.words.length > 0) {
            this.words.set(res.words);
            this.saveTodayState(today, res.words, []);
          }
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        },
      });
  }

  private getAllLearnedWords(): string[] {
    const words: string[] = [];
    const saved = localStorage.getItem(LEARNED_KEY);
    if (saved) {
      try {
        const history: { date: string; words: DailyWord[] }[] = JSON.parse(saved);
        for (const day of history) {
          for (const w of day.words) {
            words.push(w.english);
          }
        }
      } catch {}
    }
    return words;
  }

  private saveTodayState(date: string, words: DailyWord[], learned: number[]) {
    localStorage.setItem(DAILY_WORDS_KEY, JSON.stringify({ date, words, learned, level: this.level(), language: this.selectedLanguage() }));
  }

  // === CARD ACTIONS ===
  flipCard() {
    this.isFlipped.update(v => !v);
  }

  markLearned() {
    const index = this.currentIndex();
    const newLearned = new Set(this.learnedIndices());
    newLearned.add(index);
    this.learnedIndices.set(newLearned);

    // +5 XP for word learned
    this.progress.addXP(5, 'word');

    const today = new Date().toISOString().split('T')[0];
    this.saveTodayState(today, this.words(), Array.from(newLearned));

    // Show quiz button after 10 words
    if (newLearned.size >= 10) {
      this.showQuizButton.set(true);
    }

    if (newLearned.size >= this.words().length) {
      this.todayComplete.set(true);
      this.saveTodayToHistory(today);
      this.updateStreak();
      // +20 XP for daily goal complete
      this.progress.addXP(20, 'daily_complete');
    } else {
      this.goToNextUnlearned();
    }
  }

  markReview() {
    const index = this.currentIndex();
    const newReview = new Set(this.reviewIndices());
    newReview.add(index);
    this.reviewIndices.set(newReview);
    this.goToNextUnlearned();
  }

  private goToNextUnlearned() {
    this.isFlipped.set(false);
    const words = this.words();
    const learned = this.learnedIndices();
    let next = this.currentIndex() + 1;

    for (let i = 0; i < words.length; i++) {
      const idx = (next + i) % words.length;
      if (!learned.has(idx)) {
        setTimeout(() => this.currentIndex.set(idx), 200);
        return;
      }
    }
  }

  goToCard(index: number) {
    this.isFlipped.set(false);
    setTimeout(() => this.currentIndex.set(index), 150);
  }

  // === HISTORY ===
  private saveTodayToHistory(today: string) {
    const saved = localStorage.getItem(LEARNED_KEY);
    let history: { date: string; words: DailyWord[]; level?: string }[] = [];
    if (saved) {
      try { history = JSON.parse(saved); } catch {}
    }

    if (history.some(h => h.date === today)) return;

    history.unshift({ date: today, words: this.words(), level: this.level() });
    history = history.slice(0, 30);
    localStorage.setItem(LEARNED_KEY, JSON.stringify(history));
  }

  private loadHistory() {
    const saved = localStorage.getItem(LEARNED_KEY);
    if (!saved) { this.dailyHistory.set([]); return; }

    try {
      const history: { date: string; words: DailyWord[]; level?: string }[] = JSON.parse(saved);
      const today = new Date().toISOString().split('T')[0];

      this.dailyHistory.set(
        history
          .filter(h => h.date !== today)
          .map(h => ({
            date: h.date,
            label: this.getDateLabel(h.date),
            words: h.words,
            level: h.level || 'school',
          }))
      );
    } catch {
      this.dailyHistory.set([]);
    }
  }

  private getDateLabel(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);

    if (diffDays === 1) return 'Yesterday';
    if (diffDays === 2) return '2 days ago';
    if (diffDays <= 7) return `${diffDays} days ago`;
    if (diffDays <= 14) return 'Last week';

    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  }

  reviewDay(day: DayHistory) {
    this.reviewingDay.set(day);
  }

  closeReview() {
    this.reviewingDay.set(null);
  }

  // === STREAK ===
  private loadStreak() {
    const saved = localStorage.getItem(STREAK_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (data.lastDate === today || data.lastDate === yesterday) {
          this.streak.set(data.count || 0);
        }
      } catch {}
    }
  }

  private updateStreak() {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(STREAK_KEY);
    let count = 1;
    if (saved) {
      try {
        const data = JSON.parse(saved);
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (data.lastDate === yesterday) {
          count = (data.count || 0) + 1;
        } else if (data.lastDate === today) {
          count = data.count || 1;
        }
      } catch {}
    }
    this.streak.set(count);
    localStorage.setItem(STREAK_KEY, JSON.stringify({ lastDate: today, count }));
  }

  // === QUIZ (API-based) ===
  startQuiz() {
    this.quizStarted.set(true);
    this.quizFinished.set(false);
    this.quizScore.set(0);
    this.quizQuestionNum.set(0);
    this.quizQuestion.set(null);
    this.quizError.set('');
    this.quizConfetti.set([]);
    this.loadQuizQuestion();
  }

  private loadQuizQuestion() {
    this.quizLoading.set(true);
    this.quizAnswered.set(false);
    this.quizSelectedOption.set(null);
    this.quizTimerExpired.set(false);
    this.quizError.set('');

    const requestId = ++this.quizRequestId;

    // Send today's learned words so quiz is based on them
    const learnedWords = this.words().filter((_, i) => this.learnedIndices().has(i));
    const wordsPayload = learnedWords.length > 0
      ? learnedWords.map(w => ({ english: w.english, native: w.native, meaning: w.meaning }))
      : this.words().map(w => ({ english: w.english, native: w.native, meaning: w.meaning }));

    this.http.post<{ success: boolean; question: QuizQuestion }>(`${AI_API_URL}/quiz`, {
      language: this.selectedLanguageName(),
      difficulty: this.quizDifficulty(),
      words: wordsPayload,
    }).subscribe({
      next: (res) => {
        if (requestId !== this.quizRequestId) return;
        if (res.success && res.question) {
          this.quizQuestion.set(res.question);
          this.shuffleQuizOptions(res.question);
          this.quizQuestionNum.update(n => n + 1);
          this.startQuizTimer();
        } else {
          this.quizError.set('Failed to load question. Try again.');
        }
        this.quizLoading.set(false);
      },
      error: () => {
        if (requestId !== this.quizRequestId) return;
        this.quizError.set('Server not available. Try again.');
        this.quizLoading.set(false);
      },
    });
  }

  private shuffleQuizOptions(q: QuizQuestion) {
    const correctAnswer = q.options[q.correct];
    const shuffled = [...q.options].sort(() => Math.random() - 0.5);
    this.quizShuffledOptions.set(shuffled);
    this.quizShuffledCorrect.set(shuffled.indexOf(correctAnswer));
  }

  pickQuizOption(index: number) {
    if (this.quizAnswered() || this.quizTimerExpired()) return;
    this.quizAnswered.set(true);
    this.quizSelectedOption.set(index);
    this.stopQuizTimer();

    if (index === this.quizShuffledCorrect()) {
      this.quizScore.update(s => s + 1);
      this.progress.addXP(10, 'quiz_correct');
    }
  }

  nextQuizQuestion() {
    if (this.quizQuestionNum() >= this.QUIZ_TOTAL) {
      this.quizFinished.set(true);
      this.stopQuizTimer();
      if (this.quizScorePercent() >= 80) {
        this.launchQuizConfetti();
      }
    } else {
      this.loadQuizQuestion();
    }
  }

  retryQuiz() {
    this.startQuiz();
  }

  goToQuizSelect() {
    this.quizStarted.set(false);
    this.quizFinished.set(false);
    this.quizQuestion.set(null);
    this.quizScore.set(0);
    this.quizQuestionNum.set(0);
    this.quizError.set('');
    this.quizConfetti.set([]);
    this.stopQuizTimer();
  }

  getQuizOptionClass(i: number): string {
    if (!this.quizAnswered() && !this.quizTimerExpired()) {
      return 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50 active:scale-[0.98] cursor-pointer';
    }
    if (i === this.quizShuffledCorrect()) {
      return 'border-green-400 bg-green-50 text-green-700';
    }
    if (i === this.quizSelectedOption() && i !== this.quizShuffledCorrect()) {
      return 'border-red-400 bg-red-50 text-red-700 animate-shake';
    }
    return 'border-gray-200 bg-white text-gray-400';
  }

  getQuizOptionIcon(i: number): string {
    if (!this.quizAnswered() && !this.quizTimerExpired()) return '';
    if (i === this.quizShuffledCorrect()) return '✓';
    if (i === this.quizSelectedOption() && i !== this.quizShuffledCorrect()) return '✗';
    return '';
  }

  // Quiz timer
  private startQuizTimer() {
    this.stopQuizTimer();
    this.quizTimer.set(30);
    this.quizTimerExpired.set(false);
    this.quizTimerInterval = setInterval(() => {
      this.quizTimer.update(t => t - 1);
      if (this.quizTimer() <= 0) {
        this.onQuizTimerExpired();
      }
    }, 1000);
  }

  stopQuizTimer() {
    if (this.quizTimerInterval) {
      clearInterval(this.quizTimerInterval);
      this.quizTimerInterval = null;
    }
  }

  private onQuizTimerExpired() {
    this.stopQuizTimer();
    this.quizTimerExpired.set(true);
    this.quizAnswered.set(true);
  }

  private launchQuizConfetti() {
    const colors = ['#22c55e', '#3b82f6', '#eab308', '#ef4444', '#a855f7', '#ec4899'];
    const pieces = Array.from({ length: 40 }, () => ({
      left: Math.random() * 100 + '%',
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 0.5 + 's',
    }));
    this.quizConfetti.set(pieces);
    setTimeout(() => this.quizConfetti.set([]), 3000);
  }

  // === SPELLING PRACTICE ===
  startSpelling() {
    const learnedWords = this.words().filter((_, i) => this.learnedIndices().has(i));
    if (learnedWords.length === 0) {
      this.spellingWords.set(this.words().slice(0, 10));
    } else {
      this.spellingWords.set([...learnedWords].sort(() => Math.random() - 0.5).slice(0, 10));
    }
    this.spellingIndex.set(0);
    this.spellingInput.set('');
    this.spellingResult.set(null);
    this.spellingScore.set(0);
    this.spellingTotal.set(0);
    this.spellingFinished.set(false);
  }

  checkSpelling() {
    const word = this.spellingWords()[this.spellingIndex()];
    if (!word) return;

    const input = this.spellingInput().trim().toLowerCase();
    const correct = word.english.trim().toLowerCase();

    this.spellingTotal.update(t => t + 1);

    if (input === correct) {
      this.spellingResult.set('correct');
      this.spellingScore.update(s => s + 1);
      this.progress.addXP(15, 'spelling_correct');
    } else {
      this.spellingResult.set('wrong');
      this.spellingCorrectWord.set(word.english);
    }
    this.progress.addXP(0, 'spelling_total');
  }

  nextSpellingWord() {
    if (this.spellingIndex() < this.spellingWords().length - 1) {
      this.spellingIndex.update(i => i + 1);
      this.spellingInput.set('');
      this.spellingResult.set(null);
    } else {
      this.spellingFinished.set(true);
    }
  }

  resetSpelling() {
    this.startSpelling();
  }

  // === FILL IN THE BLANK ===
  loadFillBlank() {
    const learnedWords = this.words().filter((_, i) => this.learnedIndices().has(i));
    const wordsToUse = learnedWords.length >= 5 ? learnedWords : this.words().slice(0, 10);

    this.fillBlankLoading.set(true);
    this.fillBlankFinished.set(false);
    this.fillBlankScore.set(0);
    this.fillBlankIndex.set(0);
    this.fillBlankResult.set(null);

    this.http.post<{ success: boolean; sentences: FillBlankSentence[] }>(`${AI_API_URL}/fill-blank`, {
      words: wordsToUse,
      language: this.selectedLanguageName(),
    }).subscribe({
      next: (res) => {
        if (res.success && res.sentences?.length > 0) {
          this.fillBlankSentences.set(res.sentences);
        }
        this.fillBlankLoading.set(false);
      },
      error: () => {
        this.fillBlankLoading.set(false);
      },
    });
  }

  selectFillBlankAnswer(optionIndex: number) {
    const sentences = [...this.fillBlankSentences()];
    const current = sentences[this.fillBlankIndex()];
    if (current.selected !== undefined) return;

    current.selected = optionIndex;
    sentences[this.fillBlankIndex()] = { ...current };
    this.fillBlankSentences.set(sentences);

    if (optionIndex === current.correct) {
      this.fillBlankResult.set('correct');
      this.fillBlankScore.update(s => s + 1);
      this.progress.addXP(10, 'quiz_correct');
    } else {
      this.fillBlankResult.set('wrong');
    }

    setTimeout(() => {
      this.fillBlankResult.set(null);
      if (this.fillBlankIndex() < this.fillBlankSentences().length - 1) {
        this.fillBlankIndex.update(i => i + 1);
      } else {
        this.fillBlankFinished.set(true);
      }
    }, 1200);
  }

  resetFillBlank() {
    this.fillBlankSentences.set([]);
    this.loadFillBlank();
  }

  // === HELPERS ===
  getCategoryClass(category: string): string {
    return CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-700 border-gray-200';
  }

  isCardLearned(index: number): boolean {
    return this.learnedIndices().has(index);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
  }
}
