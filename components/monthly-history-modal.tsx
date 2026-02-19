'use client'

import { useState, useMemo } from 'react'
import type { ClientWithExperiences, ClientExperience, DerivedStatus } from '@/lib/types'
import { EXPERIENCE_TYPES, EXPERIENCE_LABELS, getMonthlyLabel } from '@/lib/types'
import {
  getMonthlyExperiences,
  getActiveStage,
  getActiveStageMonthly,
  getEffectiveDueDate,
  getDueAtEffective,
  getNowEffective,
  getDerivedStatus,
  formatDueShort,
  formatCompletedShort,
} from '@/lib/deadlines'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { X, Check, Clock, AlertTriangle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ExperienceDetailModal } from './experience-detail-modal'
import { NotesModal } from './notes-modal'

interface MonthlyHistoryModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: ClientWithExperiences
  now: Date
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
}

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  pending: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  pending_inactive: { bg: 'bg-muted/30', text: 'text-muted-foreground', border: 'border-border' },
  done: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  done_late: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  failed: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
}

const STATUS_LABELS: Record<DerivedStatus, string> = {
  pending: 'Pending',
  done: 'Completed',
  done_late: 'Completed Late',
  failed: 'Overdue',
}

function getStyleKey(derived: DerivedStatus, isActive: boolean): string {
  if (derived === 'pending' && !isActive) return 'pending_inactive'
  return derived
}

function StatusIcon({ status, isActive = true }: { status: DerivedStatus; isActive?: boolean }) {
  switch (status) {
    case 'done':
      return <Check className="h-4 w-4 text-green-500" />
    case 'done_late':
      return <Check className="h-4 w-4 text-amber-500" />
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />
    case 'pending':
      return <Clock className={cn('h-4 w-4', isActive ? 'text-blue-500' : 'text-muted-foreground')} />
  }
}

export function MonthlyHistoryModal({
  open,
  onOpenChange,
  client,
  now,
  updateClientLocal,
}: MonthlyHistoryModalProps) {
  const [selectedExperience, setSelectedExperience] = useState<ClientExperience | null>(null)
  const [selectedIsActive, setSelectedIsActive] = useState(true)
  const [detailOpen, setDetailOpen] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)

  const monthlyExps = useMemo(() => getMonthlyExperiences(client), [client])
  const activeOnboardingStage = useMemo(() => getActiveStage(client, now), [client, now])
  const activeMonthlyStage = useMemo(() => getActiveStageMonthly(client, now), [client, now])

  const onboardingData = useMemo(() => {
    const nowEff = getNowEffective(client, now)
    return EXPERIENCE_TYPES.map((expType) => {
      const exp = client.client_experiences.find((e) => e.experience_type === expType)
      if (!exp) return null
      const dueAt = getEffectiveDueDate(exp, client.signed_on_date)
      const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
      const derived = getDerivedStatus({
        status: exp.status,
        completed_at: exp.completed_at,
        dueAt: dueAtEff,
        now: nowEff,
      })
      const isActive = exp.experience_type === activeOnboardingStage
      return { exp, dueAtEff, derived, isActive }
    }).filter(Boolean) as { exp: ClientExperience; dueAtEff: Date; derived: DerivedStatus; isActive: boolean }[]
  }, [client, now, activeOnboardingStage])

  const experienceData = useMemo(() => {
    const nowEff = getNowEffective(client, now)
    return monthlyExps.map((exp) => {
      const dueAt = getEffectiveDueDate(exp, client.signed_on_date)
      const dueAtEff = getDueAtEffective(dueAt, client.paused_total_seconds)
      const derived = getDerivedStatus({
        status: exp.status,
        completed_at: exp.completed_at,
        dueAt: dueAtEff,
        now: nowEff,
      })
      const isActive = exp.month_number === activeMonthlyStage
      return { exp, dueAtEff, derived, isActive }
    })
  }, [client, now, monthlyExps, activeMonthlyStage])

  const updatedClient = useMemo(() => client, [client])
  const updatedExperience = selectedExperience
    ? updatedClient.client_experiences.find((e) => e.id === selectedExperience.id) ?? selectedExperience
    : null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-lg max-h-[80vh] flex flex-col p-0 gap-0 overflow-hidden"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-lg font-semibold">
              {client.name} — Experience History
            </h2>
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* Onboarding section */}
            {onboardingData.length > 0 && (
              <div className="border-l-2 border-muted-foreground/25 pl-3 space-y-2">
                {onboardingData.map(({ exp, dueAtEff, derived, isActive }) => {
                  const styles = STATUS_STYLES[getStyleKey(derived, isActive)]
                  return (
                    <button
                      key={exp.id}
                      onClick={() => {
                        setSelectedExperience(exp)
                        setSelectedIsActive(isActive)
                        setDetailOpen(true)
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50',
                        styles.border,
                      )}
                    >
                      <StatusIcon status={derived} isActive={isActive} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {EXPERIENCE_LABELS[exp.experience_type]}
                          </span>
                          <span className={cn('text-xs font-medium', styles.text)}>
                            {STATUS_LABELS[derived]}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Due: {formatDueShort(dueAtEff)}
                          {(derived === 'done' || derived === 'done_late') && exp.completed_at && (
                            <span className="ml-2">
                              · {formatCompletedShort(exp.completed_at)}
                            </span>
                          )}
                        </div>
                      </div>

                      {exp.notes?.trim() && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            {/* Divider between onboarding and lifecycle */}
            {onboardingData.length > 0 && experienceData.length > 0 && (
              <div className="border-t border-border my-3" />
            )}

            {/* Lifecycle section */}
            <div className="space-y-2">
              {experienceData.map(({ exp, dueAtEff, derived, isActive }) => {
                const styles = STATUS_STYLES[getStyleKey(derived, isActive)]
                return (
                  <button
                    key={exp.id}
                    onClick={() => {
                      setSelectedExperience(exp)
                      setSelectedIsActive(isActive)
                      setDetailOpen(true)
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-muted/50',
                      styles.border,
                    )}
                  >
                    <StatusIcon status={derived} isActive={isActive} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">
                          {getMonthlyLabel(exp.month_number)}
                        </span>
                        <span className={cn('text-xs font-medium', styles.text)}>
                          {STATUS_LABELS[derived]}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Due: {formatDueShort(dueAtEff)}
                        {(derived === 'done' || derived === 'done_late') && exp.completed_at && (
                          <span className="ml-2">
                            · {formatCompletedShort(exp.completed_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    {exp.notes?.trim() && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {updatedExperience && (
        <>
          <ExperienceDetailModal
            open={detailOpen}
            onOpenChange={setDetailOpen}
            client={updatedClient}
            experience={updatedExperience}
            now={now}
            isActiveStage={selectedIsActive}
            onOpenNotes={() => {
              setDetailOpen(false)
              setNotesOpen(true)
            }}
            updateClientLocal={updateClientLocal}
          />
          <NotesModal
            open={notesOpen}
            onOpenChange={setNotesOpen}
            client={updatedClient}
            experience={updatedExperience}
            updateClientLocal={updateClientLocal}
          />
        </>
      )}
    </>
  )
}
