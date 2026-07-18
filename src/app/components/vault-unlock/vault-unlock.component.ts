import { CommonModule } from '@angular/common';
import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  ModalController
} from '@ionic/angular';


@Component({
  selector: 'app-vault-unlock',
  templateUrl: './vault-unlock.component.html',
  styleUrl: './vault-unlock.component.scss',
  standalone: true,
  imports: [
    IonicModule,
    CommonModule,
    FormsModule
  ],
})
export class VaultUnlockComponent {

  showPassword = false;
isUnlocking = false;
  password = '';

  error = '';
@Input() mode: 'unlock' | 'create' = 'unlock';

  /** Passed in by VaultService for 'unlock' mode — checks the password against
   * the stored vault meta and resolves the derived key, or null if it's wrong.
   * Kept as a plain function prop (not an injected VaultService) so this
   * component doesn't import the service that creates it. */
  @Input() validate?: (password: string) => Promise<string | null>;

  constructor(
    private modalCtrl: ModalController,
  ) {}

async unlock() {

  this.error = '';

  // ❌ empty password

  if (!this.password?.trim()) {

    this.error =
      'Please enter password';

    return;
  }

  // 🔄 UI loading

  this.isUnlocking = true;

  try {

    // ✅ VALIDATE BEFORE CLOSING — wrong password must never
    // silently close the modal, it needs to stay open with an error
    // so the person can try again.

    if (this.mode === 'unlock' && this.validate) {

      const key = await this.validate(this.password);

      if (!key) {
        this.error = 'Incorrect password. Please try again.';
        return;
      }
    }

    this.modalCtrl.dismiss(
      this.password
    );

  } catch {

    this.error =
      'Something went wrong. Please try again.';

  } finally {

    this.isUnlocking = false;

  }
}

  cancel() {
    this.modalCtrl.dismiss(null);
  }

  get title(): string {
  return this.mode === 'create' ? 'Create Vault Password' : 'Unlock Vault';
}

get subtitle(): string {
  return this.mode === 'create'
    ? 'Set a password to protect your encrypted files on this device.'
    : 'Enter your vault password to access encrypted files.';
}
}