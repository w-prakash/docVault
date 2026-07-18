import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Preferences } from '@capacitor/preferences';

const AVATAR_OVERRIDE_KEY = 'profile_avatar_override';

/**
 * The account photo normally comes straight from Google — this app has no
 * profile-photo backend of its own. This service lets someone pick a photo
 * on-device instead; it's stored locally (Preferences, base64) and merged
 * on top of the Google photo everywhere a profile is shown. Clearing it
 * simply falls back to the Google photo again.
 */
@Injectable({
  providedIn: 'root'
})
export class AvatarOverrideService {

  private readonly overrideSubject = new BehaviorSubject<string | null>(null);
  readonly override$ = this.overrideSubject.asObservable();

  private loaded = false;
  private loadingPromise: Promise<void> | null = null;

  async ensureLoaded(): Promise<void> {

    if (this.loaded) {
      return;
    }

    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = (async () => {
      try {
        const { value } = await Preferences.get({ key: AVATAR_OVERRIDE_KEY });
        this.overrideSubject.next(value || null);
        this.loaded = true;
      } catch (e) {
        console.warn('⚠️ Failed to load avatar override', e);
      }
    })();

    return this.loadingPromise;
  }

  get current(): string | null {
    return this.overrideSubject.value;
  }

  async setOverride(dataUrl: string): Promise<void> {
    await Preferences.set({ key: AVATAR_OVERRIDE_KEY, value: dataUrl });
    this.overrideSubject.next(dataUrl);
  }

  async clearOverride(): Promise<void> {
    await Preferences.remove({ key: AVATAR_OVERRIDE_KEY });
    this.overrideSubject.next(null);
  }
}
