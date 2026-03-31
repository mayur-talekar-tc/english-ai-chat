import { Component, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Flashcard {
  word: string;
  translation: string;
  example: string;
}

@Component({
  selector: 'app-learn',
  imports: [FormsModule, DecimalPipe],
  templateUrl: './learn.html',
  styleUrl: './learn.css',
})
export class Learn {
  selectedLanguage = signal('spanish');
  currentIndex = signal(0);
  isFlipped = signal(false);

  flashcards: Flashcard[] = [
    { word: 'Hola', translation: 'Hello', example: '¡Hola! ¿Cómo estás?' },
    { word: 'Gracias', translation: 'Thank you', example: 'Muchas gracias por tu ayuda.' },
    { word: 'Buenos días', translation: 'Good morning', example: 'Buenos días, señora.' },
    { word: 'Por favor', translation: 'Please', example: '¿Puedes ayudarme, por favor?' },
    { word: 'Adiós', translation: 'Goodbye', example: '¡Adiós! Nos vemos mañana.' },
  ];

  get currentCard(): Flashcard {
    return this.flashcards[this.currentIndex()];
  }

  get progress(): number {
    return ((this.currentIndex() + 1) / this.flashcards.length) * 100;
  }

  flipCard() {
    this.isFlipped.update(v => !v);
  }

  nextCard() {
    if (this.currentIndex() < this.flashcards.length - 1) {
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

  onLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedLanguage.set(select.value);
    this.currentIndex.set(0);
    this.isFlipped.set(false);
  }
}
