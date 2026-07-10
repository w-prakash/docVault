export interface GoogleUser {
  id: string;
  email: string;
  displayName: string;
  givenName?: string;
  familyName?: string;
  imageUrl?: string;
  idToken: string;
  accessToken?: string;
}

export interface GoogleSession {
  isAuthenticated: boolean;
  user: GoogleUser | null;
}