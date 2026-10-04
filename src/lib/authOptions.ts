import { NextAuthOptions, DefaultSession } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import prisma from '@/lib/prisma'

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string
      role?: string
      registerNum?: string | null
    } & DefaultSession['user']
  }
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      authorization: {
        params: {
          prompt: 'select_account',
          access_type: 'offline',
          response_type: 'code',
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const email = user.email || ''
        const normalizedEmail = email.toLowerCase().trim()
        const isAdminEmail = normalizedEmail === 'yaswanthputluru@gmail.com'

        // Allow @klu.ac.in student emails AND yaswanthputluru@gmail.com admin account
        if (!normalizedEmail.endsWith('@klu.ac.in') && !isAdminEmail) {
          return '/unauthorized?reason=invalid_domain'
        }

        try {
          const role = isAdminEmail ? 'ADMIN' : 'STUDENT'
          await prisma.user.upsert({
            where: { email: normalizedEmail },
            update: {
              name: user.name || undefined,
              role: isAdminEmail ? 'ADMIN' : undefined,
            },
            create: {
              email: normalizedEmail,
              name: user.name || (isAdminEmail ? 'KARE System Admin' : 'KLU Student'),
              role: role,
            },
          })
          return true
        } catch (error) {
          console.error('Error saving user on login:', error)
          return true
        }
      }
      return true
    },
    async jwt({ token, user }) {
      try {

        if (user?.email) {
          const normalizedEmail = user.email.toLowerCase().trim()
          const dbUser = await prisma.user.findUnique({
            where: { email: normalizedEmail },
          })
          if (dbUser) {
            token.id = dbUser.id
            token.role = dbUser.role
            token.registerNum = dbUser.registerNum
          }
        }
      } catch (error) {
        console.error('Error in JWT callback:', error)
      }
      return token
    },
    async session({ session, token }) {
      try {
        if (session.user) {
          session.user.id = token.id as string
          session.user.role = token.role as string
          session.user.registerNum = token.registerNum as string | null
        }
      } catch (error) {
        console.error('Error in session callback:', error)
      }
      return session
    },
  },
  pages: {
    signIn: '/',
    error: '/unauthorized',
  },
  session: {
    strategy: 'jwt',
  },
  secret: process.env.NEXTAUTH_SECRET || 'kare-campus-shuttle-dev-secret-key',
}
