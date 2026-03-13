import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'C-Street Dump',
  description: 'A separate task and thoughts workspace for fast task dumping.',
  icons: {
    icon: [{ url: '/c-street-dump/icon.svg', type: 'image/svg+xml' }],
    shortcut: ['/c-street-dump/icon.svg'],
  },
}

export default function CStreetDumpLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
