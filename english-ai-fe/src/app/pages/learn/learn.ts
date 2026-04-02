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

@Component({
  selector: 'app-learn',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './learn.html',
  styleUrl: './learn.css',
})
export class Learn {
  private http = inject(HttpClient);

  readonly languages = SUPPORTED_LANGUAGE_OPTIONS;

  selectedLanguage = signal('hindi');
  currentIndex = signal(0);
  isFlipped = signal(false);
  masteredIndices = signal<number[]>([]);
  words = signal<VocabularyWord[]>([]);
  isLoading = signal(false);
  isLoadingMore = signal(false);
  error = signal('');

  currentCard = computed(() => this.words()[this.currentIndex()] ?? null);
  progress = computed(() => {
    const total = this.words().length;
    if (!total) return 0;
    return ((this.currentIndex() + 1) / total) * 100;
  });
  masteredCount = computed(() => this.masteredIndices().length);
  currentLanguage = computed(() => getLanguageOption(this.selectedLanguage()));
  isIndianSelection = computed(() => isIndianLanguage(this.selectedLanguage()));

  constructor() {
    this.loadVocabulary();
  }

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
    this.masteredIndices.update((indices) => (indices.includes(index) ? indices : [...indices, index]));
    this.nextCard();
  }

  onLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedLanguage.set(select.value);
    this.loadVocabulary();
  }

  loadVocabulary() {
    this.currentIndex.set(0);
    this.isFlipped.set(false);
    this.masteredIndices.set([]);
    this.error.set('');
    this.isLoading.set(true);

    const languageName = this.currentLanguage()?.name ?? 'Hindi';

    this.http.post<VocabularyResponse>(`${AI_API_URL}/vocabulary`, { language: languageName, count: 20 }).subscribe({
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

    this.http.post<VocabularyResponse>(`${AI_API_URL}/vocabulary`, { language: languageName, count: 10 }).subscribe({
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
}
