import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-home',
  imports: [RouterLink, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  ctaEmail = '';

  // 9 dots for decorative grid
  dots = Array(9).fill(0);

  // Week streak calendar
  weekDays = [
    { label: 'Mon', done: true, today: false },
    { label: 'Tue', done: true, today: false },
    { label: 'Wed', done: true, today: false },
    { label: 'Thu', done: true, today: false },
    { label: 'Fri', done: false, today: true },
    { label: 'Sat', done: false, today: false },
    { label: 'Sun', done: false, today: false },
  ];

  // Waveform bars (height percentages)
  waveformBars = [30, 60, 45, 80, 55, 90, 40, 70, 50, 85, 35, 65, 75, 45, 60, 80, 50, 35, 70, 55];

  // Vocab card mockup
  vocabCards = [
    { emoji: '🐱', word: 'Cat', native: 'मांजर', rotate: -3 },
    { emoji: '💧', word: 'Water', native: 'पाणी', rotate: 1 },
    { emoji: '🌳', word: 'Tree', native: 'झाड', rotate: -2 },
  ];
}
