// app.component.ts

import { Component } from '@angular/core';

import { VaultService }
from './services/vault.service';

import { AuthService }
from './services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})

export class AppComponent {

  showVaultLock = false;

  constructor(

    public vaultService:
      VaultService,

    private authService:
      AuthService
  ) {}

  ngOnInit() {

    this.vaultService.onLockChange(
      (locked) => {

        if (locked) {

          this.showVaultLock = true;

          setTimeout(() => {

            this.showVaultLock = false;

          }, 1600);
        }
      }
    );
  }

  // =====================================
  // LOGOUT
  // =====================================

  async logout() {

    await this.authService
      .logout();
  }
}