import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.page.html',
  styleUrls: ['./dashboard.page.scss'],
  imports: [IonicModule, CommonModule, FormsModule],
})
export class DashboardPage implements OnInit {

  constructor(private router: Router) {}

  goToUpload() {
    this.router.navigateByUrl('/upload');
  }

  goToDocuments() {
    this.router.navigateByUrl('/documents');
  }
  ngOnInit() {
  }

}
