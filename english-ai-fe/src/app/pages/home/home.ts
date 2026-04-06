import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { INDIAN_LANGUAGE_OPTIONS } from '../../shared/languages';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  indianLanguages = INDIAN_LANGUAGE_OPTIONS.map((language, index) => ({
    ...language,
    learners: `${180 + index * 9}K`,
  }));

  heroLanguages = [
    this.indianLanguages[0],
    this.indianLanguages[1],
    this.indianLanguages[2],
    this.indianLanguages[3],
    this.indianLanguages[4],
    this.indianLanguages[5],
  ];

  features = [
    {
      icon: '💬',
      title: 'AI Tutor Chat',
      description: 'Practice conversations with an AI that adapts to your level and corrects mistakes in real-time.',
      link: '/chat',
      color: 'green',
    },
    {
      icon: '📚',
      title: 'Daily Vocabulary',
      description: 'Learn 30 new words every day with flashcards, pronunciation, and spaced repetition.',
      link: '/learn',
      color: 'blue',
    },
    {
      icon: '🎯',
      title: 'Quiz Arena',
      description: 'Test your knowledge with AI-generated quizzes — words, sentences, and fill-in-the-blanks.',
      link: '/quiz',
      color: 'purple',
    },
    {
      icon: '🎙️',
      title: 'Voice Practice',
      description: 'Improve pronunciation with speech recognition and instant feedback on your accent.',
      link: '/voice',
      color: 'orange',
    },
  ];

  steps = [
    { num: '1', title: 'Pick a Language', desc: 'Choose from 27+ Indian and global languages', icon: '🌍' },
    { num: '2', title: 'Learn Daily', desc: 'New words, flashcards, and quizzes every day', icon: '📖' },
    { num: '3', title: 'Practice & Chat', desc: 'Talk to AI tutor in your chosen language', icon: '🗣️' },
    { num: '4', title: 'Track Progress', desc: 'See your streak, XP, and improvement over time', icon: '📈' },
  ];
}
