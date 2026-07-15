import { Component } from '@angular/core';
import { VaultService } from './services/vault.service';
import { GoogleAuthService } from './core/google/auth/google-auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {

  showVaultLock = false;

  constructor(
    public vaultService: VaultService,
    private googleAuthService: GoogleAuthService
  ) {}

  ngOnInit() {

    this.vaultService.onLockChange((locked) => {

      if (locked) {

        this.showVaultLock = true;

        setTimeout(() => {
          this.showVaultLock = false;
        }, 1600);
      }
    });
  }

  async logout() {

    await this.googleAuthService.signOut();

    window.location.href = '/login';

  }
}