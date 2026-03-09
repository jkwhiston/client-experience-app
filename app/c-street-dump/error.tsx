'use client'

import { Button } from '@/components/ui/button'

export default function CStreetDumpError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-20 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">C-Street Dump</h1>
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
          <p className="text-sm font-medium text-destructive">
            The task dump page could not load.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {error.message || 'Unknown error'}
          </p>
          <div className="mt-4">
            <Button onClick={reset}>Try again</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
