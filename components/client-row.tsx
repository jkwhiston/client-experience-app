'use client'

import { useState, useRef } from 'react'
import type {
  ClientWithExperiences,
  FocusTab,
  ActiveTab,
  ExperienceType,
  DerivedStatus,
} from '@/lib/types'
import { EXPERIENCE_TYPES, EXPERIENCE_LABELS } from '@/lib/types'
import {
  getDueAt,
  getDueAtEffective,
  getNowEffective,
  formatDurationCompact,
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
import { ExperienceCard } from './experience-card'
import { MiniIndicator } from './mini-indicator'

interface ClientRowProps {
  client: ClientWithExperiences
  focusTab: FocusTab
  activeTab: ActiveTab
  now: Date
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
  getExpDerivedStatus: (
    client: ClientWithExperiences,
    expType: ExperienceType
  ) => DerivedStatus
}

export function ClientRow({
  client,
  focusTab,
  activeTab,
  now,
  updateClientLocal,
  getExpDerivedStatus,
}: ClientRowProps) {
  const [editingName, setEditingName] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [nameValue, setNameValue] = useState(client.name)
  const [dateValue, setDateValue] = useState(client.signed_on_date)
  const nameRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  const isArchived = activeTab === 'archived'
  const isFocusMode = focusTab !== 'overview'
  const focusedType = isFocusMode ? (focusTab as ExperienceType) : null
  const otherTypes = focusedType
    ? EXPERIENCE_TYPES.filter((t) => t !== focusedType)
    : []

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

      {/* Right column: experience cards */}
      <div className="flex-1 flex items-stretch">
        {isFocusMode && focusedType ? (
          <>
            {/* Focus mode: one large card */}
            <div className="flex-1">
              {client.client_experiences
                .filter((e) => e.experience_type === focusedType)
                .map((exp) => (
                  <ExperienceCard
                    key={exp.id}
                    client={client}
                    experience={exp}
                    now={now}
                    variant="focus"
                    isArchived={isArchived}
                    updateClientLocal={updateClientLocal}
                  />
                ))}
            </div>
            {/* Mini indicators for other milestones */}
            <div className="flex flex-col justify-center gap-2 p-3 border-l border-border min-w-[140px]">
              {otherTypes.map((expType) => {
                const exp = client.client_experiences.find(
                  (e) => e.experience_type === expType
                )
                if (!exp) return null
                const dueAt = getDueAt(client.signed_on_date, expType)
                const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
                const nowEff = getNowEffective(client, now)
                const secondsRemaining = (dueAtEff.getTime() - nowEff.getTime()) / 1000
                const derivedStatus = getDerivedStatus({
                  status: exp.status,
                  completed_at: exp.completed_at,
                  dueAt: dueAtEff,
                  now: nowEff,
                })

                return (
                  <MiniIndicator
                    key={exp.id}
                    label={EXPERIENCE_LABELS[expType]}
                    timeRemaining={formatDurationCompact(secondsRemaining)}
                    derivedStatus={derivedStatus}
                  />
                )
              })}
            </div>
          </>
        ) : (
          /* Overview mode: 3 cards side by side */
          EXPERIENCE_TYPES.map((expType) => {
            const exp = client.client_experiences.find(
              (e) => e.experience_type === expType
            )
            if (!exp) return null
            return (
              <ExperienceCard
                key={exp.id}
                client={client}
                experience={exp}
                now={now}
                variant="overview"
                isArchived={isArchived}
                updateClientLocal={updateClientLocal}
              />
            )
          })
        )}
      </div>
    </div>
  )
}
