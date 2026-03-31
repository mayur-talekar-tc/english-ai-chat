import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  imports: [RouterLink],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  languages = [
    { flag: '🇺🇸', name: 'English', learners: '850K' },
    { flag: '🇪🇸', name: 'Spanish', learners: '620K' },
    { flag: '🇫🇷', name: 'French', learners: '480K' },
    { flag: '🇯🇵', name: 'Japanese', learners: '390K' },
    { flag: '🇮🇳', name: 'Hindi', learners: '310K' },
    { flag: '🇸🇦', name: 'Arabic', learners: '270K' },
    { flag: '🇩🇪', name: 'German', learners: '340K' },
    { flag: '🇰🇷', name: 'Korean', learners: '420K' },
    { flag: '🇨🇳', name: 'Mandarin', learners: '560K' },
    { flag: '🇮🇹', name: 'Italian', learners: '250K' },
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
