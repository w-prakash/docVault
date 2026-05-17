import { Injectable } from '@angular/core';

import {
  CanActivate,
  Router
} from '@angular/router';

import { AuthService }
from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})

export class AuthGuard
implements CanActivate {

  constructor(

    private authService:
      AuthService,

    private router:
      Router
  ) {}

  async canActivate() {

    const loggedIn =
      await this.authService
        .isLoggedIn();

    // ✅ logged in

    if (loggedIn) {

      return true;
    }

    // ❌ not logged in

    this.router.navigateByUrl(
      '/login',
      {
        replaceUrl: true
      }
    );

    return false;
  }
}