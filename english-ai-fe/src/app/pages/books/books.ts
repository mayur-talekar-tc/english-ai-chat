import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { AI_API_URL } from '../../shared/api';
import { INDIAN_LANGUAGE_OPTIONS } from '../../shared/languages';

interface DifficultWord {
  word: string;
  meaning: string;
  native: string;
}

interface BookSummary {
  title: string;
  author: string;
  genre: string;
  difficulty: string;
  one_line: string;
  one_line_native: string;
  summary_english: string;
  summary_native: string;
  key_lessons: string[];
  key_lessons_native: string[];
  difficult_words: DifficultWord[];
  should_read: string;
  rating: string;
}

interface PopularBook {
  title: string;
  author: string;
  emoji: string;
  genre: string;
}

@Component({
  selector: 'app-books',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './books.html',
})
export class Books {
  private http = inject(HttpClient);

  languages = INDIAN_LANGUAGE_OPTIONS;
  selectedLanguage = signal('Marathi');
  searchBook = signal('');
  selectedBook = signal<BookSummary | null>(null);
  isLoading = signal(false);

  popularBooks: PopularBook[] = [
    { title: 'The Alchemist', author: 'Paulo Coelho', emoji: '⚗️', genre: 'Fiction' },
    { title: 'Atomic Habits', author: 'James Clear', emoji: '⚛️', genre: 'Self Help' },
    { title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', emoji: '🥂', genre: 'Classic' },
    { title: 'To Kill a Mockingbird', author: 'Harper Lee', emoji: '🐦', genre: 'Classic' },
    { title: 'Harry Potter', author: 'J.K. Rowling', emoji: '⚡', genre: 'Fantasy' },
    { title: 'The Monk Who Sold His Ferrari', author: 'Robin Sharma', emoji: '🏍️', genre: 'Self Help' },
    { title: 'Rich Dad Poor Dad', author: 'Robert Kiyosaki', emoji: '💰', genre: 'Finance' },
    { title: 'The Power of Habit', author: 'Charles Duhigg', emoji: '🔄', genre: 'Self Help' },
    { title: 'Wings of Fire', author: 'APJ Abdul Kalam', emoji: '🚀', genre: 'Biography' },
    { title: 'Animal Farm', author: 'George Orwell', emoji: '🐷', genre: 'Classic' },
    { title: 'The Little Prince', author: 'Antoine de Saint-Exupéry', emoji: '👑', genre: 'Fiction' },
    { title: 'Think and Grow Rich', author: 'Napoleon Hill', emoji: '💡', genre: 'Self Help' },
  ];

  getBookSummary(title: string) {
    const trimmed = (title || '').trim();
    if (!trimmed) return;
    this.isLoading.set(true);
    this.selectedBook.set(null);
    this.http
      .post<{ success: boolean; book: BookSummary }>(`${AI_API_URL}/book-summary`, {
        language: this.selectedLanguage(),
        bookTitle: trimmed,
      })
      .subscribe({
        next: (res) => {
          if (res?.success && res.book) {
            this.selectedBook.set(res.book);
          }
          this.isLoading.set(false);
          this.searchBook.set('');
        },
        error: () => {
          this.isLoading.set(false);
        },
      });
  }

  clearBook() {
    this.selectedBook.set(null);
  }

  saveBook() {
    const current = this.selectedBook();
    if (!current) return;
    const saved = JSON.parse(localStorage.getItem('bhashaai_saved_books') || '[]');
    saved.push(current);
    localStorage.setItem('bhashaai_saved_books', JSON.stringify(saved));
    alert('Book saved!');
  }
}
