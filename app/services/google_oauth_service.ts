import { google } from 'googleapis'

interface GoogleUserData {
  googleId: string
  email: string
  name: string
  avatar: string | null
}

export default class GoogleOAuthService {
  private oauth2Client

  constructor() {
    const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID
    const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET
    const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error('Missing Google OAuth configuration')
    }

    this.oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri)
  }

  /**
   * Generate Google OAuth authorization URL
   */
  getAuthUrl(): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
      prompt: 'select_account', // Force account selection even if user is already logged in
    })
  }

  /**
   * Exchange authorization code for user data
   */
  async getUserData(code: string): Promise<GoogleUserData> {
    try {
      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code)
      this.oauth2Client.setCredentials(tokens)

      // Get user info from Google
      const oauth2 = google.oauth2({ version: 'v2', auth: this.oauth2Client })
      const { data } = await oauth2.userinfo.get()

      if (!data.id || !data.email || !data.name) {
        throw new Error('Incomplete user data received from Google')
      }

      return {
        googleId: data.id,
        email: data.email,
        name: data.name,
        avatar: data.picture || null,
      }
    } catch (error) {
      console.error('Error getting user data from Google:', error)
      throw new Error('Failed to get user data from Google')
    }
  }
}
