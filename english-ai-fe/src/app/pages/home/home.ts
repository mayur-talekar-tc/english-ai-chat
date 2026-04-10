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
      title: 'AI English Tutor',
      description: 'Chat in your language and learn English words, sentences, and grammar with AI that adapts to your level.',
      link: '/chat',
      color: 'green',
    },
    {
      icon: '📚',
      title: 'Daily English Words',
      description: 'Learn 30 new English words every day with meaning in your language, flashcards, and examples.',
      link: '/learn',
      color: 'blue',
    },
    {
      icon: '🎯',
      title: 'English Quiz',
      description: 'Test your English with quizzes in your language — translate words, sentences, and fill-in-the-blanks.',
      link: '/quiz',
      color: 'purple',
    },
    {
      icon: '🎙️',
      title: 'Voice Practice',
      description: 'Improve English pronunciation with speech recognition and instant feedback on your accent.',
      link: '/voice',
      color: 'orange',
    },
  ];

  steps = [
    { num: '1', title: 'Pick Your Language', desc: 'Select your native language from 22+ options', icon: '🌍' },
    { num: '2', title: 'Learn English Daily', desc: 'New English words with meaning in your language', icon: '📖' },
    { num: '3', title: 'Chat & Practice', desc: 'Ask AI tutor English meanings in your language', icon: '🗣️' },
    { num: '4', title: 'Track Progress', desc: 'See your streak, XP, and improvement over time', icon: '📈' },
  ];
}
