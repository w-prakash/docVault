import { OAuth2AuthenticateOptions } from '@byteowls/capacitor-oauth2';

export const googleOAuthConfig: OAuth2AuthenticateOptions = {
  authorizationBaseUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  accessTokenEndpoint: 'https://oauth2.googleapis.com/token',
  resourceUrl: 'https://www.googleapis.com/oauth2/v3/userinfo',

  scope:
    'openid profile email https://www.googleapis.com/auth/drive.file',

  logsEnabled: true,

  web: {
    appId:
      '48865696360-p7beskba51idnh7e9doqhd3s1rhu3lvd.apps.googleusercontent.com',

    responseType: 'token',

    redirectUrl: 'http://localhost:8100',

    accessTokenEndpoint: ''
  },

  android: {
    appId:
      '48865696360-5ie67b7mmku1jkkdbgvuqf20a0a2atk8.apps.googleusercontent.com',

    responseType: 'code',

    pkceEnabled: true,

    redirectUrl: 'com.docvault.app:/',

    handleResultOnActivityResult: true,

    handleResultOnNewIntent: true
  }
};