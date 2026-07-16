import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { NotificationService } from 'src/app/services/notification.service';
import { AppNotification, NotificationCategory } from 'src/app/models/notification.model';
import { RelativeTimePipe } from './relative-time.pipe';

type CategoryFilter = 'all' | NotificationCategory;

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [CommonModule, IonicModule, RelativeTimePipe],
  templateUrl: './notification-center.component.html',
  styleUrls: ['./notification-center.component.scss']
})
export class NotificationCenterComponent implements OnInit, OnDestroy {

  allNotifications: AppNotification[] = [];
  filtered: AppNotification[] = [];
  activeFilter: CategoryFilter = 'all';

  readonly filters: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'sync', label: 'Sync' },
    { key: 'security', label: 'Security' },
    { key: 'activity', label: 'Activity' },
    { key: 'storage', label: 'Storage' },
    { key: 'network', label: 'Network' }
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private readonly notificationService: NotificationService,
    private readonly modalCtrl: ModalController,
    private readonly router: Router
  ) {}

  async ngOnInit() {

    await this.notificationService.ensureLoaded();

    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(list => {
        this.allNotifications = list;
        this.applyFilter();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // =====================================
  // FILTERING
  // =====================================

  setFilter(filter: CategoryFilter) {
    this.activeFilter = filter;
    this.applyFilter();
  }

  private applyFilter() {
    this.filtered = this.activeFilter === 'all'
      ? this.allNotifications
      : this.allNotifications.filter(n => n.category === this.activeFilter);
  }

  // =====================================
  // ACTIONS
  // =====================================

  async markAllAsRead() {
    await this.notificationService.markAllAsRead();
  }

  async clearAll() {
    await this.notificationService.clearAll();
  }

  async deleteOne(notification: AppNotification, slidingItem?: any) {
    if (slidingItem) {
      await slidingItem.close();
    }
    if (notification.id != null) {
      await this.notificationService.deleteNotification(notification.id);
    }
  }

  async onNotificationTap(notification: AppNotification) {

    if (notification.id != null && !notification.read) {
      await this.notificationService.markAsRead(notification.id);
    }

    if (notification.action?.route) {
      await this.dismiss();
      this.router.navigateByUrl(notification.action.route);
    }
  }

  async doRefresh(event: any) {
    await this.notificationService.ensureLoaded();
    event.target.complete();
  }

  dismiss() {
    return this.modalCtrl.dismiss();
  }

  trackById(_index: number, item: AppNotification) {
    return item.id;
  }
}
