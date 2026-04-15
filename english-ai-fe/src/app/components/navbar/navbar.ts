import { Component, signal, inject, OnInit, HostListener } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ProgressService } from '../../services/progress';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar implements OnInit {
  auth = inject(AuthService);
  progress = inject(ProgressService);
  mobileMenuOpen = signal(false);
  showDropdown = signal(false);

  ngOnInit() {
    if (this.auth.isLoggedIn()) {
      this.progress.loadUserProgress();
      this.progress.checkDailyLogin();
    }
  }

  toggleMenu() {
    this.mobileMenuOpen.update(v => !v);
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.showDropdown.update(v => !v);
  }

  onLogout() {
    this.showDropdown.set(false);
    this.auth.logout();
  }

  @HostListener('document:click')
  closeDropdown() {
    this.showDropdown.set(false);
  }
}
