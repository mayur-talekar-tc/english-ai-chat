import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AUTH_API_URL } from '../shared/api';

export interface User {
  id?: number;
  name: string;
  email: string;
}

const USER_KEY = 'bhashaai_user';
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);

  currentUser = signal<User | null>(null);
  isLoggedIn = signal(false);
  error = signal('');

  constructor() {
    this.loadUser();
  }

  register(name: string, email: string, password: string) {
    this.error.set('');
    this.http.post<{ success: boolean; user?: User; error?: string; isNewUser?: boolean }>(`${AUTH_API_URL}/register`, { name, email, password })
      .subscribe({
        next: (res) => {
          if (res.success && res.user) {
            this.setUser(res.user);
            if (res.isNewUser) {
              this.router.navigate(['/onboarding']);
            } else {
              this.router.navigate(['/']);
            }
          } else {
            this.error.set(res.error || 'Registration failed');
          }
        },
        error: () => this.error.set('Server not available. Please try again.'),
      });
  }

  login(email: string, password: string) {
    this.error.set('');
    this.http.post<{ success: boolean; user?: User; error?: string }>(`${AUTH_API_URL}/login`, { email, password })
      .subscribe({
        next: (res) => {
          if (res.success && res.user) {
            this.setUser(res.user);
            this.router.navigate(['/']);
          } else {
            this.error.set(res.error || 'Login failed');
          }
        },
        error: () => this.error.set('Server not available. Please try again.'),
      });
  }

  logout() {
    localStorage.removeItem(USER_KEY);
    this.currentUser.set(null);
    this.isLoggedIn.set(false);
    this.router.navigate(['/login']);
  }

  private setUser(user: User) {
    this.currentUser.set(user);
    this.isLoggedIn.set(true);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  private loadUser() {
    const saved = localStorage.getItem(USER_KEY);
    if (saved) {
      try {
        const user = JSON.parse(saved) as User;
        this.currentUser.set(user);
        this.isLoggedIn.set(true);
      } catch {}
    }
  }
}
