import type { Metadata } from 'next'
import { Fraunces, Source_Sans_3, Geist } from 'next/font/google'
import './globals.css'
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

const display = Fraunces({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

const body = Source_Sans_3({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '600', '700'],
})

export const metadata: Metadata = {
  title: 'PanelSmart Bot',
  description: 'Reclutamiento multicanal y monitoreo de conversaciones',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className={cn(display.variable, body.variable, "font-sans", geist.variable)}>
      <body>{children}</body>
    </html>
  )
}
