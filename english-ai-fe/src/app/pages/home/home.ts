import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GLOBAL_LANGUAGE_OPTIONS, INDIAN_LANGUAGE_OPTIONS } from '../../shared/languages';

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

  globalLanguages = GLOBAL_LANGUAGE_OPTIONS.map((language, index) => ({
    ...language,
    learners: `${340 + index * 70}K`,
  }));

  heroLanguages = [
    this.indianLanguages[0],
    this.indianLanguages[1],
    this.indianLanguages[2],
    this.indianLanguages[3],
    this.indianLanguages[4],
    this.globalLanguages[0],
  ];

  features = [
    {
      icon: '💬',
      title: 'AI Tutor Chat',
      description: 'Practice conversations with an AI that adapts to your level and corrects mistakes in real-time.',
    },
    {
      icon: '🎙️',
      title: 'Voice Practice',
      description: 'Improve pronunciation with speech recognition and instant feedback on your accent.',
    },
    {
      icon: '📖',
      title: 'Story Mode',
      description: 'Learn through interactive stories that teach vocabulary and grammar in context.',
    },
    {
      icon: '🌍',
      title: 'Real Conversations',
      description: 'Practice real-world scenarios like ordering food, booking hotels, and making friends.',
    },
  ];
}
