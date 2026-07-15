import {
  Injectable
} from '@angular/core';

import {
  BehaviorSubject
} from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class NetworkService {

  // =====================================
  // NETWORK STATE
  // =====================================

  private onlineSubject =
    new BehaviorSubject<boolean>(
      navigator.onLine
    );

  // observable

  online$ =
    this.onlineSubject
      .asObservable();

  constructor() {

    console.log(
      '🌐 Network service started'
    );

    // =====================================
    // ONLINE
    // =====================================

    window.addEventListener(
      'online',
      () => {

        console.log(
          '🌐 INTERNET CONNECTED'
        );

        this.onlineSubject
          .next(true);
      }
    );

    // =====================================
    // OFFLINE
    // =====================================

    window.addEventListener(
      'offline',
      () => {

        console.log(
          '📴 INTERNET DISCONNECTED'
        );

        this.onlineSubject
          .next(false);
      }
    );
  }

  // =====================================
  // CURRENT STATUS
  // =====================================

  isOnline(): boolean {

    return this.onlineSubject
      .value;
  }

  isOffline(): boolean {

    return !this.onlineSubject
      .value;
  }
}