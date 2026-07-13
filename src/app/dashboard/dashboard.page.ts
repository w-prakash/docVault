import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { VaultService } from '../services/vault.service';
import { UserProfile, UserService } from '../services/user.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule],
})
export class DashboardPage implements OnInit {
  profile: UserProfile | null = null;

  constructor(private router: Router,   public vaultService: VaultService, private userService: UserService
) {}

  goToUpload() {
    this.router.navigateByUrl('/upload');
  }

  goToDocuments() {
    this.router.navigateByUrl('/documents');
  }
  ngOnInit() {
        this.userService.profile$.subscribe(profile => this.profile = profile);
  }

}
