'use client'

import { useRouter } from 'next/navigation'
import type { ActiveTab } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from './theme-toggle'
import { LogOut } from 'lucide-react'

interface DashboardHeaderProps {
  activeTab: ActiveTab
  onActiveTabChange: (tab: ActiveTab) => void
}

export function DashboardHeader({
  activeTab,
  onActiveTabChange,
}: DashboardHeaderProps) {
  const router = useRouter()

  async function handleSignOut() {
    await fetch('/api/auth', { method: 'DELETE' })
    router.push('/login')
    router.refresh()
  }

  return (
    <div className="flex items-center justify-between pb-6">
      <h1 className="text-2xl font-bold tracking-tight">
        Client Experience Tracker
      </h1>

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-muted/50 p-0.5">
          <Button
            variant={activeTab === 'active' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onActiveTabChange('active')}
            className="text-xs"
          >
            Active
          </Button>
          <Button
            variant={activeTab === 'archived' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onActiveTabChange('archived')}
            className="text-xs"
          >
            Archived
          </Button>
        </div>

        <ThemeToggle />

        <Button
          variant="ghost"
          size="icon"
          onClick={handleSignOut}
          className="h-9 w-9"
          title="Sign out"
        >
          <LogOut className="h-4 w-4" />
          <span className="sr-only">Sign out</span>
        </Button>
      </div>
    </div>
  )
}
