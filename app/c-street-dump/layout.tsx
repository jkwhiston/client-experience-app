import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'C-Street Dump',
  description: 'A separate task and thoughts workspace for fast task dumping.',
}

export default function CStreetDumpLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return children
}
