'use client'

import { useState, useRef } from 'react'
import type {
  ClientWithExperiences,
  FocusTab,
  ActiveTab,
  ExperienceType,
} from '@/lib/types'
import { EXPERIENCE_TYPES } from '@/lib/types'
import {
  getActiveStage,
  getDueAt,
  getDueAtEffective,
  getNowEffective,
  getDerivedStatus,
} from '@/lib/deadlines'
import { updateClient } from '@/lib/queries'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MoreHorizontal, Pause, Play, Archive, ArchiveRestore } from 'lucide-react'
import { TimelineNode } from './timeline-node'

interface ClientRowProps {
  client: ClientWithExperiences
  focusTab: FocusTab
  activeTab: ActiveTab
  now: Date
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
}

export function ClientRow({
  client,
  focusTab,
  activeTab,
  now,
  updateClientLocal,
}: ClientRowProps) {
  const [editingName, setEditingName] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [nameValue, setNameValue] = useState(client.name)
  const [dateValue, setDateValue] = useState(client.signed_on_date)
  const nameRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  const isArchived = activeTab === 'archived'
  const isFocusMode = focusTab !== 'overview'
  const activeStage = getActiveStage(client, now)

  async function saveName() {
    setEditingName(false)
    if (nameValue.trim() && nameValue.trim() !== client.name) {
      updateClientLocal(client.id, (c) => ({ ...c, name: nameValue.trim() }))
      await updateClient(client.id, { name: nameValue.trim() })
    } else {
      setNameValue(client.name)
    }
  }

  async function saveDate() {
    setEditingDate(false)
    if (dateValue && dateValue !== client.signed_on_date) {
      updateClientLocal(client.id, (c) => ({ ...c, signed_on_date: dateValue }))
      await updateClient(client.id, { signed_on_date: dateValue })
    } else {
      setDateValue(client.signed_on_date)
    }
  }

  async function handlePauseResume() {
    if (client.paused) {
      // Resume
      const pauseStart = new Date(client.pause_started_at!).getTime()
      const pausedSeconds = Math.floor((Date.now() - pauseStart) / 1000)
      const newTotal = client.paused_total_seconds + pausedSeconds

      updateClientLocal(client.id, (c) => ({
        ...c,
        paused: false,
        pause_started_at: null,
        paused_total_seconds: newTotal,
      }))
      await updateClient(client.id, {
        paused: false,
        pause_started_at: null,
        paused_total_seconds: newTotal,
      })
    } else {
      // Pause
      const nowStr = new Date().toISOString()
      updateClientLocal(client.id, (c) => ({
        ...c,
        paused: true,
        pause_started_at: nowStr,
      }))
      await updateClient(client.id, {
        paused: true,
        pause_started_at: nowStr,
      })
    }
  }

  async function handleArchiveToggle() {
    const newArchived = !client.is_archived
    updateClientLocal(client.id, (c) => ({
      ...c,
      is_archived: newArchived,
      archived_at: newArchived ? new Date().toISOString() : null,
    }))
    await updateClient(client.id, {
      is_archived: newArchived,
      archived_at: newArchived ? new Date().toISOString() : null,
    })
  }

  function formatSignedDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-')
    return `${m}/${d}/${y}`
  }

  function getSegmentStatuses(): ('done' | 'failed' | 'pending')[] {
    const nowEff = getNowEffective(client, now)
    return EXPERIENCE_TYPES.map((expType) => {
      const exp = client.client_experiences.find((e) => e.experience_type === expType)
      if (!exp) return 'pending'
      const dueAt = getDueAt(client.signed_on_date, expType)
      const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
      const status = getDerivedStatus({
        status: exp.status,
        completed_at: exp.completed_at,
        dueAt: dueAtEff,
        now: nowEff,
      })
      if (status === 'done' || status === 'done_late') return 'done'
      if (status === 'failed') return 'failed'
      return 'pending'
    })
  }

  function getTrackGradient(): string {
    const statuses = getSegmentStatuses()
    const colorMap = (s: 'done' | 'failed' | 'pending') => {
      if (s === 'done') return 'rgb(34,197,94)'
      if (s === 'failed') return 'rgb(239,68,68)'
      return 'transparent'
    }
    const c1 = colorMap(statuses[0])
    const c2 = colorMap(statuses[1])
    const c3 = colorMap(statuses[2])
    return `linear-gradient(to right, ${c1} 0%, ${c1} 33%, ${c2} 33%, ${c2} 66%, ${c3} 66%, ${c3} 100%)`
  }

  return (
    <div
      className={`flex items-stretch rounded-lg border border-border bg-card/50 overflow-hidden ${
        client.paused ? 'opacity-70' : ''
      }`}
    >
      {/* Left column: client info */}
      <div className="flex flex-col justify-center p-4 min-w-[180px] max-w-[220px] border-r border-border">
        {/* Name */}
        {editingName && !isArchived ? (
          <Input
            ref={nameRef}
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveName()
              if (e.key === 'Escape') {
                setNameValue(client.name)
                setEditingName(false)
              }
            }}
            className="h-7 text-sm font-bold p-1"
            autoFocus
          />
        ) : (
          <button
            onClick={() => {
              if (!isArchived) {
                setEditingName(true)
                setTimeout(() => nameRef.current?.focus(), 0)
              }
            }}
            className="text-sm font-bold text-left truncate hover:text-primary transition-colors"
          >
            {client.name}
          </button>
        )}

        {/* Signed-on date */}
        {editingDate && !isArchived ? (
          <Input
            ref={dateRef}
            type="date"
            value={dateValue}
            onChange={(e) => setDateValue(e.target.value)}
            onBlur={saveDate}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveDate()
              if (e.key === 'Escape') {
                setDateValue(client.signed_on_date)
                setEditingDate(false)
              }
            }}
            className="h-6 text-xs p-1 mt-1"
            autoFocus
          />
        ) : (
          <button
            onClick={() => {
              if (!isArchived) {
                setEditingDate(true)
                setTimeout(() => dateRef.current?.focus(), 0)
              }
            }}
            className="text-xs text-muted-foreground text-left mt-0.5 hover:text-foreground transition-colors"
          >
            Signed on: {formatSignedDate(client.signed_on_date)}
          </button>
        )}

        {!isArchived && (
          <p className="text-[10px] text-muted-foreground/60 mt-1">
            Click name/date to edit
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 mt-2">
          {!isArchived && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={handlePauseResume}>
                  {client.paused ? (
                    <>
                      <Play className="h-3.5 w-3.5 mr-2" />
                      Resume Timers
                    </>
                  ) : (
                    <>
                      <Pause className="h-3.5 w-3.5 mr-2" />
                      Pause Timers
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleArchiveToggle}>
                  <Archive className="h-3.5 w-3.5 mr-2" />
                  Archive
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isArchived && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7"
              onClick={handleArchiveToggle}
            >
              <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
              Unarchive
            </Button>
          )}

          {client.paused && !isArchived && (
            <span className="text-[10px] text-amber-500 font-medium">Paused</span>
          )}
        </div>
      </div>

      {/* Right column: timeline track + nodes */}
      <div className="flex-1 relative flex items-center justify-between py-6 px-8 min-h-[140px]">
        {/* Track: base dotted line */}
        <div
          className="absolute left-8 right-8 top-[calc(50%+8px)] -translate-y-1/2 h-[3px] rounded-full"
          style={{
            backgroundImage: 'repeating-linear-gradient(to right, var(--muted) 0, var(--muted) 6px, transparent 6px, transparent 12px)',
          }}
          aria-hidden
        />
        {/* Track: solid color overlay for done/failed segments */}
        <div
          className="absolute left-8 right-8 top-[calc(50%+8px)] -translate-y-1/2 h-[3px] rounded-full"
          style={{
            background: getTrackGradient(),
          }}
          aria-hidden
        />
        {EXPERIENCE_TYPES.map((expType) => {
          const exp = client.client_experiences.find(
            (e) => e.experience_type === expType
          )
          if (!exp) return null
          return (
            <TimelineNode
              key={exp.id}
              experience={exp}
              client={client}
              now={now}
              isFocused={focusTab === expType}
              isFocusMode={isFocusMode}
              isActiveStage={expType === activeStage}
              isArchived={isArchived}
              updateClientLocal={updateClientLocal}
            />
          )
        })}
      </div>
    </div>
  )
}
