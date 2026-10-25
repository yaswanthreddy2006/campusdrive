import * as admin from 'firebase-admin'

if (!admin.apps.length) {
  const privateKey = process.env.FIREBASE_PRIVATE_KEY
    ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    : undefined

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID || 'campusdrive-d6420',
      clientEmail:
        process.env.FIREBASE_CLIENT_EMAIL ||
        'firebase-adminsdk-fbsvc@campusdrive-d6420.iam.gserviceaccount.com',
      privateKey,
    }),
  })
}

export const adminAuth = admin.auth()
export default admin
