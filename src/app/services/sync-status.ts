import { Injectable } from '@angular/core';

import {
  BehaviorSubject
} from 'rxjs';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class SyncStatusService {

  // =====================================
  // ONLINE STATUS
  // =====================================

  private onlineSubject =
    new BehaviorSubject<boolean>(
      navigator.onLine
    );

  isOnline$ =
    this.onlineSubject
      .asObservable();

  // =====================================
  // SYNCING STATUS
  // =====================================

  private syncingSubject =
    new BehaviorSubject<boolean>(
      false
    );

  isSyncing$ =
    this.syncingSubject
      .asObservable();

  // =====================================
  // SYNC MESSAGE
  // =====================================

  private messageSubject =
    new BehaviorSubject<string>(
      ''
    );

  syncMessage$ =
    this.messageSubject
      .asObservable();

  // =====================================
  // LAST SYNC
  // =====================================

  private lastSyncSubject =
    new BehaviorSubject<string>(
      ''
    );

  lastSync$ =
    this.lastSyncSubject
      .asObservable();

  constructor(private notificationService: NotificationService) {

    // 🌐 online
    window.addEventListener(
      'online',
      () => {

        console.log(
          '🌐 ONLINE'
        );

        this.onlineSubject
          .next(true);

        this.notificationService.networkOnline();
      }
    );

    // 📴 offline
    window.addEventListener(
      'offline',
      () => {

        console.log(
          '📴 OFFLINE'
        );

        this.onlineSubject
          .next(false);

        this.notificationService.networkOffline();
      }
    );
  }

  // =====================================
  // SET SYNCING
  // =====================================

  setSyncing(
    value: boolean,
    message = ''
  ) {

    this.syncingSubject
      .next(value);

    this.messageSubject
      .next(message);
  }

  // =====================================
  // SET LAST SYNC
  // =====================================

  setLastSyncNow() {

    const now =
      new Date()
        .toLocaleTimeString();

    this.lastSyncSubject
      .next(now);
  }
}