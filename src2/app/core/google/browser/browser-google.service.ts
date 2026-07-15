// import { Injectable } from '@angular/core';
// import { GoogleUser } from '../auth/google-auth.models';

// declare const google: any;

// @Injectable({
//   providedIn: 'root'
// })
// export class BrowserGoogleService {

//   private client: any;

//   initialize(clientId: string): Promise<void> {
//     return new Promise((resolve) => {

//       this.client = google.accounts.oauth2.initTokenClient({
//         client_id: clientId,
//         scope: 'openid email profile https://www.googleapis.com/auth/drive.file',
//         callback: () => {}
//       });

//       resolve();
//     });
//   }

//   signIn(): Promise<GoogleUser> {

//     return new Promise((resolve, reject) => {

//       this.client.callback = async (response: any) => {

//         if (response.error) {
//           reject(response);
//           return;
//         }

//         const userInfo = await fetch(
//           'https://www.googleapis.com/oauth2/v3/userinfo',
//           {
//             headers: {
//               Authorization: `Bearer ${response.access_token}`
//             }
//           }
//         ).then(r => r.json());

//         resolve({
//           id: userInfo.sub,
//           email: userInfo.email,
//           displayName: userInfo.name,
//           givenName: userInfo.given_name,
//           familyName: userInfo.family_name,
//           imageUrl: userInfo.picture,
//           idToken: '',
//           accessToken: response.access_token
//         });

//       };

//       this.client.requestAccessToken();

//     });

//   }

//   signOut() {
//     google.accounts.oauth2.revoke('', () => {});
//   }

// }