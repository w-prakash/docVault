import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonicModule,
  ModalController
} from '@ionic/angular';

import { VaultService }
from 'src/app/services/vault.service';

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

  constructor(
    private modalCtrl: ModalController,
    private vaultService: VaultService
  ) {}

async unlock() {

  this.error = '';

  if (!this.password?.trim()) {

    this.error =
      'Please enter password';

    return;
  }

  this.isUnlocking = true;

  try {

    const valid =
      await this.vaultService
        .validatePassword(this.password);

    // ❌ invalid
    if (!valid) {

      this.error =
        'Invalid vault password';

      this.isUnlocking = false;

      return;
    }

    // ✅ success
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
}