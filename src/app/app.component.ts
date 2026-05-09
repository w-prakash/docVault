import { Component } from '@angular/core';
import { VaultService } from './services/vault.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  styleUrls: ['app.component.scss'],
  standalone: false,
})
export class AppComponent {
  showVaultLock = false;
  constructor(  private vaultService: VaultService
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
}
