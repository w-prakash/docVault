/**
 * Core notification model used across the app.
 * Every notification that appears in the Notification Center is one of these.
 */
export type NotificationCategory =
  | 'sync'
  | 'security'
  | 'storage'
  | 'activity'
  | 'network';

export type NotificationType =
  // auth
  | 'auth-login'
  | 'auth-logout'
  | 'auth-session-expired'
  // drive
  | 'drive-upload-started'
  | 'drive-upload-completed'
  | 'drive-upload-failed'
  | 'drive-download-completed'
  | 'drive-download-failed'
  | 'drive-delete-completed'
  // sync
  | 'sync-started'
  | 'sync-completed'
  | 'sync-failed'
  | 'sync-background-completed'
  // network
  | 'network-offline'
  | 'network-online'
  // security
  | 'vault-locked'
  | 'vault-unlocked'
  // storage
  | 'storage-almost-full'
  | 'storage-cache-cleared';

export interface NotificationAction {
  label: string;
  /** Angular route to navigate to when the action (or the notification body) is tapped. */
  route?: string;
  /** Optional extra data the consuming page can use (e.g. queryParams). */
  data?: Record<string, any>;
}

export interface AppNotification {
  /** Dexie auto-increment primary key. */
  id?: number;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  /** ionicon name */
  icon: string;
  /** semantic color key: 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'teal' */
  color: string;
  timestamp: string; // ISO string
  read: boolean;
  action?: NotificationAction;
  /** Optional arbitrary metadata (e.g. document id, file name). */
  metadata?: Record<string, any>;
}

/** Convenience shape used when creating a notification — id/timestamp/read are filled in by the service. */
export type NewNotification = Omit<AppNotification, 'id' | 'timestamp' | 'read'>;
