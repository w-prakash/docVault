export interface OverviewStats {
  totalDocuments: number;
  totalCategories: number;
  totalMembers: number;
  totalTypes: number;
  driveStorageUsedBytes: number | null; // null if offline / unavailable
  localCacheBytes: number;
  documentsSynced: number;
  documentsPendingSync: number;
  documentsFailedSync: number;
  uploadedToday: number;
  uploadedThisMonth: number;
  lastSyncTime: string | null; // ISO
}

export interface CategoryStat {
  id: string;
  name: string;
  count: number;
  percentage: number; // 0-100
}

export interface MemberStat {
  id: string;
  name: string;
  count: number;
  percentage: number;
}

export interface DocumentTypeStat {
  label: 'PDF' | 'Images' | 'Word' | 'Excel' | 'ZIP' | 'Others';
  count: number;
  percentage: number;
}

export interface ReportsSnapshot {
  overview: OverviewStats;
  categoryStats: CategoryStat[];
  memberStats: MemberStat[];
  typeStats: DocumentTypeStat[];
  mostUsedCategory: CategoryStat | null;
  leastUsedCategory: CategoryStat | null;
  mostActiveMember: MemberStat | null;
  leastActiveMember: MemberStat | null;
}
