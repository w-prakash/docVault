import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule, ActionSheetController, ToastController } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { UserProfile, UserService } from '../../services/user.service';
import { AvatarOverrideService } from '../../services/avatar-override.service';
import { NicknameOverrideService } from '../../services/nickname-override.service';
import { GoogleSessionService } from '../../core/google/session/google-session.service';
import { GoogleUser } from '../../core/google/auth/google-auth.models';

@Component({
  selector: 'app-edit-profile',
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
  templateUrl: './edit-profile.page.html',
  styleUrls: ['./edit-profile.page.scss']
})
export class EditProfilePage implements OnInit, OnDestroy {

  // Effective profile (overrides applied) — drives the editable section
  profile: UserProfile | null = null;
  avatarError = false;
  hasAvatarOverride = false;
  hasNicknameOverride = false;

  // Raw Google account — drives the read-only "original" section, never overridden
  originalUser: GoogleUser | null = null;
  originalAvatarError = false;

  // Name field
  editedName = '';
  isSavingName = false;

  private destroy$ = new Subject<void>();

  constructor(
    public userService: UserService,
    private avatarOverride: AvatarOverrideService,
    private nicknameOverride: NicknameOverrideService,
    private sessionService: GoogleSessionService,
    private actionSheetCtrl: ActionSheetController,
    private toastCtrl: ToastController,
    private location: Location
  ) {}

  ngOnInit() {
    this.userService.profile$
      .pipe(takeUntil(this.destroy$))
      .subscribe(profile => {
        this.profile = profile;
        // Only sync the field from the live profile until the person starts
        // typing their own edit — otherwise every override update while
        // they're mid-edit would stomp on what they're typing.
        if (!this.isSavingName && document.activeElement?.id !== 'nameInput') {
          this.editedName = profile?.displayName || '';
        }
      });

    this.sessionService.session$
      .pipe(takeUntil(this.destroy$))
      .subscribe(session => (this.originalUser = session.user));

    this.avatarOverride.override$
      .pipe(takeUntil(this.destroy$))
      .subscribe(override => (this.hasAvatarOverride = !!override));

    this.nicknameOverride.override$
      .pipe(takeUntil(this.destroy$))
      .subscribe(override => (this.hasNicknameOverride = !!override));
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goBack() {
    this.location.back();
  }

  // =====================================
  // NAME
  // =====================================

  get nameChanged(): boolean {
    return this.editedName.trim().length > 0 &&
      this.editedName.trim() !== (this.profile?.displayName || '');
  }

  async saveName() {

    const trimmed = this.editedName.trim();

    if (!trimmed) {
      await this.showToast("Name can't be empty");
      this.editedName = this.profile?.displayName || '';
      return;
    }

    this.isSavingName = true;

    try {

      if (trimmed === this.originalUser?.displayName) {
        // Matches the Google name again — clear the override instead of storing a redundant copy
        await this.nicknameOverride.clearOverride();
      } else {
        await this.nicknameOverride.setOverride(trimmed);
      }

      await this.showToast('Name updated');

    } finally {
      this.isSavingName = false;
    }
  }

  async resetName() {
    await this.nicknameOverride.clearOverride();
    this.editedName = this.originalUser?.displayName || '';
    await this.showToast('Name reset to your Google account name');
  }

  // =====================================
  // PHOTO
  // =====================================

  async changePhoto() {
    const sheet = await this.actionSheetCtrl.create({
      header: 'Change Photo',
      cssClass: 'vault-action-sheet',
      buttons: [
        {
          text: 'Camera',
          icon: 'camera-outline',
          handler: () => this.captureFromCamera()
        },
        {
          text: 'Gallery',
          icon: 'images-outline',
          handler: () => this.captureFromGallery()
        },
        ...(this.hasAvatarOverride ? [{
          text: 'Remove Photo',
          icon: 'trash-outline',
          role: 'destructive' as const,
          handler: () => this.removePhoto()
        }] : []),
        { text: 'Cancel', role: 'cancel', icon: 'close-outline' }
      ]
    });

    await sheet.present();
  }

  private async captureFromCamera() {
    try {
      const image = await Camera.getPhoto({
        quality: 70,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
        width: 320,
        height: 320
      });

      if (image.dataUrl) {
        await this.avatarOverride.setOverride(image.dataUrl);
        this.avatarError = false;
        await this.showToast('Profile photo updated');
      }
    } catch {
      // user cancelled the camera — nothing to do
    }
  }

  private async captureFromGallery() {
    try {
      const image = await Camera.getPhoto({
        quality: 70,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
        width: 320,
        height: 320
      });

      if (image.dataUrl) {
        await this.avatarOverride.setOverride(image.dataUrl);
        this.avatarError = false;
        await this.showToast('Profile photo updated');
      }
    } catch {
      // user cancelled the picker — nothing to do
    }
  }

  private async removePhoto() {
    await this.avatarOverride.clearOverride();
    await this.showToast('Profile photo reset to your Google account photo');
  }

  private async showToast(message: string) {
    const toast = await this.toastCtrl.create({
      message,
      duration: 1800,
      position: 'bottom',
      cssClass: 'vault-toast'
    });
    await toast.present();
  }
}
