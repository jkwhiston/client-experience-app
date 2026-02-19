'use client'

import type { StatusFilter } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export interface OngoingSummaryCounts {
  upToDate: number
  dueSoon: number
  overdue: number
  completionRate: number // 0-100
  totalDue: number
  totalCompleted: number
}

interface OngoingSummaryRowProps {
  counts: OngoingSummaryCounts
  onFilterClick: (filter: StatusFilter) => void
}

export function OngoingSummaryRow({ counts, onFilterClick }: OngoingSummaryRowProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <Card className="border-l-4 border-l-emerald-500 bg-emerald-500/5">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base font-semibold">Up to Date</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <button
            onClick={() => onFilterClick('done')}
            className="hover:underline transition-colors"
          >
            <span className="text-2xl font-bold text-emerald-500">{counts.upToDate}</span>
            <span className="text-sm text-muted-foreground ml-1.5">clients</span>
          </button>
          <p className="text-xs text-muted-foreground mt-1">
            All due experiences completed
          </p>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-blue-500 bg-blue-500/5">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base font-semibold">Due Soon</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <button
            onClick={() => onFilterClick('pending')}
            className="hover:underline transition-colors"
          >
            <span className="text-2xl font-bold text-blue-500">{counts.dueSoon}</span>
            <span className="text-sm text-muted-foreground ml-1.5">clients</span>
          </button>
          <p className="text-xs text-muted-foreground mt-1">
            Experience due within 7 days
          </p>
        </CardContent>
      </Card>

      <Card className="border-l-4 border-l-red-500 bg-red-500/5">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base font-semibold">Overdue</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <button
            onClick={() => onFilterClick('failed')}
            className="hover:underline transition-colors"
          >
            <span className="text-2xl font-bold text-red-500">{counts.overdue}</span>
            <span className="text-sm text-muted-foreground ml-1.5">clients</span>
          </button>
          <p className="text-xs text-muted-foreground mt-1">
            Has overdue pending experiences
          </p>
        </CardContent>
      </Card>

      <Card className={cn(
        'border-l-4 bg-violet-500/5',
        counts.completionRate >= 80 ? 'border-l-violet-500' : counts.completionRate >= 50 ? 'border-l-amber-500' : 'border-l-red-500',
      )}>
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-base font-semibold">Completion Rate</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-3">
          <div>
            <span className={cn(
              'text-2xl font-bold',
              counts.completionRate >= 80 ? 'text-violet-500' : counts.completionRate >= 50 ? 'text-amber-500' : 'text-red-500',
            )}>
              {counts.completionRate}%
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {counts.totalCompleted} of {counts.totalDue} due experiences
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
