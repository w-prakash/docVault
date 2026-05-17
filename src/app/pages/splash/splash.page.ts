import { CommonModule } from '@angular/common';
import {
  Component,
  OnInit
} from '@angular/core';
import { AuthService }
from 'src/app/services/auth.service';
import {
  Router
} from '@angular/router';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-splash',
  templateUrl: './splash.page.html',
  imports: [IonicModule, CommonModule],
  styleUrls: ['./splash.page.scss']
})
export class SplashPage
implements OnInit {

  constructor(
    private router: Router,
  private authService:
    AuthService
  ) {}

async ngOnInit() {

  // small splash delay

  await new Promise(
    resolve =>
      setTimeout(
        resolve,
        1800
      )
  );

  // 🔐 restore session

  const loggedIn =
    await this.authService
      .isLoggedIn();

  // ✅ session exists

  if (loggedIn) {

    this.router.navigateByUrl(
      '/dashboard',
      {
        replaceUrl: true
      }
    );

    return;
  }

  // ❌ no session

  this.router.navigateByUrl(
    '/login',
    {
      replaceUrl: true
    }
  );
}
}