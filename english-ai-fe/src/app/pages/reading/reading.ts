import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AI_API_URL } from '../../shared/api';
import { INDIAN_LANGUAGE_OPTIONS } from '../../shared/languages';

interface ReadingSentence {
  english: string;
  native: string;
  words: string[];
}

interface ReadingArticle {
  title: string;
  title_native: string;
  sentences: ReadingSentence[];
  topic: string;
  difficulty: string;
}

@Component({
  selector: 'app-reading',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './reading.html',
})
export class Reading {
  private http = inject(HttpClient);

  languages = INDIAN_LANGUAGE_OPTIONS;
  selectedLanguage = signal('Marathi');
  difficulty = signal<'beginner' | 'intermediate' | 'advanced'>('beginner');
  article = signal<ReadingArticle | null>(null);
  isLoading = signal(false);

  generateArticle() {
    this.isLoading.set(true);
    this.article.set(null);
    this.http
      .post<{ success: boolean; article: ReadingArticle }>(`${AI_API_URL}/reading`, {
        language: this.selectedLanguage(),
        difficulty: this.difficulty(),
      })
      .subscribe({
        next: (res) => {
          this.article.set(res.article);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        },
      });
  }

  saveArticle() {
    const current = this.article();
    if (!current) return;
    const saved = JSON.parse(localStorage.getItem('bhashaai_saved_articles') || '[]');
    saved.push(current);
    localStorage.setItem('bhashaai_saved_articles', JSON.stringify(saved));
    alert('Article saved!');
  }

  setDifficulty(level: 'beginner' | 'intermediate' | 'advanced') {
    this.difficulty.set(level);
  }

  highlightWords(sentence: ReadingSentence): string {
    let text = sentence.english;
    for (const word of sentence.words) {
      const regex = new RegExp(`\\b(${word})\\b`, 'gi');
      text = text.replace(regex, `<span class="text-green-600 font-bold underline decoration-green-300 underline-offset-2">$1</span>`);
    }
    return text;
  }
}
