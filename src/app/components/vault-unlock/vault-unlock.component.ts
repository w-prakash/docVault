import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonicModule, ModalController } from '@ionic/angular';

@Component({
  selector: 'app-vault-unlock',
  templateUrl: './vault-unlock.component.html',
  imports: [IonicModule, CommonModule, FormsModule],
})
export class VaultUnlockComponent {

  password = '';
  error = '';

  constructor(private modalCtrl: ModalController) {}

  unlock() {
    if (!this.password) {
      this.error = 'Password required';
      return;
    }

    this.modalCtrl.dismiss(this.password);
  }

  cancel() {
    this.modalCtrl.dismiss(null);
  }
}