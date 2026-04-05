import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PROGRESS_API_URL } from '../shared/api';
import { AuthService } from './auth';

export interface LevelInfo {
  min: number;
  max: number;
  level: number;
  name: string;
  badge: string;
}

const LEVELS: LevelInfo[] = [
  { min: 0, max: 100, level: 1, name: 'Beginner', badge: '🌱' },
  { min: 101, max: 300, level: 2, name: 'Bronze', badge: '🥉' },
  { min: 301, max: 600, level: 3, name: 'Silver', badge: '🥈' },
  { min: 601, max: 1000, level: 4, name: 'Gold', badge: '🥇' },
  { min: 1001, max: Infinity, level: 5, name: 'Champion', badge: '🏆' },
];

const XP_KEY = 'bhashaai_xp_data';

@Injectable({ providedIn: 'root' })
export class ProgressService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  totalXp = signal(0);
  weeklyXp = signal(0);
  currentLevel = signal<LevelInfo>(LEVELS[0]);
  wordsLearned = signal(0);
  loginStreak = signal(0);
  xpAnimation = signal<{ amount: number; id: number } | null>(null);
  levelUpAnimation = signal(false);
  dailyLoginReward = signal<{ reward: number; streak: number } | null>(null);

  private animId = 0;

  constructor() {
    this.loadLocal();
  }

  getLevelFromXP(xp: number): LevelInfo {
    for (const l of LEVELS) {
      if (xp >= l.min && xp <= l.max) return l;
    }
    return LEVELS[LEVELS.length - 1];
  }

  getProgressToNextLevel(): number {
    const level = this.currentLevel();
    const xp = this.totalXp();
    if (level.max === Infinity) return 100;
    const range = level.max - level.min;
    const progress = xp - level.min;
    return Math.min(Math.round((progress / range) * 100), 100);
  }

  getNextLevelXP(): number {
    const level = this.currentLevel();
    if (level.max === Infinity) return this.totalXp();
    return level.max + 1;
  }

  addXP(amount: number, type: string = 'general') {
    const user = this.auth.currentUser();
    if (!user) {
      // Offline mode - just update locally
      this.updateLocalXP(amount);
      return;
    }

    // Show animation immediately
    this.showXPAnimation(amount);

    const userId = (user as any).id;
    this.http.post<any>(`${PROGRESS_API_URL}/add-xp`, { userId, xp: amount, type })
      .subscribe({
        next: (res) => {
          if (res.success) {
            const oldLevel = this.currentLevel().level;
            this.totalXp.set(res.total_xp);
            this.weeklyXp.set(res.weekly_xp);
            this.wordsLearned.set(res.words_learned || this.wordsLearned());
            const newLevelInfo = this.getLevelFromXP(res.total_xp);
            this.currentLevel.set(newLevelInfo);
            this.saveLocal();

            if (newLevelInfo.level > oldLevel) {
              this.levelUpAnimation.set(true);
              setTimeout(() => this.levelUpAnimation.set(false), 3000);
            }
          }
        },
        error: () => {
          // Fallback to local
          this.updateLocalXP(amount);
        },
      });
  }

  private updateLocalXP(amount: number) {
    const newXp = this.totalXp() + amount;
    this.totalXp.set(newXp);
    this.weeklyXp.set(this.weeklyXp() + amount);
    const newLevel = this.getLevelFromXP(newXp);
    const oldLevel = this.currentLevel().level;
    this.currentLevel.set(newLevel);
    this.saveLocal();

    if (newLevel.level > oldLevel) {
      this.levelUpAnimation.set(true);
      setTimeout(() => this.levelUpAnimation.set(false), 3000);
    }
  }

  showXPAnimation(amount: number) {
    this.animId++;
    this.xpAnimation.set({ amount, id: this.animId });
    setTimeout(() => {
      if (this.xpAnimation()?.id === this.animId) {
        this.xpAnimation.set(null);
      }
    }, 1500);
  }

  checkDailyLogin() {
    const user = this.auth.currentUser();
    if (!user) return;

    // Check if we already showed popup today (localStorage check)
    const today = new Date().toISOString().split('T')[0];
    const shownKey = 'bhashaai_login_reward_shown';
    const lastShown = localStorage.getItem(shownKey);
    if (lastShown === today) return;

    const userId = (user as any).id;
    this.http.post<any>(`${PROGRESS_API_URL}/daily-login`, { userId })
      .subscribe({
        next: (res) => {
          if (res.success) {
            this.loginStreak.set(res.streak);
            if (res.total_xp) {
              this.totalXp.set(res.total_xp);
              this.currentLevel.set(this.getLevelFromXP(res.total_xp));
            }
            if (!res.alreadyClaimed && res.reward > 0) {
              this.dailyLoginReward.set({ reward: res.reward, streak: res.streak });
              this.showXPAnimation(res.reward);
            }
            // Mark as shown today so it doesn't repeat on refresh
            localStorage.setItem(shownKey, today);
            this.saveLocal();
          }
        },
      });
  }

  dismissDailyLogin() {
    this.dailyLoginReward.set(null);
  }

  loadUserProgress() {
    const user = this.auth.currentUser();
    if (!user) return;

    const userId = (user as any).id;
    this.http.get<any>(`${PROGRESS_API_URL}/user/${userId}`)
      .subscribe({
        next: (res) => {
          if (res.success && res.progress) {
            this.totalXp.set(res.progress.total_xp || 0);
            this.weeklyXp.set(res.progress.weekly_xp || 0);
            this.wordsLearned.set(res.progress.words_learned || 0);
            this.loginStreak.set(res.progress.login_streak || 0);
            this.currentLevel.set(this.getLevelFromXP(res.progress.total_xp || 0));
            this.saveLocal();
          }
        },
      });
  }

  private saveLocal() {
    localStorage.setItem(XP_KEY, JSON.stringify({
      totalXp: this.totalXp(),
      weeklyXp: this.weeklyXp(),
      wordsLearned: this.wordsLearned(),
      loginStreak: this.loginStreak(),
    }));
  }

  private loadLocal() {
    const saved = localStorage.getItem(XP_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        this.totalXp.set(data.totalXp || 0);
        this.weeklyXp.set(data.weeklyXp || 0);
        this.wordsLearned.set(data.wordsLearned || 0);
        this.loginStreak.set(data.loginStreak || 0);
        this.currentLevel.set(this.getLevelFromXP(data.totalXp || 0));
      } catch {}
    }
  }
}
