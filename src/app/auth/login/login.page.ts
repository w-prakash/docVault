import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { SupabaseService }
from '../../services/supabase.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    IonicModule,
    FormsModule,
    CommonModule
  ],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage {

  email = 'familydoc@gmail.com';

  password = 'familydoc@2026';

  showPassword = false;

  isLoading = false;

  error = '';

  constructor(
    private router: Router,
    private supabaseService: SupabaseService
  ) {}

  async login() {

    this.error = '';

    if (!this.email || !this.password) {

      this.error =
        'Enter email and password';

      return;
    }

    this.isLoading = true;

    try {

      const { data, error } =
        await this.supabaseService.login(
          this.email,
          this.password
        );

      if (error) {
if (error.code === 'invalid_credentials') {

  this.error =
    'Invalid email or password';

} else {

  this.error =
    error.message;
}

        this.isLoading = false;

        return;
      }

      // 🔐 ensure vault exists
      await this.supabaseService
        .ensureVault(this.password);

      this.router.navigateByUrl(
        '/dashboard'
      );

    } catch {

      this.error =
        'Login failed';

    } finally {

      this.isLoading = false;

    }
  }
}