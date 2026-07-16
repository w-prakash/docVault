import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { Capacitor } from '@capacitor/core';
import { GoogleAuthService } from 'src/app/core/google/auth/google-auth.service';
import { VaultService } from 'src/app/services/vault.service';
import { DocVaultFolderService } from 'src/app/core/google/drive/docvault-folder.service';
import { NotificationService } from 'src/app/services/notification.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule
  ],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss']
})
export class LoginPage {

  isLoading = false;
  error = '';

  constructor(
    private router: Router,
    private googleAuthService: GoogleAuthService,
    private vaultService: VaultService,
    private docVaultFolderService: DocVaultFolderService,
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    console.log('Platform:', Capacitor.getPlatform());
  }

  async loginWithGoogle() {

    this.error = '';
    this.isLoading = true;

    try {

      const user = await this.googleAuthService.signIn();

      console.log('✅ Google user signed in:', user.email);

      // 🔐 provision the local vault on first login (no-op if it already exists)
      await this.vaultService.ensureVault();
      await this.docVaultFolderService.ensureDocVaultFolder();

      await this.notificationService.authLoginSuccess(user.email);

      await this.router.navigateByUrl('/dashboard', { replaceUrl: true });

    } catch (e) {

      console.error('❌ Google sign-in failed:', e);
      this.error = this.googleAuthService.lastError ?? 'Google sign-in failed';

    } finally {

      this.isLoading = false;

    }
  }

}