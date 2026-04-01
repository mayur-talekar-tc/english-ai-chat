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
  selectedCategory = signal('grammar');
  currentIndex = signal(0);
  score = signal(0);
  selectedOption = signal<number | null>(null);
  answered = signal(false);
  quizComplete = signal(false);

  allQuestions: Record<string, Question[]> = {
    grammar: [
      { question: 'What is the correct past tense of "go"?', options: ['goed', 'went', 'gone', 'going'], correctIndex: 1 },
      { question: 'Choose the correct sentence:', options: ["She don't like coffee.", "She doesn't likes coffee.", "She doesn't like coffee.", "She not like coffee."], correctIndex: 2 },
      { question: 'Fill in the blank: "I have been _____ here for two hours."', options: ['wait', 'waited', 'waiting', 'waits'], correctIndex: 2 },
      { question: 'Which is correct?', options: ["Their going home.", "They're going home.", "There going home.", "Theyre going home."], correctIndex: 1 },
      { question: 'Choose the correct form: "He _____ to school every day."', options: ['go', 'goes', 'going', 'gone'], correctIndex: 1 },
      { question: '"If I _____ you, I would apologize."', options: ['was', 'am', 'were', 'be'], correctIndex: 2 },
      { question: 'Which sentence uses the present perfect correctly?', options: ["I have saw that movie.", "I have seen that movie.", "I have see that movie.", "I seen that movie."], correctIndex: 1 },
    ],
    vocabulary: [
      { question: 'What does "ubiquitous" mean?', options: ['Rare', 'Found everywhere', 'Dangerous', 'Beautiful'], correctIndex: 1 },
      { question: 'Which word is a synonym for "happy"?', options: ['Melancholy', 'Elated', 'Furious', 'Anxious'], correctIndex: 1 },
      { question: '"Benevolent" means:', options: ['Cruel', 'Lazy', 'Kind and generous', 'Angry'], correctIndex: 2 },
      { question: 'What is the opposite of "ancient"?', options: ['Old', 'Modern', 'Historic', 'Vintage'], correctIndex: 1 },
      { question: '"Ephemeral" means something that is:', options: ['Permanent', 'Short-lived', 'Heavy', 'Expensive'], correctIndex: 1 },
      { question: 'A "novice" is someone who is:', options: ['Expert', 'Beginner', 'Teacher', 'Leader'], correctIndex: 1 },
      { question: '"Diligent" means:', options: ['Lazy', 'Hardworking', 'Slow', 'Confused'], correctIndex: 1 },
    ],
    phrases: [
      { question: 'What does "break the ice" mean?', options: ['Literally break ice', 'Start a conversation', 'End a friendship', 'Cool down'], correctIndex: 1 },
      { question: '"Hit the nail on the head" means:', options: ['Use a hammer', 'Be exactly right', 'Cause pain', 'Build something'], correctIndex: 1 },
      { question: '"Piece of cake" means something is:', options: ['Delicious', 'Expensive', 'Very easy', 'Sweet'], correctIndex: 2 },
      { question: '"Under the weather" means:', options: ['Outside', 'Feeling sick', 'Rainy day', 'Cold weather'], correctIndex: 1 },
      { question: '"Cost an arm and a leg" means:', options: ['Painful', 'Cheap', 'Very expensive', 'Free'], correctIndex: 2 },
      { question: '"Let the cat out of the bag" means:', options: ['Free a cat', 'Reveal a secret', 'Pack a bag', 'Go shopping'], correctIndex: 1 },
      { question: '"Burn the midnight oil" means:', options: ['Cook late', 'Waste resources', 'Work late at night', 'Light a candle'], correctIndex: 2 },
    ],
  };

  get questions(): Question[] {
    return this.allQuestions[this.selectedCategory()] || [];
  }

  get currentQuestion(): Question {
    return this.questions[this.currentIndex()];
  }

  get progress(): number {
    if (!this.questions.length) return 0;
    return ((this.currentIndex() + 1) / this.questions.length) * 100;
  }

  get scorePercentage(): number {
    if (!this.questions.length) return 0;
    return Math.round((this.score() / this.questions.length) * 100);
  }

  onCategoryChange(category: string) {
    this.selectedCategory.set(category);
    this.restartQuiz();
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
