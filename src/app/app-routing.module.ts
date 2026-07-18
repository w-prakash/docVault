import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';
import { VaultGuard }
from './guards/vault.guard';
const routes: Routes = [
  {
    path: '',
    redirectTo: 'splash',
    pathMatch: 'full',
  },
  {
    path: 'home',
    loadComponent: () =>
    import('./auth/login/login.page').then((m) => m.LoginPage),
  },
  // {
  //   path: '',
  //   redirectTo: 'home',
  //   pathMatch: 'full'
  // },
  {
    path: 'login',
    loadComponent: () =>
    import('./auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'dashboard',
    canActivate: [AuthGuard],
    loadComponent: () =>
    import('./dashboard/dashboard.page').then((m) => m.DashboardPage),
  },
  {
    path: 'upload',
    canActivate: [AuthGuard],
    loadComponent: () =>
    import('./upload/upload.page').then((m) => m.UploadPage),
  },
  {
    path: 'documents',
    canActivate: [
    AuthGuard,
    VaultGuard
  ],
    loadComponent: () =>
    import('./pages/documents/documents.page').then((m) => m.DocumentsPage),
  },
  {
    path: 'settings',
    canActivate: [AuthGuard],
    loadComponent: () =>
    import('./settings/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'profile',
    canActivate: [AuthGuard],
    loadComponent: () =>
    import('./pages/profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'edit-profile',
    canActivate: [AuthGuard],
    loadComponent: () =>
    import('./pages/edit-profile/edit-profile.page').then((m) => m.EditProfilePage),
  },
  {
    path: 'change-password',
    canActivate: [AuthGuard],
    loadComponent: () =>
    import('./pages/change-password/change-password.page').then((m) => m.ChangePasswordPage),
  },
  {
    path: 'manage-devices',
    canActivate: [AuthGuard],
    loadComponent: () =>
    import('./pages/manage-devices/manage-devices.page').then((m) => m.ManageDevicesPage),
  },
  {
    path: 'activity-log',
    canActivate: [AuthGuard],
    loadComponent: () =>
    import('./pages/activity-log/activity-log.page').then((m) => m.ActivityLogPage),
  },
  {
    path: 'reports',
    canActivate: [AuthGuard],
    loadComponent: () =>
    import('./pages/reports/reports.page').then((m) => m.ReportsPage),
  },
  {
    path: 'splash',
    loadComponent: () =>
    import('./pages/splash/splash.page').then((m) => m.SplashPage),
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}