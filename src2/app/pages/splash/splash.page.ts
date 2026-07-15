import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { GoogleAuthService } from 'src/app/core/google/auth/google-auth.service';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  imports: [IonicModule, CommonModule],
  styleUrls: ['./splash.page.scss']
})
export class SplashPage implements OnInit {

  constructor(
    private router: Router,
    private googleAuthService: GoogleAuthService
  ) {}

  async ngOnInit() {

    // small splash delay
    await new Promise(resolve => setTimeout(resolve, 1800));

    // 🔐 restore Google session
    const loggedIn = await this.googleAuthService.restoreSession();

    if (loggedIn) {
      this.router.navigateByUrl('/dashboard', { replaceUrl: true });
      return;
    }

    this.router.navigateByUrl('/login', { replaceUrl: true });

  }
}