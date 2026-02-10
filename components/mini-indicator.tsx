'use client'

import type { DerivedStatus } from '@/lib/types'
import { CheckCircle2, XCircle, AlertTriangle, Clock } from 'lucide-react'

interface MiniIndicatorProps {
  label: string
  timeRemaining: string
  derivedStatus: DerivedStatus
}

export function MiniIndicator({
  label,
  timeRemaining,
  derivedStatus,
}: MiniIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground font-medium">
        {label}: {timeRemaining}
      </span>
      <StatusCircle status={derivedStatus} />
    </div>
  )
}

function StatusCircle({ status }: { status: DerivedStatus }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="h-4 w-4 text-green-500" />
    case 'done_late':
      return <AlertTriangle className="h-4 w-4 text-amber-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'pending':
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />
  }
}
