import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { AI_API_URL } from '../../shared/api';
import { SUPPORTED_LANGUAGE_OPTIONS, getLanguageOption } from '../../shared/languages';

type QuizCategory = 'vocabulary' | 'grammar' | 'listening' | 'speaking';
type QuizDifficulty = 'beginner' | 'intermediate' | 'advanced';

interface QuizQuestion {
  question: string;
  options: string[];
  correct: number;
  explanation: string;
}

interface QuizResponse {
  questions?: QuizQuestion[];
}

@Component({
  selector: 'app-quiz',
  imports: [DecimalPipe],
  templateUrl: './quiz.html',
  styleUrl: './quiz.css',
})
export class Quiz {
  private http = inject(HttpClient);
  private quizRequestId = 0;

  readonly languages = SUPPORTED_LANGUAGE_OPTIONS;
  readonly categories: { id: QuizCategory; label: string; description: string }[] = [
    { id: 'vocabulary', label: 'Vocabulary', description: 'Word meaning and usage' },
    { id: 'grammar', label: 'Grammar', description: 'Sentence structure and tense' },
    { id: 'listening', label: 'Listening', description: 'Audio-comprehension skills' },
    { id: 'speaking', label: 'Speaking', description: 'Fluency and pronunciation habits' },
  ];
  readonly difficulties: { id: QuizDifficulty; label: string }[] = [
    { id: 'beginner', label: 'Beginner' },
    { id: 'intermediate', label: 'Intermediate' },
    { id: 'advanced', label: 'Advanced' },
  ];

  selectedLanguage = signal(localStorage.getItem('bhashaai_learn_language') || 'hindi');
  selectedCategory = signal<QuizCategory>('vocabulary');
  selectedDifficulty = signal<QuizDifficulty>('beginner');
  questions = signal<QuizQuestion[]>([]);
  currentIndex = signal(0);
  score = signal(0);
  xp = signal(0);
  currentStreak = signal(0);
  bestStreak = signal(0);
  selectedOption = signal<number | null>(null);
  answered = signal(false);
  quizComplete = signal(false);
  isLoading = signal(false);
  error = signal('');
  cardAnimating = signal(true);

  currentQuestion = computed(() => this.questions()[this.currentIndex()] ?? null);
  progress = computed(() => {
    const questionCount = this.questions().length;
    if (!questionCount) return 0;
    return ((this.currentIndex() + 1) / questionCount) * 100;
  });
  scorePercentage = computed(() => {
    const questionCount = this.questions().length;
    if (!questionCount) return 0;
    return Math.round((this.score() / questionCount) * 100);
  });
  performanceMessage = computed(() => {
    const percentage = this.scorePercentage();
    if (percentage >= 90) return 'Outstanding work. You are building real command fast.';
    if (percentage >= 70) return 'Strong round. Your fundamentals are holding up well.';
    if (percentage >= 50) return 'Solid progress. A little more repetition will sharpen this.';
    return 'Good attempt. Review the explanations and run another set.';
  });

  constructor() {
    this.loadQuiz();
  }

  onCategoryChange(category: string) {
    this.selectedCategory.set(category as QuizCategory);
    this.loadQuiz();
  }

  onDifficultyChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedDifficulty.set(select.value as QuizDifficulty);
    this.loadQuiz();
  }

  onLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedLanguage.set(select.value);
    this.loadQuiz();
  }

  selectOption(index: number) {
    const question = this.currentQuestion();
    if (this.answered() || !question) return;

    this.selectedOption.set(index);
    this.answered.set(true);
    if (index === question.correct) {
      this.score.update(s => s + 1);
      this.xp.update(value => value + 10);
      this.currentStreak.update(value => value + 1);
      this.bestStreak.update(value => Math.max(value, this.currentStreak()));
    } else {
      this.currentStreak.set(0);
    }
  }

  nextQuestion() {
    if (this.currentIndex() < this.questions().length - 1) {
      this.currentIndex.update(i => i + 1);
      this.selectedOption.set(null);
      this.answered.set(false);
      this.triggerCardAnimation();
    } else {
      this.quizComplete.set(true);
    }
  }

  restartQuiz() {
    this.currentIndex.set(0);
    this.score.set(0);
    this.xp.set(0);
    this.currentStreak.set(0);
    this.bestStreak.set(0);
    this.selectedOption.set(null);
    this.answered.set(false);
    this.quizComplete.set(false);
    this.error.set('');
    this.triggerCardAnimation();
  }

  loadQuiz() {
    const requestId = ++this.quizRequestId;
    this.restartQuiz();
    this.isLoading.set(true);
    this.questions.set([]);

    const languageName = getLanguageOption(this.selectedLanguage())?.name ?? 'English';
    const variationSeed = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    this.http
      .post<QuizResponse>(`${AI_API_URL}/quiz`, {
        language: languageName,
        category: this.selectedCategory(),
        difficulty: this.selectedDifficulty(),
        variationSeed,
      })
      .subscribe({
        next: (response) => {
          if (requestId !== this.quizRequestId) return;
          const questions = Array.isArray(response.questions) ? response.questions : [];
          this.questions.set(questions);
          this.isLoading.set(false);
          if (!questions.length) {
            this.error.set('No questions were generated. Try another quiz setup.');
          }
          this.triggerCardAnimation();
        },
        error: () => {
          if (requestId !== this.quizRequestId) return;
          this.isLoading.set(false);
          this.error.set('Quiz service is unavailable right now. Try again in a moment.');
        },
      });
  }

  getOptionClass(index: number): string {
    const question = this.currentQuestion();
    if (!question) {
      return 'border-white/10 bg-white/5 text-slate-200';
    }

    if (!this.answered()) {
      return 'border-white/10 bg-white/5 text-slate-100 hover:-translate-y-0.5 hover:border-emerald-300/50 hover:bg-emerald-400/10';
    }
    if (index === question.correct) {
      return 'border-emerald-400 bg-emerald-400/15 text-emerald-100';
    }
    if (index === this.selectedOption() && index !== question.correct) {
      return 'border-rose-400 bg-rose-400/15 text-rose-100';
    }
    return 'border-white/5 bg-white/5 text-slate-400';
  }

  getSelectedLanguageLabel(): string {
    return getLanguageOption(this.selectedLanguage())?.name ?? 'English';
  }

  private triggerCardAnimation() {
    this.cardAnimating.set(false);
    setTimeout(() => this.cardAnimating.set(true), 0);
  }
}
