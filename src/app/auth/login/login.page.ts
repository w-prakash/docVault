import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { SupabaseService  } from '../../services/supabase.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [IonicModule, FormsModule],
  templateUrl: './login.page.html',
  styleUrls:['./login.page.scss']
})
export class LoginPage {
  email = 'familydoc@gmail.com';
  password = 'familydoc@2026';

  constructor(private router: Router,  private supabaseService: SupabaseService,
) {}

async login() {
  if (!this.email || !this.password) {
    alert('Enter email & password');
    return;
  }

  const { data, error } = await this.supabaseService.login(
    this.email,
    this.password
  );

  if (error) {
    alert(error.message);
    return;
  }

  console.log('Login success', data);
  // 🔥 ensure vault exists
  await this.supabaseService.ensureVault();
  this.router.navigateByUrl('/dashboard');
}


}