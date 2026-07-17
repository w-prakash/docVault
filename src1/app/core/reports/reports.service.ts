import { Injectable } from '@angular/core';
import { OfflineVaultService } from '../../services/offline-vault.service';
import { GoogleDriveService } from '../google/drive/google-drive.service';
import { AnalyticsService } from './analytics.service';
import { OverviewStats, ReportsSnapshot } from './reports.models';

@Injectable({
  providedIn: 'root'
})
export class ReportsService {

  constructor(
    private readonly offlineVault: OfflineVaultService,
    private readonly driveService: GoogleDriveService,
    private readonly analytics: AnalyticsService
  ) {}

  async getSnapshot(): Promise<ReportsSnapshot> {

    const [documents, members, categories, types] = await Promise.all([
      this.offlineVault.getDocuments(),
      this.offlineVault.getMembers(),
      this.offlineVault.getCategories(),
      this.offlineVault.getTypes()
    ]);

    const categoryStats = this.analytics.groupByCategory(documents, categories);
    const memberStats = this.analytics.groupByMember(documents, members);
    const typeStats = this.analytics.groupByDocumentType(documents);

    const { most: mostUsedCategory, least: leastUsedCategory } =
      this.analytics.mostAndLeastUsedCategory(categoryStats);

    const { most: mostActiveMember, least: leastActiveMember } =
      this.analytics.mostAndLeastActiveMember(memberStats);

    const overview = await this.buildOverview(documents, categories, members, types);

    return {
      overview,
      categoryStats,
      memberStats,
      typeStats,
      mostUsedCategory,
      leastUsedCategory,
      mostActiveMember,
      leastActiveMember
    };
  }

  // =====================================
  // PRIVATE
  // =====================================

  private async buildOverview(
    documents: any[],
    categories: any[],
    members: any[],
    types: any[]
  ): Promise<OverviewStats> {

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const localUsage = await this.offlineVault.getLocalStorageUsage();

    const driveStorageUsedBytes = await this.getDriveStorageUsage();

    const documentsSynced = documents.filter(d => d.synced).length;
    const documentsPendingSync = documents.filter(d => d.sync_pending).length;
    const documentsFailedSync = documents.filter(d => d.sync_failed).length;

    const lastSyncTime = localStorage.getItem('last_sync_time');

    return {
      totalDocuments: documents.length,
      totalCategories: categories.length,
      totalMembers: members.length,
      totalTypes: types.length,
      driveStorageUsedBytes,
      localCacheBytes: localUsage.totalBytes,
      documentsSynced,
      documentsPendingSync,
      documentsFailedSync,
      uploadedToday: this.analytics.countUploadedSince(documents, startOfToday),
      uploadedThisMonth: this.analytics.countUploadedSince(documents, startOfMonth),
      lastSyncTime
    };
  }

  /** Returns null (not 0) when unavailable — offline, or the account API call failed — so the UI can show "unavailable" instead of a misleading zero. */
  private async getDriveStorageUsage(): Promise<number | null> {

    if (!navigator.onLine) {
      return null;
    }

    try {

      const about = await this.driveService.getAbout();
      const usage = about.storageQuota?.usage;

      return usage ? parseInt(usage, 10) : null;

    } catch (e) {

      console.warn('⚠️ Could not fetch Drive storage usage', e);
      return null;

    }
  }

}
