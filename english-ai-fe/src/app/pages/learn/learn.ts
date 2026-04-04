import { Component, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AI_API_URL } from '../../shared/api';
import { INDIAN_LANGUAGE_OPTIONS } from '../../shared/languages';

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

type LearnTab = 'today' | 'previous';
type Level = 'school' | 'adults';

const DAILY_WORDS_KEY = 'bhashaai_daily_words';
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
  imports: [],
  templateUrl: './learn.html',
  styleUrl: './learn.css',
})
export class Learn {
  private http = inject(HttpClient);

  readonly indianLanguages = INDIAN_LANGUAGE_OPTIONS;

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

  setTab(tab: LearnTab) {
    this.activeTab.set(tab);
    if (tab === 'previous') {
      this.loadHistory();
      this.reviewingDay.set(null);
    }
  }

  onLevelChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    const newLevel = select.value as Level;
    this.level.set(newLevel);
    localStorage.setItem(LEVEL_KEY, newLevel);
    // Reload words for new level
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
    // Reload words for new language
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

    const today = new Date().toISOString().split('T')[0];
    this.saveTodayState(today, this.words(), Array.from(newLearned));

    if (newLearned.size >= this.words().length) {
      this.todayComplete.set(true);
      this.saveTodayToHistory(today);
      this.updateStreak();
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
