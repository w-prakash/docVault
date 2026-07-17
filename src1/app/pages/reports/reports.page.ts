import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ReportsService } from 'src/app/core/reports/reports.service';
import { ReportsSnapshot } from 'src/app/core/reports/reports.models';
import { NotificationService } from 'src/app/services/notification.service';
import { AppNotification } from 'src/app/models/notification.model';
import { PieChartComponent } from 'src/app/components/charts/pie-chart/pie-chart.component';
import { BarChartComponent } from 'src/app/components/charts/bar-chart/bar-chart.component';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [IonicModule, CommonModule, PieChartComponent, BarChartComponent],
  templateUrl: './reports.page.html',
  styleUrls: ['./reports.page.scss']
})
export class ReportsPage implements OnInit {

  isLoading = true;
  snapshot: ReportsSnapshot | null = null;
  recentActivity: AppNotification[] = [];

  // Precomputed for the chart components — Angular template expressions
  // can't use arrow functions, so these are built once per load() instead
  // of via inline .map() calls in the template.
  categoryLabels: string[] = [];
  categoryCounts: number[] = [];
  memberLabels: string[] = [];
  memberCounts: number[] = [];
  typeLabels: string[] = [];
  typeCounts: number[] = [];

  constructor(
    private readonly reportsService: ReportsService,
    private readonly notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.load();
  }

  async doRefresh(event: any) {
    await this.load();
    event.target.complete();
  }

  async load(): Promise<void> {

    this.isLoading = true;

    try {

      const [snapshot] = await Promise.all([
        this.reportsService.getSnapshot(),
        this.notificationService.ensureLoaded()
      ]);

      this.snapshot = snapshot;

      this.categoryLabels = snapshot.categoryStats.map(c => c.name);
      this.categoryCounts = snapshot.categoryStats.map(c => c.count);
      this.memberLabels = snapshot.memberStats.map(m => m.name);
      this.memberCounts = snapshot.memberStats.map(m => m.count);
      this.typeLabels = snapshot.typeStats.map(t => t.label);
      this.typeCounts = snapshot.typeStats.map(t => t.count);

      const all = await this.getSortedNotifications();
      this.recentActivity = all.slice(0, 12);

    } catch (e) {

      console.error('❌ Failed to load reports', e);

    } finally {

      this.isLoading = false;

    }
  }

  formatBytes(bytes: number | null): string {

    if (bytes === null || bytes === undefined) {
      return '—';
    }

    if (bytes === 0) {
      return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
  }

  formatRelativeTime(iso: string | null): string {

    if (!iso) {
      return 'Never';
    }

    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diffMs / 60000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;

    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  private async getSortedNotifications(): Promise<AppNotification[]> {

    return new Promise(resolve => {

      this.notificationService.notifications$
        .subscribe(list => {

          const sorted = [...list].sort(
            (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          resolve(sorted);

        })
        .unsubscribe();

    });
  }

}
