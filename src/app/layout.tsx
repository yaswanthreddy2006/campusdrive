import type { Metadata } from 'next'
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

export const metadata: Metadata = {
  title: 'KARE Shuttle Pool | Kalasalingam Campus Transportation',
  description: 'Smart campus shuttle pooling app for Kalasalingam Academy of Research and Education students and drivers. Live GPS tracking, quick QR boarding, and instant seat reservations.',
  keywords: ['KARE', 'Kalasalingam', 'Campus Shuttle', 'Shuttle Pooling', 'Student Transport'],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-100 selection:bg-blue-500 selection:text-white`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
