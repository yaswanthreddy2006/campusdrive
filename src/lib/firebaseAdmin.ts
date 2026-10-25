import * as admin from 'firebase-admin'

function formatPrivateKey(key: string | undefined): string | undefined {
  if (!key) return undefined
  let formatted = key.trim()
  if (formatted.startsWith('"') && formatted.endsWith('"')) {
    formatted = formatted.slice(1, -1)
  }
  return formatted.replace(/\\n/g, '\n')
}

function getFirebaseAdmin() {
  if (!admin.apps.length) {
    try {
      // 1. Check if user provided the entire service account JSON string
      if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY)
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        })
        return admin
      }

      // 2. Otherwise use individual environment variables
      const privateKey = formatPrivateKey(process.env.FIREBASE_PRIVATE_KEY)
      const clientEmail =
        process.env.FIREBASE_CLIENT_EMAIL ||
        'firebase-adminsdk-fbsvc@campusdrive-d6420.iam.gserviceaccount.com'
      const projectId = process.env.FIREBASE_PROJECT_ID || 'campusdrive-d6420'

      if (privateKey) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        })
      }
    } catch (error) {
      console.error('Firebase Admin initialization failed:', error)
    }
  }
  return admin
}

// Lazy adminAuth proxy so build-time static page collection never throws if credentials are missing
export const adminAuth = new Proxy({} as admin.auth.Auth, {
  get(_target, prop: keyof admin.auth.Auth) {
    const app = getFirebaseAdmin()
    if (!app.apps.length) {
      throw new Error(
        'Firebase Admin SDK is not initialized. Please configure FIREBASE_PRIVATE_KEY in your environment variables.'
      )
    }
    const auth = app.auth()
    const value = auth[prop]
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(auth) : value
  },
})

export default admin

