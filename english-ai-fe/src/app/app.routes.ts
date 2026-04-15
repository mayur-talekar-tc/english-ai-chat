import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then(m => m.Home) },
  { path: 'login', loadComponent: () => import('./pages/login/login').then(m => m.Login) },
  { path: 'register', loadComponent: () => import('./pages/register/register').then(m => m.Register) },
  { path: 'learn', loadComponent: () => import('./pages/learn/learn').then(m => m.Learn), canActivate: [authGuard] },
  { path: 'chat', loadComponent: () => import('./pages/chat/chat').then(m => m.Chat), canActivate: [authGuard] },
  { path: 'quiz', loadComponent: () => import('./pages/quiz/quiz').then(m => m.Quiz), canActivate: [authGuard] },
  { path: 'voice', loadComponent: () => import('./pages/voice/voice').then(m => m.Voice), canActivate: [authGuard] },
  { path: 'leaderboard', loadComponent: () => import('./pages/leaderboard/leaderboard').then(m => m.Leaderboard), canActivate: [authGuard] },
  { path: 'profile', loadComponent: () => import('./pages/profile/profile').then(m => m.Profile), canActivate: [authGuard] },
  { path: 'onboarding', loadComponent: () => import('./pages/onboarding/onboarding').then(m => m.Onboarding), canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
