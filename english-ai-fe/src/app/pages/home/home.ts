import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth';
import { ProgressService } from '../../services/progress';

@Component({
  selector: 'app-home',
  imports: [RouterLink, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  auth = inject(AuthService);
  progress = inject(ProgressService);

  ctaEmail = '';

  // 9 dots for decorative grid
  dots = Array(9).fill(0);

  // Waveform bars (height percentages)
  waveformBars = [30, 60, 45, 80, 55, 90, 40, 70, 50, 85, 35, 65, 75, 45, 60, 80, 50, 35, 70, 55];

  // Vocab card mockup
  vocabCards = [
    { emoji: '🐱', word: 'Cat', native: 'मांजर', rotate: -3 },
    { emoji: '💧', word: 'Water', native: 'पाणी', rotate: 1 },
    { emoji: '🌳', word: 'Tree', native: 'झाड', rotate: -2 },
  ];
}
