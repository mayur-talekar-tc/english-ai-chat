import { Component, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface Flashcard {
  word: string;
  translation: string;
  example: string;
}

interface LanguageData {
  label: string;
  flag: string;
  cards: Flashcard[];
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
  masteredCount = signal(0);

  languageData: Record<string, LanguageData> = {
    spanish: {
      label: 'Spanish', flag: '🇪🇸',
      cards: [
        { word: 'Hola', translation: 'Hello', example: '¡Hola! ¿Cómo estás?' },
        { word: 'Gracias', translation: 'Thank you', example: 'Muchas gracias por tu ayuda.' },
        { word: 'Buenos días', translation: 'Good morning', example: 'Buenos días, señora.' },
        { word: 'Por favor', translation: 'Please', example: '¿Puedes ayudarme, por favor?' },
        { word: 'Adiós', translation: 'Goodbye', example: '¡Adiós! Nos vemos mañana.' },
        { word: 'Agua', translation: 'Water', example: 'Necesito un vaso de agua.' },
        { word: 'Amigo', translation: 'Friend', example: 'Él es mi mejor amigo.' },
        { word: 'Casa', translation: 'House', example: 'Mi casa es tu casa.' },
      ],
    },
    french: {
      label: 'French', flag: '🇫🇷',
      cards: [
        { word: 'Bonjour', translation: 'Hello', example: 'Bonjour, comment allez-vous?' },
        { word: 'Merci', translation: 'Thank you', example: 'Merci beaucoup!' },
        { word: 'S\'il vous plaît', translation: 'Please', example: 'Un café, s\'il vous plaît.' },
        { word: 'Au revoir', translation: 'Goodbye', example: 'Au revoir, à demain!' },
        { word: 'Oui', translation: 'Yes', example: 'Oui, je suis prêt.' },
        { word: 'Maison', translation: 'House', example: 'C\'est une belle maison.' },
        { word: 'Ami', translation: 'Friend', example: 'Il est mon ami.' },
        { word: 'Eau', translation: 'Water', example: 'Je voudrais de l\'eau.' },
      ],
    },
    japanese: {
      label: 'Japanese', flag: '🇯🇵',
      cards: [
        { word: 'こんにちは', translation: 'Hello', example: 'こんにちは、お元気ですか？' },
        { word: 'ありがとう', translation: 'Thank you', example: 'ありがとうございます。' },
        { word: 'おはよう', translation: 'Good morning', example: 'おはようございます。' },
        { word: 'さようなら', translation: 'Goodbye', example: 'さようなら、また明日。' },
        { word: 'はい', translation: 'Yes', example: 'はい、わかりました。' },
        { word: '水', translation: 'Water', example: '水をください。' },
        { word: '友達', translation: 'Friend', example: '彼は私の友達です。' },
        { word: '食べる', translation: 'To eat', example: '寿司を食べる。' },
      ],
    },
    hindi: {
      label: 'Hindi', flag: '🇮🇳',
      cards: [
        { word: 'नमस्ते', translation: 'Hello', example: 'नमस्ते, आप कैसे हैं?' },
        { word: 'धन्यवाद', translation: 'Thank you', example: 'बहुत धन्यवाद।' },
        { word: 'कृपया', translation: 'Please', example: 'कृपया मदद करें।' },
        { word: 'अलविदा', translation: 'Goodbye', example: 'अलविदा, कल मिलते हैं।' },
        { word: 'हाँ', translation: 'Yes', example: 'हाँ, मैं तैयार हूँ।' },
        { word: 'पानी', translation: 'Water', example: 'मुझे पानी चाहिए।' },
        { word: 'दोस्त', translation: 'Friend', example: 'वह मेरा अच्छा दोस्त है।' },
        { word: 'खाना', translation: 'Food', example: 'खाना बहुत स्वादिष्ट है।' },
      ],
    },
    german: {
      label: 'German', flag: '🇩🇪',
      cards: [
        { word: 'Hallo', translation: 'Hello', example: 'Hallo, wie geht es Ihnen?' },
        { word: 'Danke', translation: 'Thank you', example: 'Vielen Danke für Ihre Hilfe.' },
        { word: 'Bitte', translation: 'Please', example: 'Können Sie mir helfen, bitte?' },
        { word: 'Auf Wiedersehen', translation: 'Goodbye', example: 'Auf Wiedersehen, bis morgen!' },
        { word: 'Ja', translation: 'Yes', example: 'Ja, ich bin bereit.' },
        { word: 'Wasser', translation: 'Water', example: 'Ich möchte Wasser, bitte.' },
        { word: 'Freund', translation: 'Friend', example: 'Er ist mein bester Freund.' },
        { word: 'Haus', translation: 'House', example: 'Das ist ein schönes Haus.' },
      ],
    },
  };

  get flashcards(): Flashcard[] {
    return this.languageData[this.selectedLanguage()]?.cards || [];
  }

  get currentCard(): Flashcard {
    return this.flashcards[this.currentIndex()];
  }

  get progress(): number {
    if (!this.flashcards.length) return 0;
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

  markMastered() {
    this.masteredCount.update(c => c + 1);
    this.nextCard();
  }

  onLanguageChange(event: Event) {
    const select = event.target as HTMLSelectElement;
    this.selectedLanguage.set(select.value);
    this.currentIndex.set(0);
    this.isFlipped.set(false);
    this.masteredCount.set(0);
  }
}
