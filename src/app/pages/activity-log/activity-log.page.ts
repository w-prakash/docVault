import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { IonicModule, AlertController } from '@ionic/angular';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { NotificationService } from '../../services/notification.service';
import { AppNotification, NotificationCategory } from '../../models/notification.model';
import { RelativeTimePipe } from '../../components/notifications/relative-time.pipe';

type CategoryFilter = 'all' | NotificationCategory;

interface ActivityGroup {
  label: string;
  items: AppNotification[];
}

@Component({
  selector: 'app-activity-log',
  standalone: true,
  imports: [IonicModule, CommonModule, RelativeTimePipe],
  templateUrl: './activity-log.page.html',
  styleUrls: ['./activity-log.page.scss']
})
export class ActivityLogPage implements OnInit, OnDestroy {

  allActivity: AppNotification[] = [];
  groups: ActivityGroup[] = [];
  activeFilter: CategoryFilter = 'all';

  readonly filters: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'activity', label: 'Activity' },
    { key: 'security', label: 'Security' },
    { key: 'sync', label: 'Sync' },
    { key: 'storage', label: 'Storage' },
    { key: 'network', label: 'Network' }
  ];

  private destroy$ = new Subject<void>();

  constructor(
    private notificationService: NotificationService,
    private alertCtrl: AlertController,
    private location: Location
  ) {}

  async ngOnInit() {
    await this.notificationService.ensureLoaded();

    this.notificationService.notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(list => {
        this.allActivity = list;
        this.applyFilter();
      });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack() {
    this.location.back();
  }

  setFilter(filter: CategoryFilter) {
    this.activeFilter = filter;
    this.applyFilter();
  }

  private applyFilter() {
    const list = this.activeFilter === 'all'
      ? this.allActivity
      : this.allActivity.filter(n => n.category === this.activeFilter);

    this.groups = this.groupByDate(list);
  }

  private groupByDate(list: AppNotification[]): ActivityGroup[] {

    const todayKey = new Date().toDateString();
    const yesterdayKey = new Date(Date.now() - 86400000).toDateString();

    const buckets = new Map<string, AppNotification[]>();

    for (const item of list) {
      const dayKey = new Date(item.timestamp).toDateString();

      const label = dayKey === todayKey
        ? 'Today'
        : dayKey === yesterdayKey
          ? 'Yesterday'
          : new Date(item.timestamp).toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });

      if (!buckets.has(label)) {
        buckets.set(label, []);
      }
      buckets.get(label)!.push(item);
    }

    return Array.from(buckets.entries()).map(([label, items]) => ({ label, items }));
  }

  async clearAll() {

    if (this.allActivity.length === 0) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Clear activity log?',
      message: 'This removes all recorded activity on this device. This cannot be undone.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Clear',
          role: 'destructive',
          handler: () => this.notificationService.clearAll()
        }
      ]
    });

    await alert.present();
  }

  trackById(_index: number, item: AppNotification) {
    return item.id;
  }
}
