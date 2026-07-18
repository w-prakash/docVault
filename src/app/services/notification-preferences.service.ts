import { Injectable } from '@angular/core';
import { Preferences } from '@capacitor/preferences';

export type NotificationCategory =
  | 'uploads'
  | 'downloads'
  | 'syncCompleted'
  | 'syncFailed'
  | 'securityAlerts'
  | 'storageAlerts'
  | 'documentExpiry'
  | 'sounds';

const PREF_KEY_PREFIX = 'notif_pref_';

const DEFAULTS: Record<NotificationCategory, boolean> = {
  uploads: true,
  downloads: true,
  syncCompleted: true,
  syncFailed: true,
  securityAlerts: true,
  storageAlerts: true,
  documentExpiry: true,
  sounds: true
};

export type NotificationPreferences = Record<NotificationCategory, boolean>;

/**
 * Backing service for Settings → Notifications. Purely a preferences
 * store — the actual notification creation/scheduling stays in
 * NotificationService. Call `shouldNotify(category)` from a call site
 * before invoking NotificationService.notify() to respect the user's
 * choice; existing call sites are unchanged until wired individually.
 */
@Injectable({ providedIn: 'root' })
export class NotificationPreferencesService {

  private key(category: NotificationCategory): string {
    return `${PREF_KEY_PREFIX}${category}`;
  }

  async get(category: NotificationCategory): Promise<boolean> {
    const { value } = await Preferences.get({ key: this.key(category) });
    return value === null ? DEFAULTS[category] : value === 'true';
  }

  async set(category: NotificationCategory, enabled: boolean): Promise<void> {
    await Preferences.set({ key: this.key(category), value: String(enabled) });
  }

  async shouldNotify(category: NotificationCategory): Promise<boolean> {
    return this.get(category);
  }

  async getAll(): Promise<NotificationPreferences> {

    const entries = await Promise.all(
      (Object.keys(DEFAULTS) as NotificationCategory[]).map(
        async category => [category, await this.get(category)] as const
      )
    );

    return Object.fromEntries(entries) as NotificationPreferences;
  }
}
