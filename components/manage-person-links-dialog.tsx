'use client'

import { useEffect, useMemo, useState } from 'react'
import type { ClientPersonLink, ClientWithExperiences } from '@/lib/types'
import {
  createClientPersonLink,
  deleteClientPersonLink,
  updateClientPersonLink,
} from '@/lib/queries'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface ManagePersonLinksDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  client: ClientWithExperiences
  updateClientLocal: (
    clientId: string,
    updater: (c: ClientWithExperiences) => ClientWithExperiences
  ) => void
}

interface EditableLink {
  id: string
  display_name: string
  person_id: string
  sort_order: number
}

const TEMP_PREFIX = 'tmp-link-'

function makeTempId() {
  return `${TEMP_PREFIX}${crypto.randomUUID()}`
}

function isTempId(id: string): boolean {
  return id.startsWith(TEMP_PREFIX)
}

export function ManagePersonLinksDialog({
  open,
  onOpenChange,
  client,
  updateClientLocal,
}: ManagePersonLinksDialogProps) {
  const [links, setLinks] = useState<EditableLink[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setLinks(
      [...client.client_people_links]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((link) => ({
          id: link.id,
          display_name: link.display_name,
          person_id: link.person_id,
          sort_order: link.sort_order,
        }))
    )
    setError(null)
  }, [open, client.client_people_links])

  const hasLinks = links.length > 0
  const hasBlankFields = useMemo(
    () => links.some((link) => !link.display_name.trim() || !link.person_id.trim()),
    [links]
  )

  function updateLink(id: string, updates: Partial<EditableLink>) {
    setLinks((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
    setError(null)
  }

  function moveLink(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= links.length) return
    setLinks((prev) => {
      const next = [...prev]
      const current = next[index]
      next[index] = next[target]
      next[target] = current
      return next
    })
    setError(null)
  }

  function removeLink(id: string) {
    setLinks((prev) => prev.filter((item) => item.id !== id))
    setError(null)
  }

  function addLink() {
    setLinks((prev) => [
      ...prev,
      {
        id: makeTempId(),
        display_name: '',
        person_id: '',
        sort_order: prev.length,
      },
    ])
    setError(null)
  }

  async function handleSave() {
    setError(null)

    if (hasBlankFields) {
      setError('Each person link requires both a display name and person ID.')
      return
    }

    const normalized = links.map((link, index) => ({
      ...link,
      display_name: link.display_name.trim(),
      person_id: link.person_id.trim(),
      sort_order: index,
    }))

    const duplicateCheck = new Set<string>()
    for (const link of normalized) {
      const key = link.display_name
      if (duplicateCheck.has(key)) {
        setError(`Duplicate display name found: "${key}".`)
        return
      }
      duplicateCheck.add(key)
    }

    const previous = client.client_people_links
    updateClientLocal(client.id, (c) => ({
      ...c,
      client_people_links: normalized as ClientPersonLink[],
    }))

    setSaving(true)
    let failureCount = 0

    const previousById = new Map<string, ClientPersonLink>()
    for (const link of previous) previousById.set(link.id, link)

    const nextRealIds = new Set(normalized.filter((l) => !isTempId(l.id)).map((l) => l.id))
    const undeletedPrevious: ClientPersonLink[] = []
    for (const previousLink of previous) {
      if (nextRealIds.has(previousLink.id)) continue
      const ok = await deleteClientPersonLink(previousLink.id)
      if (!ok) {
        undeletedPrevious.push(previousLink)
        failureCount++
      }
    }

    const persistedLinks: ClientPersonLink[] = []
    for (const link of normalized) {
      if (isTempId(link.id)) {
        const created = await createClientPersonLink(client.id, {
          display_name: link.display_name,
          person_id: link.person_id,
          sort_order: link.sort_order,
        })
        if (created) {
          persistedLinks.push(created)
        } else {
          failureCount++
        }
        continue
      }

      const previousLink = previousById.get(link.id)
      const changed = previousLink
        ? previousLink.display_name !== link.display_name ||
          previousLink.person_id !== link.person_id ||
          previousLink.sort_order !== link.sort_order
        : true

      if (changed) {
        const ok = await updateClientPersonLink(link.id, {
          display_name: link.display_name,
          person_id: link.person_id,
          sort_order: link.sort_order,
        })
        if (!ok) {
          failureCount++
          if (previousLink) persistedLinks.push(previousLink)
          continue
        }
      }

      persistedLinks.push({
        ...(previousLink ?? {
          id: link.id,
          client_id: client.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
        display_name: link.display_name,
        person_id: link.person_id,
        sort_order: link.sort_order,
      })
    }

    const finalLinks = [...persistedLinks, ...undeletedPrevious].sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
      return a.display_name.localeCompare(b.display_name)
    })

    updateClientLocal(client.id, (c) => ({
      ...c,
      client_people_links: finalLinks,
    }))

    setSaving(false)

    if (failureCount > 0) {
      toast('Some person-link changes could not be saved. Please retry.')
      return
    }

    toast('Person links saved.')
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>Person ID Links</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Configure names shown in right-click and the Person IDs used for external links.
          </p>

          <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
            {!hasLinks && (
              <div className="rounded-md border border-dashed border-border p-3 text-sm text-muted-foreground">
                No links yet. Add one to make this row openable in C-Street Brain.
              </div>
            )}

            {links.map((link, index) => (
              <div key={link.id} className="rounded-md border border-border p-3">
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1.5">
                    <Label>Display Name</Label>
                    <Input
                      value={link.display_name}
                      onChange={(e) => updateLink(link.id, { display_name: e.target.value })}
                      placeholder="e.g. John Doe"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Person ID</Label>
                    <Input
                      value={link.person_id}
                      onChange={(e) => updateLink(link.id, { person_id: e.target.value })}
                      placeholder="e.g. f92c91b8-xxxx-xxxx-..."
                    />
                  </div>
                  <div className="flex items-end gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => moveLink(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9"
                      onClick={() => moveLink(index, 1)}
                      disabled={index === links.length - 1}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-9 w-9 text-red-500 hover:text-red-500"
                      onClick={() => removeLink(link.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        <DialogFooter className="justify-between sm:justify-between">
          <Button type="button" variant="outline" onClick={addLink}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add Person ID Link
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
