import { Component, computed, inject, OnDestroy, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AI_API_URL } from '../../shared/api';
import { SUPPORTED_LANGUAGE_OPTIONS, getLanguageOption } from '../../shared/languages';

interface QuizQuestion {
  display: string;
  question_type: string;
  options: string[];
  correct: number;
  explanation: string;
}

@Component({
  selector: 'app-quiz',
  imports: [],
  templateUrl: './quiz.html',
  styleUrl: './quiz.css',
})
export class Quiz implements OnDestroy {
  private http = inject(HttpClient);
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private requestId = 0;

  readonly languages = SUPPORTED_LANGUAGE_OPTIONS;
  readonly TOTAL = 30;

  // State
  selectedLanguage = signal(localStorage.getItem('bhashaai_learn_language') || 'hindi');
  started = signal(false);
  loading = signal(false);
  error = signal('');

  question = signal<QuizQuestion | null>(null);
  shuffledOptions = signal<string[]>([]);
  shuffledCorrect = signal(0);

  questionNum = signal(0);
  score = signal(0);
  selectedOption = signal<number | null>(null);
  answered = signal(false);
  finished = signal(false);

  // Timer
  timer = signal(30);
  timerExpired = signal(false);

  // Confetti
  confetti = signal<{ left: string; color: string; delay: string }[]>([]);

  // Computed
  languageLabel = computed(() => getLanguageOption(this.selectedLanguage())?.name ?? 'Hindi');

  timerColor = computed(() => {
    const t = this.timer();
    if (t > 20) return '#22c55e';
    if (t > 10) return '#eab308';
    return '#ef4444';
  });

  timerDash = computed(() => {
    const c = 2 * Math.PI * 38;
    return c - (this.timer() / 30) * c;
  });

  circumference = 2 * Math.PI * 38;

  scorePercent = computed(() => Math.round((this.score() / this.TOTAL) * 100));

  resultMessage = computed(() => {
    const p = this.scorePercent();
    if (p === 100) return 'Perfect! You are amazing! 🏆';
    if (p >= 80) return 'Great job! Keep learning! 🌟';
    if (p >= 60) return 'Good effort! Practice more! 📚';
    return 'Keep going! You will get better! 💪';
  });

  ngOnDestroy() {
    this.stopTimer();
  }

  onLanguageChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedLanguage.set(val);
    localStorage.setItem('bhashaai_learn_language', val);
  }

  startQuiz() {
    this.started.set(true);
    this.score.set(0);
    this.questionNum.set(0);
    this.finished.set(false);
    this.confetti.set([]);
    this.loadQuestion();
  }

  loadQuestion() {
    const id = ++this.requestId;
    this.loading.set(true);
    this.error.set('');
    this.selectedOption.set(null);
    this.answered.set(false);
    this.timerExpired.set(false);
    this.question.set(null);
    this.stopTimer();

    this.http
      .post<{ question?: QuizQuestion }>(`${AI_API_URL}/quiz`, {
        language: this.languageLabel(),
      })
      .subscribe({
        next: (res) => {
          if (id !== this.requestId) return;
          const q = res.question;
          if (q && q.display && Array.isArray(q.options) && q.options.length === 4) {
            this.question.set(q);
            this.shuffleOptions(q);
            this.loading.set(false);
            this.startTimer();
          } else {
            this.loading.set(false);
            this.error.set('Bad question received. Trying again...');
          }
        },
        error: () => {
          if (id !== this.requestId) return;
          this.loading.set(false);
          this.error.set('Could not load question. Try again.');
        },
      });
  }

  private shuffleOptions(q: QuizQuestion) {
    const indexed = q.options.map((opt, i) => ({ opt, isCorrect: i === q.correct }));
    for (let i = indexed.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indexed[i], indexed[j]] = [indexed[j], indexed[i]];
    }
    this.shuffledOptions.set(indexed.map(x => x.opt));
    this.shuffledCorrect.set(indexed.findIndex(x => x.isCorrect));
  }

  pickOption(index: number) {
    if (this.answered()) return;
    this.stopTimer();
    this.selectedOption.set(index);
    this.answered.set(true);
    if (index === this.shuffledCorrect()) {
      this.score.update(s => s + 1);
    }
  }

  nextQuestion() {
    const next = this.questionNum() + 1;
    if (next >= this.TOTAL) {
      this.finished.set(true);
      this.stopTimer();
      if (this.scorePercent() >= 70) this.launchConfetti();
    } else {
      this.questionNum.set(next);
      this.loadQuestion();
    }
  }

  retryQuiz() {
    this.startQuiz();
  }

  goToSelect() {
    this.started.set(false);
    this.finished.set(false);
    this.confetti.set([]);
  }

  getOptionClass(i: number): string {
    if (!this.answered()) return 'border-gray-200 bg-white hover:border-green-400 hover:bg-green-50';
    if (i === this.shuffledCorrect()) return 'border-green-500 bg-green-50';
    if (i === this.selectedOption()) return 'border-red-400 bg-red-50';
    return 'border-gray-100 bg-gray-50';
  }

  getOptionIconClass(i: number): string {
    if (!this.answered()) return 'border-gray-300 bg-gray-50 text-gray-500';
    if (i === this.shuffledCorrect()) return 'border-green-500 bg-green-500 text-white';
    if (i === this.selectedOption()) return 'border-red-400 bg-red-400 text-white';
    return 'border-gray-200 bg-gray-50 text-gray-400';
  }

  // Timer
  private startTimer() {
    this.timer.set(30);
    this.timerInterval = setInterval(() => {
      const t = this.timer();
      if (t <= 1) {
        this.timer.set(0);
        this.onTimerExpired();
      } else {
        this.timer.set(t - 1);
      }
    }, 1000);
  }

  private stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  private onTimerExpired() {
    this.stopTimer();
    this.timerExpired.set(true);
    this.answered.set(true);
  }

  // Confetti
  private launchConfetti() {
    const colors = ['#22c55e', '#eab308', '#3b82f6', '#ef4444', '#a855f7', '#ec4899'];
    const pieces: { left: string; color: string; delay: string }[] = [];
    for (let i = 0; i < 40; i++) {
      pieces.push({
        left: `${Math.random() * 100}%`,
        color: colors[Math.floor(Math.random() * colors.length)],
        delay: `${Math.random() * 2}s`,
      });
    }
    this.confetti.set(pieces);
    setTimeout(() => this.confetti.set([]), 3500);
  }
}
