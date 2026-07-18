import { Component } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ToastController } from '@ionic/angular';

import { VaultService } from '../../services/vault.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './change-password.page.html',
  styleUrls: ['./change-password.page.scss']
})
export class ChangePasswordPage {

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';

  showCurrent = false;
  showNew = false;
  showConfirm = false;

  isSubmitting = false;
  progressDone = 0;
  progressTotal = 0;

  errorMessage = '';

  constructor(
    private vaultService: VaultService,
    private toastCtrl: ToastController,
    private location: Location
  ) {}

  goBack() {
    this.location.back();
  }

  get newPasswordTooShort(): boolean {
    return this.newPassword.length > 0 && this.newPassword.length < 6;
  }

  get passwordsMismatch(): boolean {
    return this.confirmPassword.length > 0 && this.newPassword !== this.confirmPassword;
  }

  get canSubmit(): boolean {
    return (
      this.currentPassword.length > 0 &&
      this.newPassword.length >= 6 &&
      this.newPassword === this.confirmPassword &&
      !this.isSubmitting
    );
  }

  get progressPercent(): number {
    if (this.progressTotal === 0) {
      return 0;
    }
    return Math.round((this.progressDone / this.progressTotal) * 100);
  }

  async submit() {

    if (!this.canSubmit) {
      return;
    }

    this.errorMessage = '';
    this.isSubmitting = true;
    this.progressDone = 0;
    this.progressTotal = 0;

    try {

      const result = await this.vaultService.changeVaultPassword(
        this.currentPassword,
        this.newPassword,
        (done, total) => {
          this.progressDone = done;
          this.progressTotal = total;
        }
      );

      if (!result.success) {
        this.errorMessage = result.error || 'Could not change your vault password';
        return;
      }

      await this.showToast(
        result.reencryptedCount > 0
          ? `Password changed — ${result.reencryptedCount} cached file${result.reencryptedCount === 1 ? '' : 's'} re-encrypted`
          : 'Vault password changed'
      );

      this.goBack();

    } catch (e) {

      console.error('❌ Change vault password failed', e);
      this.errorMessage = 'Something went wrong — please try again';

    } finally {
      this.isSubmitting = false;
    }
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2200,
      position: 'bottom',
      cssClass: 'vault-toast'
    });
    await toast.present();
  }
}
