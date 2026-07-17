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

    // ✅ ONLY RETURN PASSWORD

    this.modalCtrl.dismiss(
      this.password
    );

  } catch {

    this.error =
      'Unlock failed';

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