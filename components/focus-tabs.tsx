'use client'

import type { FocusTab } from '@/lib/types'
import { Button } from '@/components/ui/button'

interface FocusTabsProps {
  focusTab: FocusTab
  onFocusTabChange: (tab: FocusTab) => void
}

const TABS: { value: FocusTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'hour24', label: '24-Hour Focus' },
  { value: 'day14', label: '14-Day Focus' },
  { value: 'day30', label: '30-Day Focus' },
]

export function FocusTabs({ focusTab, onFocusTabChange }: FocusTabsProps) {
  return (
    <div className="flex items-center justify-between pb-4">
      <div className="flex items-center gap-1">
        {TABS.map((tab) => (
          <Button
            key={tab.value}
            variant={focusTab === tab.value ? 'default' : 'outline'}
            size="sm"
            className="text-xs"
            onClick={() => onFocusTabChange(tab.value)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {focusTab === 'overview'
          ? 'Tip: Focus tabs show 1 card per row'
          : `Sorted by soonest ${TABS.find((t) => t.value === focusTab)?.label?.replace(' Focus', '')} deadline`}
      </p>
    </div>
  )
}
