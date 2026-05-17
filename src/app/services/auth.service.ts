import { Injectable } from '@angular/core';

import { Router } from '@angular/router';

import { SupabaseService }
from './supabase.service';

@Injectable({
  providedIn: 'root'
})

export class AuthService {

  constructor(

    private supabaseService:
      SupabaseService,

    private router:
      Router
  ) {}

  // =====================================
  // GET SESSION
  // =====================================

  async getSession() {

    const {
      data,
      error
    } =
      await this.supabaseService
        .supabase.auth.getSession();

    if (error) {

      console.error(
        '❌ Session error',
        error
      );

      return null;
    }

    return data.session;
  }

  // =====================================
  // IS LOGGED IN
  // =====================================

  async isLoggedIn() {

    const session =
      await this.getSession();

    return !!session;
  }

  // =====================================
  // LOGIN
  // =====================================

  async login(
    email: string,
    password: string
  ) {

    return await this.supabaseService
      .supabase.auth.signInWithPassword({

        email,
        password
      });
  }

  // =====================================
  // LOGOUT
  // =====================================

async logout() {

  try {

    console.log(
      '🔓 SIGNING OUT'
    );

    await this.supabaseService
      .supabase.auth.signOut();

    console.log(
      '✅ SIGNED OUT'
    );

    // 🔥 hard reset app state

    window.location.href =
      '/login';

  } catch (e) {

    console.error(
      '❌ LOGOUT ERROR',
      e
    );
  }
}
}