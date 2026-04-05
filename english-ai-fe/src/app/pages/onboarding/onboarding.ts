import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ProgressService } from '../../services/progress';
import { INDIAN_LANGUAGE_OPTIONS } from '../../shared/languages';

@Component({
  selector: 'app-onboarding',
  imports: [],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
})
export class Onboarding {
  private router = inject(Router);
  auth = inject(AuthService);
  progress = inject(ProgressService);

  readonly languages = INDIAN_LANGUAGE_OPTIONS;
  step = signal(1);
  selectedLanguage = signal('');
  selectedLevel = signal('');

  selectLanguage(code: string) {
    this.selectedLanguage.set(code);
  }

  selectLevel(level: string) {
    this.selectedLevel.set(level);
  }

  nextStep() {
    if (this.step() < 3) {
      this.step.update(s => s + 1);
    }
  }

  prevStep() {
    if (this.step() > 1) {
      this.step.update(s => s - 1);
    }
  }

  finish() {
    // Save preferences to localStorage
    if (this.selectedLanguage()) {
      localStorage.setItem('bhashaai_learn_language', this.selectedLanguage());
    }
    if (this.selectedLevel()) {
      localStorage.setItem('bhashaai_learn_level', this.selectedLevel());
    }

    // Give welcome XP
    this.progress.addXP(10, 'general');

    this.router.navigate(['/learn']);
  }
}
