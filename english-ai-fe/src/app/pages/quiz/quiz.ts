import { Component, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';

interface Question {
  question: string;
  options: string[];
  correctIndex: number;
}

@Component({
  selector: 'app-quiz',
  imports: [DecimalPipe],
  templateUrl: './quiz.html',
  styleUrl: './quiz.css',
})
export class Quiz {
  currentIndex = signal(0);
  score = signal(0);
  selectedOption = signal<number | null>(null);
  answered = signal(false);
  quizComplete = signal(false);

  questions: Question[] = [
    {
      question: 'What is the correct past tense of "go"?',
      options: ['goed', 'went', 'gone', 'going'],
      correctIndex: 1,
    },
    {
      question: 'Choose the correct sentence:',
      options: [
        'She don\'t like coffee.',
        'She doesn\'t likes coffee.',
        'She doesn\'t like coffee.',
        'She not like coffee.',
      ],
      correctIndex: 2,
    },
    {
      question: 'What does "ubiquitous" mean?',
      options: ['Rare', 'Found everywhere', 'Dangerous', 'Beautiful'],
      correctIndex: 1,
    },
    {
      question: 'Which word is a synonym for "happy"?',
      options: ['Melancholy', 'Elated', 'Furious', 'Anxious'],
      correctIndex: 1,
    },
    {
      question: 'Fill in the blank: "I have been _____ here for two hours."',
      options: ['wait', 'waited', 'waiting', 'waits'],
      correctIndex: 2,
    },
  ];

  get currentQuestion(): Question {
    return this.questions[this.currentIndex()];
  }

  get progress(): number {
    return ((this.currentIndex() + 1) / this.questions.length) * 100;
  }

  get scorePercentage(): number {
    return Math.round((this.score() / this.questions.length) * 100);
  }

  selectOption(index: number) {
    if (this.answered()) return;
    this.selectedOption.set(index);
    this.answered.set(true);
    if (index === this.currentQuestion.correctIndex) {
      this.score.update(s => s + 1);
    }
  }

  nextQuestion() {
    if (this.currentIndex() < this.questions.length - 1) {
      this.currentIndex.update(i => i + 1);
      this.selectedOption.set(null);
      this.answered.set(false);
    } else {
      this.quizComplete.set(true);
    }
  }

  restartQuiz() {
    this.currentIndex.set(0);
    this.score.set(0);
    this.selectedOption.set(null);
    this.answered.set(false);
    this.quizComplete.set(false);
  }

  getOptionClass(index: number): string {
    if (!this.answered()) {
      return 'bg-white border-gray-200 hover:border-green-300 hover:bg-green-50 text-gray-700';
    }
    if (index === this.currentQuestion.correctIndex) {
      return 'bg-green-50 border-green-500 text-green-700';
    }
    if (index === this.selectedOption() && index !== this.currentQuestion.correctIndex) {
      return 'bg-red-50 border-red-400 text-red-700';
    }
    return 'bg-gray-50 border-gray-200 text-gray-400';
  }
}
