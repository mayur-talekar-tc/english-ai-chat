import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AI_API_URL } from '../../shared/api';
import { SUPPORTED_LANGUAGE_OPTIONS, getLanguageOption, isIndianLanguage } from '../../shared/languages';

interface VocabularyWord {
  word: string;
  transliteration: string;
  meaning: string;
  example: string;
}

interface VocabularyResponse {
  words?: VocabularyWord[];
}

interface WordDetails {
  word: string;
  transliteration: string;
  meaning: string;
  examples: string[];
  synonyms: string[];
  antonyms: string[];
  usageTips: string;
  difficulty: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

type LearnTab = 'cards' | 'favorites' | 'mastered' | 'review';
type DailyGoal = 5 | 10 | 20;

const FAVORITES_KEY = 'bhashaai_favorites';
const WOTD_KEY = 'bhashaai_wotd';
const GOAL_KEY = 'bhashaai_daily_goal';
const STREAK_KEY = 'bhashaai_learn_streak';
const REVIEW_KEY = 'bhashaai_review_words';
const DAILY_PROGRESS_KEY = 'bhashaai_daily_progress';

const CATEGORIES = [
  { id: '', label: 'All Topics', icon: 'shuffle' },
  { id: 'food', label: 'Food', icon: 'utensils' },
  { id: 'travel', label: 'Travel', icon: 'plane' },
  { id: 'business', label: 'Business', icon: 'briefcase' },
  { id: 'daily-life', label: 'Daily Life', icon: 'home' },
  { id: 'emotions', label: 'Emotions', icon: 'heart' },
  { id: 'numbers', label: 'Numbers', icon: 'hash' },
  { id: 'colors', label: 'Colors', icon: 'palette' },
  { id: 'family', label: 'Family', icon: 'users' },
  { id: 'body-parts', label: 'Body Parts', icon: 'body' },
  { id: 'nature', label: 'Nature', icon: 'leaf' },
];

@Component({
  selector: 'app-learn',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './learn.html',
  styleUrl: './learn.css',
})
export class Learn {
  private http = inject(HttpClient);

  readonly languages = SUPPORTED_LANGUAGE_OPTIONS;
  readonly categories = CATEGORIES;
  readonly goalOptions: DailyGoal[] = [5, 10, 20];

  // Core state
  selectedLanguage = signal('hindi');
  selectedCategory = signal('');
  currentIndex = signal(0);
  isFlipped = signal(false);
  masteredIndices = signal<number[]>([]);
  words = signal<VocabularyWord[]>([]);
  isLoading = signal(false);
  isLoadingMore = signal(false);
  error = signal('');
  activeTab = signal<LearnTab>('cards');

  // Word of the Day
  wordOfTheDay = signal<VocabularyWord | null>(null);
  wotdShared = signal(false);

  // Favorites
  favorites = signal<VocabularyWord[]>([]);

  // Word Details (expanded view)
  showWordDetails = signal(false);
  wordDetails = signal<WordDetails | null>(null);
  isLoadingDetails = signal(false);
  selectedDetailWord = signal<VocabularyWord | null>(null);

  // Quick Quiz
  showQuiz = signal(false);
  quizQuestions = signal<QuizQuestion[]>([]);
  quizIndex = signal(0);
  quizAnswered = signal<number | null>(null);
  quizScore = signal(0);
  quizComplete = signal(false);

  // Daily Goal
  dailyGoal = signal<DailyGoal>(10);
  dailyProgress = signal(0);
  streak = signal(0);
  showGoalCelebration = signal(false);

  // Review Mode
  reviewWords = signal<VocabularyWord[]>([]);
  skippedIndices = signal<number[]>([]);

  // Search
  masteredSearch = signal('');
  favoritesSearch = signal('');

  // Computed
  currentCard = computed(() => this.words()[this.currentIndex()] ?? null);
  progress = computed(() => {
    const total = this.words().length;
    if (!total) return 0;
    return ((this.currentIndex() + 1) / total) * 100;
  });
  masteredCount = computed(() => this.masteredIndices().length);
  currentLanguage = computed(() => getLanguageOption(this.selectedLanguage()));
  isIndianSelection = computed(() => isIndianLanguage(this.selectedLanguage()));
  selectedCategoryLabel = computed(() => this.categories.find(c => c.id === this.selectedCategory())?.label ?? 'All Topics');

  goalProgress = computed(() => {
    const goal = this.dailyGoal();
    if (!goal) return 0;
    return Math.min((this.dailyProgress() / goal) * 100, 100);
  });
  goalComplete = computed(() => this.dailyProgress() >= this.dailyGoal());

  filteredMastered = computed(() => {
    const search = this.masteredSearch().toLowerCase().trim();
    const indices = this.masteredIndices();
    const allWords = this.words();
    const mastered = indices.map(i => allWords[i]).filter(Boolean);
    if (!search) return mastered;
    return mastered.filter(w =>
      w.word.toLowerCase().includes(search) ||
      w.meaning.toLowerCase().includes(search) ||
      w.transliteration.toLowerCase().includes(search)
    );
  });

  filteredFavorites = computed(() => {
    const search = this.favoritesSearch().toLowerCase().trim();
    const favs = this.favorites();
    if (!search) return favs;
    return favs.filter(w =>
      w.word.toLowerCase().includes(search) ||
      w.meaning.toLowerCase().includes(search) ||
      w.transliteration.toLowerCase().includes(search)
    );
  });

  reviewDueCount = computed(() => this.reviewWords().length);

  isFavorited = computed(() => {
    const card = this.currentCard();
    if (!card) return false;
    return this.favorites().some(f => f.word === card.word && f.meaning === card.meaning);
  });

  constructor() {
    this.loadFavorites();
    this.loadWordOfTheDay();
    this.loadDailyGoal();
    this.loadStreak();
    this.loadDailyProgress();
    this.loadReviewWords();
    this.loadVocabulary();
  }

  // === TAB SWITCHING ===
  setTab(tab: LearnTab) {
    this.activeTab.set(tab);
    if (tab === 'review') {
      this.loadReviewWords();
    }
  }

  // === WORD OF THE DAY ===
  private loadWordOfTheDay() {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(WOTD_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.date === today && data.word) {
          this.wordOfTheDay.set(data.word);
          return;
        }
      } catch {}
    }
    this.fetchWordOfTheDay(today);
  }

  private fetchWordOfTheDay(today: string) {
    const languageName = this.currentLanguage()?.name ?? 'Hindi';
    this.http.post<VocabularyResponse>(`${AI_API_URL}/vocabulary`, { language: languageName, count: 1 }).subscribe({
      next: (response) => {
        const words = Array.isArray(response.words) ? response.words : [];
        if (words.length > 0) {
          this.wordOfTheDay.set(words[0]);
          localStorage.setItem(WOTD_KEY, JSON.stringify({ date: today, word: words[0], language: this.selectedLanguage() }));
        }
      },
    });
  }

  shareWordOfTheDay() {
    const wotd = this.wordOfTheDay();
    if (!wotd) return;
    const langName = this.currentLanguage()?.name ?? 'Hindi';
    const text = `Today I learned: ${wotd.word} (${wotd.transliteration}) = ${wotd.meaning} in ${langName}! #BhashaAI`;

    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text).then(() => {
        this.wotdShared.set(true);
        setTimeout(() => this.wotdShared.set(false), 2000);
      });
    }
  }

  // === FAVORITES ===
  private loadFavorites() {
    const saved = localStorage.getItem(FAVORITES_KEY);
    if (saved) {
      try {
        this.favorites.set(JSON.parse(saved));
      } catch {}
    }
  }

  private saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(this.favorites()));
  }

  toggleFavorite(word?: VocabularyWord) {
    const target = word || this.currentCard();
    if (!target) return;
    const exists = this.favorites().some(f => f.word === target.word && f.meaning === target.meaning);
    if (exists) {
      this.favorites.update(favs => favs.filter(f => !(f.word === target.word && f.meaning === target.meaning)));
    } else {
      this.favorites.update(favs => [...favs, target]);
    }
    this.saveFavorites();
  }

  isWordFavorited(word: VocabularyWord): boolean {
    return this.favorites().some(f => f.word === word.word && f.meaning === word.meaning);
  }

  removeFavorite(word: VocabularyWord) {
    this.favorites.update(favs => favs.filter(f => !(f.word === word.word && f.meaning === word.meaning)));
    this.saveFavorites();
  }

  // === CATEGORIES ===
  onCategoryChange(categoryId: string) {
    this.selectedCategory.set(categoryId);
    this.loadVocabulary();
  }

  // === CARD NAVIGATION ===
  flipCard() {
    this.isFlipped.update(v => !v);
  }

  nextCard() {
    if (this.currentIndex() < this.words().length - 1) {
      this.isFlipped.set(false);
      setTimeout(() => this.currentIndex.update(i => i + 1), 150);
    }
  }

  prevCard() {
    if (this.currentIndex() > 0) {
      this.isFlipped.set(false);
      setTimeout(() => this.currentIndex.update(i => i - 1), 150);
    }
  }

  markMastered() {
    const index = this.currentIndex();
    const word = this.words()[index];
    if (!this.masteredIndices().includes(index)) {
      this.masteredIndices.update(indices => [...indices, index]);
      this.incrementDailyProgress();
      // Remove from review if it was there
      if (word) {
        this.reviewWords.update(rw => rw.filter(r => !(r.word === word.word && r.meaning === word.meaning)));
        this.saveReviewWords();
      }
    }
    this.nextCard();
  }

  skipCard() {
    const index = this.currentIndex();
    const word = this.words()[index];
    if (word && !this.skippedIndices().includes(index)) {
      this.skippedIndices.update(s => [...s, index]);
      // Add to review words
      const alreadyInReview = this.reviewWords().some(r => r.word === word.word && r.meaning === word.meaning);
      if (!alreadyInReview) {
        this.reviewWords.update(rw => [...rw, word]);
        this.saveReviewWords();
      }
    }
    this.nextCard();
  }

  // === LANGUAGE ===
  onLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedLanguage.set(select.value);
    this.loadVocabulary();
  }

  // === VOCABULARY LOADING ===
  loadVocabulary() {
    this.currentIndex.set(0);
    this.isFlipped.set(false);
    this.masteredIndices.set([]);
    this.skippedIndices.set([]);
    this.error.set('');
    this.isLoading.set(true);
    this.closeWordDetails();
    this.closeQuiz();

    const languageName = this.currentLanguage()?.name ?? 'Hindi';
    const category = this.selectedCategory();

    this.http.post<VocabularyResponse>(`${AI_API_URL}/vocabulary`, {
      language: languageName,
      count: 20,
      category,
    }).subscribe({
      next: (response) => {
        const words = Array.isArray(response.words) ? response.words : [];
        this.words.set(words);
        this.isLoading.set(false);
        if (!words.length) {
          this.error.set('No vocabulary cards were generated. Try again.');
        }
      },
      error: () => {
        this.isLoading.set(false);
        this.error.set('Vocabulary service is unavailable right now. Try again shortly.');
      },
    });
  }

  loadMoreWords() {
    if (this.isLoadingMore()) return;
    this.isLoadingMore.set(true);

    const languageName = this.currentLanguage()?.name ?? 'Hindi';
    const category = this.selectedCategory();
    const existingMeanings = this.words().map(w => w.meaning);

    this.http.post<VocabularyResponse>(`${AI_API_URL}/vocabulary`, {
      language: languageName,
      count: 10,
      category,
      exclude: existingMeanings,
    }).subscribe({
      next: (response) => {
        const newWords = Array.isArray(response.words) ? response.words : [];
        if (newWords.length) {
          this.words.update(existing => [...existing, ...newWords]);
        }
        this.isLoadingMore.set(false);
      },
      error: () => {
        this.isLoadingMore.set(false);
      },
    });
  }

  // === WORD DETAILS ===
  openWordDetails(word?: VocabularyWord) {
    const target = word || this.currentCard();
    if (!target) return;
    this.selectedDetailWord.set(target);
    this.showWordDetails.set(true);
    this.isLoadingDetails.set(true);
    this.wordDetails.set(null);

    const languageName = this.currentLanguage()?.name ?? 'Hindi';

    this.http.post<{ success: boolean; details?: WordDetails }>(`${AI_API_URL}/word-details`, {
      word: target.word,
      language: languageName,
    }).subscribe({
      next: (res) => {
        this.isLoadingDetails.set(false);
        if (res.success && res.details) {
          this.wordDetails.set(res.details);
        }
      },
      error: () => {
        this.isLoadingDetails.set(false);
      },
    });
  }

  closeWordDetails() {
    this.showWordDetails.set(false);
    this.wordDetails.set(null);
    this.selectedDetailWord.set(null);
  }

  // === QUICK QUIZ ===
  startQuiz(word?: VocabularyWord) {
    const target = word || this.currentCard();
    if (!target) return;

    const allWords = this.words();
    const otherWords = allWords.filter(w => w.meaning !== target.meaning);

    const questions: QuizQuestion[] = [];

    // Q1: What does this word mean?
    const wrongMeanings = this.shuffle(otherWords).slice(0, 3).map(w => w.meaning);
    const q1Options = this.shuffle([target.meaning, ...wrongMeanings]);
    questions.push({
      question: `What does "${target.word}" (${target.transliteration}) mean?`,
      options: q1Options,
      correctIndex: q1Options.indexOf(target.meaning),
    });

    // Q2: Which word means...?
    const wrongWords = this.shuffle(otherWords).slice(0, 3).map(w => `${w.word} (${w.transliteration})`);
    const correctLabel = `${target.word} (${target.transliteration})`;
    const q2Options = this.shuffle([correctLabel, ...wrongWords]);
    questions.push({
      question: `Which word means "${target.meaning}"?`,
      options: q2Options,
      correctIndex: q2Options.indexOf(correctLabel),
    });

    // Q3: Complete the sentence
    const exampleWithBlank = target.example.replace(target.word, '____');
    if (exampleWithBlank !== target.example) {
      const wrongFills = this.shuffle(otherWords).slice(0, 3).map(w => w.word);
      const q3Options = this.shuffle([target.word, ...wrongFills]);
      questions.push({
        question: `Fill in the blank: "${exampleWithBlank}"`,
        options: q3Options,
        correctIndex: q3Options.indexOf(target.word),
      });
    } else {
      const wrongTranslit = this.shuffle(otherWords).slice(0, 3).map(w => w.transliteration);
      const q3Options = this.shuffle([target.transliteration, ...wrongTranslit]);
      questions.push({
        question: `What is the transliteration of "${target.word}"?`,
        options: q3Options,
        correctIndex: q3Options.indexOf(target.transliteration),
      });
    }

    this.quizQuestions.set(questions);
    this.quizIndex.set(0);
    this.quizAnswered.set(null);
    this.quizScore.set(0);
    this.quizComplete.set(false);
    this.showQuiz.set(true);
  }

  answerQuiz(optionIndex: number) {
    if (this.quizAnswered() !== null) return;
    this.quizAnswered.set(optionIndex);
    const current = this.quizQuestions()[this.quizIndex()];
    if (current && optionIndex === current.correctIndex) {
      this.quizScore.update(s => s + 1);
    }
  }

  nextQuizQuestion() {
    if (this.quizIndex() < this.quizQuestions().length - 1) {
      this.quizIndex.update(i => i + 1);
      this.quizAnswered.set(null);
    } else {
      this.quizComplete.set(true);
    }
  }

  closeQuiz() {
    this.showQuiz.set(false);
    this.quizQuestions.set([]);
    this.quizComplete.set(false);
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // === DAILY GOAL ===
  private loadDailyGoal() {
    const saved = localStorage.getItem(GOAL_KEY);
    if (saved) {
      const val = parseInt(saved);
      if (val === 5 || val === 10 || val === 20) {
        this.dailyGoal.set(val);
      }
    }
  }

  setDailyGoal(goal: DailyGoal) {
    this.dailyGoal.set(goal);
    localStorage.setItem(GOAL_KEY, String(goal));
  }

  private loadDailyProgress() {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem(DAILY_PROGRESS_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.date === today) {
          this.dailyProgress.set(data.count || 0);
          return;
        }
      } catch {}
    }
    this.dailyProgress.set(0);
  }

  private saveDailyProgress() {
    const today = new Date().toISOString().split('T')[0];
    localStorage.setItem(DAILY_PROGRESS_KEY, JSON.stringify({ date: today, count: this.dailyProgress() }));
  }

  private incrementDailyProgress() {
    this.dailyProgress.update(p => p + 1);
    this.saveDailyProgress();

    if (this.dailyProgress() === this.dailyGoal()) {
      this.showGoalCelebration.set(true);
      this.updateStreak();
      setTimeout(() => this.showGoalCelebration.set(false), 3000);
    }
  }

  dismissCelebration() {
    this.showGoalCelebration.set(false);
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
        } else {
          this.streak.set(0);
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

  // === REVIEW MODE ===
  private loadReviewWords() {
    const saved = localStorage.getItem(REVIEW_KEY);
    if (saved) {
      try {
        this.reviewWords.set(JSON.parse(saved));
      } catch {}
    }
  }

  private saveReviewWords() {
    localStorage.setItem(REVIEW_KEY, JSON.stringify(this.reviewWords()));
  }

  startReviewMode() {
    const review = this.reviewWords();
    if (!review.length) return;
    this.words.set([...review]);
    this.currentIndex.set(0);
    this.isFlipped.set(false);
    this.masteredIndices.set([]);
    this.skippedIndices.set([]);
    this.activeTab.set('cards');
  }

  removeFromReview(word: VocabularyWord) {
    this.reviewWords.update(rw => rw.filter(r => !(r.word === word.word && r.meaning === word.meaning)));
    this.saveReviewWords();
  }

  // === EXPORT ===
  exportMasteredWords() {
    const mastered = this.filteredMastered();
    if (!mastered.length) return;

    const langName = this.currentLanguage()?.name ?? 'Language';
    let content = `BhashaAI - Mastered ${langName} Words\n${'='.repeat(40)}\n\n`;
    mastered.forEach((w, i) => {
      content += `${i + 1}. ${w.word} (${w.transliteration})\n   Meaning: ${w.meaning}\n   Example: ${w.example}\n\n`;
    });
    content += `\nTotal: ${mastered.length} words\nExported: ${new Date().toLocaleDateString()}\n`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bhashaai-${langName.toLowerCase()}-words.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // === QUIZ HELPERS ===
  getQuizOptionClass(index: number): string {
    const answered = this.quizAnswered();
    const current = this.quizQuestions()[this.quizIndex()];
    if (answered === null || !current) {
      return 'border-white/10 bg-white/5 text-slate-700 hover:border-green-400/50 hover:bg-green-50';
    }
    if (index === current.correctIndex) {
      return 'border-green-500 bg-green-50 text-green-800';
    }
    if (index === answered && index !== current.correctIndex) {
      return 'border-rose-400 bg-rose-50 text-rose-800';
    }
    return 'border-slate-200 bg-white/50 text-slate-400';
  }
}
