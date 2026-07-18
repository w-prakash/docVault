import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Preferences } from '@capacitor/preferences';

const NICKNAME_OVERRIDE_KEY = 'profile_nickname_override';

/**
 * The display name normally comes straight from Google — this app has no
 * profile backend of its own. This service lets someone set a local
 * nickname instead; it's stored on-device (Preferences) and merged on top
 * of the Google name everywhere a profile is shown. Clearing it simply
 * falls back to the Google name again. Mirrors AvatarOverrideService.
 */
@Injectable({
  providedIn: 'root'
})
export class NicknameOverrideService {

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
        const { value } = await Preferences.get({ key: NICKNAME_OVERRIDE_KEY });
        this.overrideSubject.next(value || null);
        this.loaded = true;
      } catch (e) {
        console.warn('⚠️ Failed to load nickname override', e);
      }
    })();

    return this.loadingPromise;
  }

  get current(): string | null {
    return this.overrideSubject.value;
  }

  async setOverride(name: string): Promise<void> {
    await Preferences.set({ key: NICKNAME_OVERRIDE_KEY, value: name });
    this.overrideSubject.next(name);
  }

  async clearOverride(): Promise<void> {
    await Preferences.remove({ key: NICKNAME_OVERRIDE_KEY });
    this.overrideSubject.next(null);
  }
}
