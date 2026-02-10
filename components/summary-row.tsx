'use client'

import type { ExperienceType, StatusFilter } from '@/lib/types'
import { EXPERIENCE_LABELS } from '@/lib/types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface SummaryRowProps {
  computeCounts: (expType: ExperienceType) => {
    pending: number
    done: number
    late: number
    failed: number
  }
  onCountClick: (expType: ExperienceType, filter: StatusFilter) => void
}

const EXPERIENCE_TYPES: ExperienceType[] = ['hour24', 'day14', 'day30']

export function SummaryRow({ computeCounts, onCountClick }: SummaryRowProps) {
  return (
    <div className="grid grid-cols-3 gap-4 pb-4">
      {EXPERIENCE_TYPES.map((expType) => {
        const counts = computeCounts(expType)
        return (
          <Card key={expType} className="bg-card/50">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">
                {EXPERIENCE_LABELS[expType]} Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-3">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <button
                  onClick={() => onCountClick(expType, 'pending')}
                  className="hover:underline text-muted-foreground hover:text-foreground transition-colors"
                >
                  Pending: <span className="font-medium text-foreground">{counts.pending}</span>
                </button>
                <button
                  onClick={() => onCountClick(expType, 'done')}
                  className="hover:underline text-muted-foreground hover:text-foreground transition-colors"
                >
                  Done: <span className="font-medium text-green-500">{counts.done}</span>
                </button>
                <button
                  onClick={() => onCountClick(expType, 'failed')}
                  className="hover:underline text-muted-foreground hover:text-foreground transition-colors"
                >
                  Failed: <span className="font-medium text-red-500">{counts.failed}</span>
                </button>
                <button
                  onClick={() => onCountClick(expType, 'late')}
                  className="hover:underline text-muted-foreground hover:text-foreground transition-colors"
                >
                  Late: <span className="font-medium text-amber-500">{counts.late}</span>
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">
                Click counts to filter
              </p>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
