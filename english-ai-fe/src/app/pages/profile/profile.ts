import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PROGRESS_API_URL } from '../../shared/api';
import { AuthService } from '../../services/auth';
import { ProgressService } from '../../services/progress';

interface WeeklyReport {
  name: string;
  wordsLearnedWeek: number;
  quizAccuracy: number;
  spellingScore: number;
  streak: number;
  grade: string;
  totalXp: number;
  level: { name: string; badge: string; min: number; max: number };
}

@Component({
  selector: 'app-profile',
  imports: [],
  templateUrl: './profile.html',
  styleUrl: './profile.css',
})
export class Profile implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);
  progress = inject(ProgressService);

  report = signal<WeeklyReport | null>(null);
  isLoading = signal(true);

  ngOnInit() {
    this.loadReport();
  }

  loadReport() {
    const user = this.auth.currentUser();
    if (!user || !(user as any).id) {
      this.isLoading.set(false);
      return;
    }

    this.http.get<{ success: boolean; report: WeeklyReport }>(
      `${PROGRESS_API_URL}/report/${(user as any).id}`
    ).subscribe({
      next: (res) => {
        if (res.success) {
          this.report.set(res.report);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      },
    });
  }

  getGradeColor(grade: string): string {
    if (grade === 'A+') return 'text-green-600 bg-green-50 border-green-200';
    if (grade === 'A') return 'text-blue-600 bg-blue-50 border-blue-200';
    if (grade === 'B') return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-orange-600 bg-orange-50 border-orange-200';
  }

  shareOnWhatsApp() {
    const r = this.report();
    if (!r) return;
    const text = `I got Grade ${r.grade} on BhashaAI this week! I learned ${r.wordsLearnedWeek} words! 🎉 #BhashaAI`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }

  shareProgress() {
    const user = this.auth.currentUser();
    const r = this.report();
    if (!user || !r) return;
    const text = `My child ${user.name} is learning on BhashaAI!\nThis week: ${r.wordsLearnedWeek} words learned, ${r.streak} day streak, Level: ${r.level.badge} ${r.level.name} 🎉\nJoin BhashaAI: https://bhasha-ai-7a088.web.app`;
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  }
}
