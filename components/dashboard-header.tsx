'use client'

import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import type { ActiveTab } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Archive, LogOut, Moon, MoreHorizontal, Sun } from 'lucide-react'

interface DashboardHeaderProps {
  activeTab: ActiveTab
  onActiveTabChange: (tab: ActiveTab) => void
}

export function DashboardHeader({
  activeTab,
  onActiveTabChange,
}: DashboardHeaderProps) {
  const router = useRouter()
  const { theme, setTheme } = useTheme()

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
            variant={activeTab === 'onboarding' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onActiveTabChange('onboarding')}
            className={activeTab === 'onboarding' ? 'text-xs' : 'text-xs bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'}
          >
            Onboarding
          </Button>
          <Button
            variant={activeTab === 'lifecycle' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onActiveTabChange('lifecycle')}
            className={activeTab === 'lifecycle' ? 'text-xs' : 'text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'}
          >
            Lifecycle
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-9 w-9">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">More options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onActiveTabChange('archived')}
              className={activeTab === 'archived' ? 'bg-accent' : ''}
            >
              <Archive className="h-4 w-4 mr-2" />
              Archived
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <Sun className="h-4 w-4 mr-2 dark:hidden" />
              <Moon className="h-4 w-4 mr-2 hidden dark:block" />
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleSignOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
