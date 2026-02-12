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
import { updateClient, deleteClient } from '@/lib/queries'
import { getClientFont, getGoogleFontUrl } from '@/lib/client-fonts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { MoreHorizontal, Pause, Play, Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { TimelineNode } from './timeline-node'

interface ClientRowProps {
  index: number
  client: ClientWithExperiences
  focusTab: FocusTab
  activeTab: ActiveTab
  now: Date
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
  removeClientLocal: (clientId: string) => void
}

export function ClientRow({
  index,
  client,
  focusTab,
  activeTab,
  now,
  updateClientLocal,
  removeClientLocal,
}: ClientRowProps) {
  const [editingName, setEditingName] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [nameValue, setNameValue] = useState(client.name)
  const [dateValue, setDateValue] = useState(client.signed_on_date)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)

  const isArchived = activeTab === 'archived'
  const isFocusMode = focusTab !== 'overview'
  const activeStage = getActiveStage(client, now)
  const isEven = index % 2 === 0
  const nameFont = getClientFont(client.id)
  const nameFontStyle = { fontFamily: `"${nameFont}", sans-serif` }

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

  async function handleDelete() {
    removeClientLocal(client.id)
    await deleteClient(client.id)
  }

  function formatSignedDate(dateStr: string): string {
    const [y, m, d] = dateStr.split('-')
    return `${m}/${d}/${y}`
  }

  function getSegmentStatuses(): ('done' | 'done_late' | 'failed' | 'pending')[] {
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
      if (status === 'done') return 'done'
      if (status === 'done_late') return 'done_late'
      if (status === 'failed') return 'failed'
      return 'pending'
    })
  }

  function getTrackGradient(): string {
    const statuses = getSegmentStatuses()
    const colorMap = (s: 'done' | 'done_late' | 'failed' | 'pending') => {
      if (s === 'done') return 'rgb(34,197,94)'
      if (s === 'done_late') return 'rgb(245,158,11)'
      if (s === 'failed') return 'rgb(239,68,68)'
      return 'transparent'
    }
    const c1 = colorMap(statuses[0])
    const c2 = colorMap(statuses[1])
    const c3 = colorMap(statuses[2])
    return `linear-gradient(to right, ${c1} 0%, ${c1} 23%, ${c2} 27%, ${c2} 73%, ${c3} 77%, ${c3} 100%)`
  }

  return (
    <div
      className={`flex items-stretch rounded-lg border border-border overflow-hidden ${
        isEven ? 'bg-card/60' : 'bg-card/40'
      } ${client.paused ? 'opacity-70' : ''}`}
    >
      {/* Load unique Google Font for this client's name */}
      <link rel="stylesheet" href={getGoogleFontUrl(nameFont)} />

      {/* Alternating vertical bar */}
      <div className={`w-1 shrink-0 ${isEven ? 'bg-muted-foreground/30' : 'bg-muted-foreground/15'}`} />

      {/* Left column: client info */}
      <div className="flex flex-col justify-center p-4 w-[240px] shrink-0 border-r border-border">
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
            className="h-7 text-base font-bold p-1"
            style={nameFontStyle}
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
            className="text-base font-bold text-left text-wrap break-words hover:text-primary transition-colors"
            style={nameFontStyle}
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
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-500 focus:text-red-500"
                  onClick={() => setDeleteConfirmOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {isArchived && (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={handleArchiveToggle}
              >
                <ArchiveRestore className="h-3.5 w-3.5 mr-1.5" />
                Unarchive
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 text-red-500 hover:text-red-500"
                onClick={() => setDeleteConfirmOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            </div>
          )}

          {client.paused && !isArchived && (
            <span className="text-[10px] text-amber-500 font-medium">Paused</span>
          )}
        </div>
      </div>

      {/* Right column: timeline track + nodes */}
      <div className="flex-1 relative flex items-stretch justify-between py-5 pl-10 pr-14 min-h-[200px]">
        {/* Track: base dotted line */}
        <div
          className="absolute left-[72px] right-[88px] top-[calc(50%+10px)] -translate-y-1/2 h-[3px] rounded-full"
          style={{
            backgroundImage: 'repeating-linear-gradient(to right, var(--muted) 0, var(--muted) 6px, transparent 6px, transparent 12px)',
          }}
          aria-hidden
        />
        {/* Track: solid color overlay for done/failed segments */}
        <div
          className="absolute left-[72px] right-[88px] top-[calc(50%+10px)] -translate-y-1/2 h-[3px] rounded-full"
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

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <span className="font-semibold">{client.name}</span> and
              all associated experience data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
