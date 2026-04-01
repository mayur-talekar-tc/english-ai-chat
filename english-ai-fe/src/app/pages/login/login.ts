import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  auth = inject(AuthService);
  email = signal('');
  password = signal('');
  showPassword = signal(false);

  onSubmit() {
    const e = this.email().trim();
    const p = this.password().trim();
    if (!e || !p) {
      this.auth.error.set('Please fill all fields');
      return;
    }
    this.auth.login(e, p);
  }
}
