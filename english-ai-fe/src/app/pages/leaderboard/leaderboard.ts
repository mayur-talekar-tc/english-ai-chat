import { Component, inject, signal, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PROGRESS_API_URL } from '../../shared/api';
import { AuthService } from '../../services/auth';

interface Leader {
  rank: number;
  id: number;
  name: string;
  xp: number;
  totalXp: number;
  wordsLearned: number;
  level: { name: string; badge: string };
}

@Component({
  selector: 'app-leaderboard',
  imports: [],
  templateUrl: './leaderboard.html',
  styleUrl: './leaderboard.css',
})
export class Leaderboard implements OnInit {
  private http = inject(HttpClient);
  auth = inject(AuthService);

  leaders = signal<Leader[]>([]);
  isLoading = signal(true);

  ngOnInit() {
    this.loadLeaderboard();
  }

  loadLeaderboard() {
    this.isLoading.set(true);
    this.http.get<{ success: boolean; leaders: Leader[] }>(`${PROGRESS_API_URL}/leaderboard`)
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.leaders.set(res.leaders);
          }
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        },
      });
  }

  isCurrentUser(leader: Leader): boolean {
    const user = this.auth.currentUser();
    return !!user && (user as any).id === leader.id;
  }

  getRankEmoji(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  }
}
