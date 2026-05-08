import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'home',
  loadComponent: () => import('./auth/login/login.page').then(m => m.LoginPage)
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
{
  path: 'login',
  loadComponent: () => import('./auth/login/login.page').then(m => m.LoginPage)
},
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard.page').then( m => m.DashboardPage)
  },
  {
    path: 'upload',
    loadComponent: () => import('./upload/upload.page').then( m => m.UploadPage)
  },
  {
    path: 'documents',
    loadComponent: () => import('./pages/documents/documents.page').then( m => m.DocumentsPage)
  }
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
