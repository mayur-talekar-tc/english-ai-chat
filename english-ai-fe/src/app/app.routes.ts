import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home').then(m => m.Home) },
  { path: 'learn', loadComponent: () => import('./pages/learn/learn').then(m => m.Learn) },
  { path: 'chat', loadComponent: () => import('./pages/chat/chat').then(m => m.Chat) },
  { path: 'quiz', loadComponent: () => import('./pages/quiz/quiz').then(m => m.Quiz) },
  { path: '**', redirectTo: '' },
];
