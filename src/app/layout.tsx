import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import Providers from '@/components/Providers'

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
})
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#020617',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://campusdrive-nu.vercel.app'),
  title: 'CampusDrive Go | Kalasalingam Academy of Research and Education',
  description:
    'Book your campus shuttle in seconds. Student-built campus shuttle for KARE.',
  keywords: [
    'CampusDrive Go',
    'KARE',
    'Kalasalingam',
    'Kalasalingam Academy of Research and Education',
    'Campus Shuttle',
    'Student Transit',
  ],
  authors: [{ name: 'CampusDrive Go Team' }],
  icons: {
    icon: '/favicon.ico',
    apple: '/icon-192.png',
  },
  manifest: '/manifest.json',
  openGraph: {
    title: 'CampusDrive Go | Kalasalingam Academy of Research and Education',
    description:
      'Book your campus shuttle in seconds. Student-built campus shuttle for KARE.',
    url: 'https://campusdrive-nu.vercel.app',
    siteName: 'CampusDrive Go',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'CampusDrive Go - Kalasalingam Campus Shuttle',
      },
    ],
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'CampusDrive Go | Kalasalingam Academy of Research and Education',
    description:
      'Book your campus shuttle in seconds. Student-built campus shuttle for KARE.',
    images: ['/og-image.png'],
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100 selection:bg-blue-500 selection:text-white overflow-x-hidden`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
