// import { Injectable } from '@angular/core';

// import {
//   CanActivate,
//   Router
// } from '@angular/router';

// import { AuthService }
// from '../services/auth.service';

// @Injectable({
//   providedIn: 'root'
// })

// export class AuthGuard
// implements CanActivate {

//   constructor(

//     private authService:
//       AuthService,

//     private router:
//       Router
//   ) {}

//   async canActivate() {

//     const loggedIn =
//       await this.authService
//         .isLoggedIn();

//     // ✅ logged in

//     if (loggedIn) {

//       return true;
//     }

//     // ❌ not logged in

//     this.router.navigateByUrl(
//       '/login',
//       {
//         replaceUrl: true
//       }
//     );

//     return false;
//   }
// }
// import { Injectable } from '@angular/core';
// import { CanActivate, Router } from '@angular/router';
// import { GoogleSessionService } from '../core/google/session/google-session.service';

// @Injectable({
//   providedIn: 'root'
// })
// export class AuthGuard implements CanActivate {

//   constructor(
//     private readonly router: Router,
//     private readonly googleSession: GoogleSessionService
//   ) {}

//   canActivate(): boolean {

//     if (this.googleSession.currentSession.isAuthenticated) {
//       return true;
//     }

//     this.router.navigateByUrl('/login', {
//       replaceUrl: true
//     });

//     return false;

//   }

// }
import { Injectable } from '@angular/core';
import { CanActivate, Router } from '@angular/router';
import { GoogleAuthService } from '../core/google/auth/google-auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {

  constructor(
    private readonly router: Router,
    private readonly googleAuthService: GoogleAuthService
  ) {}

  async canActivate(): Promise<boolean> {

    const isAuthenticated = await this.googleAuthService.restoreSession();

    if (isAuthenticated) {
      return true;
    }

    this.router.navigateByUrl('/login', {
      replaceUrl: true
    });

    return false;

  }

}