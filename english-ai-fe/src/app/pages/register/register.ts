import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth';
import { ToastService } from '../../services/toast';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.css',
})
export class Register {
  auth = inject(AuthService);
  private toast = inject(ToastService);
  name = signal('');
  email = signal('');
  password = signal('');
  confirmPassword = signal('');
  showPassword = signal(false);

  onSubmit() {
    const n = this.name().trim();
    const e = this.email().trim();
    const p = this.password().trim();
    const cp = this.confirmPassword().trim();

    if (!n || !e || !p) {
      this.toast.error('Please fill all fields');
      return;
    }
    if (p.length < 6) {
      this.toast.error('Password must be at least 6 characters');
      return;
    }
    if (p !== cp) {
      this.toast.error('Passwords do not match');
      return;
    }
    this.auth.register(n, e, p);
  }
}
