import { Injectable } from '@angular/core';

import {
  CanActivate
} from '@angular/router';

import { VaultService }
from '../services/vault.service';

@Injectable({
  providedIn: 'root'
})

export class VaultGuard
implements CanActivate {

  constructor(

    private vaultService:
      VaultService
  ) {}

  async canActivate() {

    const key =
      await this.vaultService
        .getVaultKey();

    return !!key;
  }
}