'use client'

import { useState, useCallback } from 'react'
import type { ClientWithExperiences } from '@/lib/types'
import { createClientWithExperiences, upsertClientPersonLinksByName } from '@/lib/queries'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Copy, Check, Upload } from 'lucide-react'

const CLIENTS_SCHEMA_EXAMPLE = `[
  { "name": "Jane Doe", "signed_on_date": "2026-02-10", "initial_intake_date": "2026-02-11" },
  { "name": "John Smith", "signed_on_date": "2026-01-15" }
]`

const PERSON_LINKS_SCHEMA_EXAMPLE = `[
  {
    "client_name": "Johns | Kirin and Keith",
    "people": [
      { "display_name": "Kirin Johns", "person_id": "12345678901234567890" },
      { "display_name": "Keith Johns", "person_id": "98765432109876543210" }
    ]
  }
]`

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface ImportClientsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddClient: (client: ClientWithExperiences) => void
  onImportComplete?: () => void
}

interface ImportEntry {
  name: string
  signed_on_date: string
  initial_intake_date?: string
}

interface PersonLinkImportItem {
  display_name: string
  person_id: string
}

interface PersonLinksImportEntry {
  client_name: string
  people: PersonLinkImportItem[]
}

type ImportMode = 'clients' | 'person_links'

type ImportResult =
  | { mode: 'clients'; imported: number; failed: number }
  | {
      mode: 'person_links'
      matchedClients: number
      skippedClients: number
      failedClients: number
      peopleInserted: number
      peopleUpdated: number
      peopleUnchanged: number
    }

function validateClients(raw: string): { entries: ImportEntry[]; error: string | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { entries: [], error: 'Invalid JSON. Please check syntax and try again.' }
  }

  if (!Array.isArray(parsed)) {
    return { entries: [], error: 'JSON must be an array of objects.' }
  }

  if (parsed.length === 0) {
    return { entries: [], error: 'Array is empty — nothing to import.' }
  }

  const entries: ImportEntry[] = []

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i]
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { entries: [], error: `Item ${i + 1} is not an object.` }
    }
    const obj = item as Record<string, unknown>

    if (typeof obj.name !== 'string' || obj.name.trim().length === 0) {
      return { entries: [], error: `Item ${i + 1}: "name" must be a non-empty string.` }
    }
    if (typeof obj.signed_on_date !== 'string' || !DATE_RE.test(obj.signed_on_date)) {
      return {
        entries: [],
        error: `Item ${i + 1}: "signed_on_date" must be a date string in YYYY-MM-DD format.`,
      }
    }

    if (obj.initial_intake_date != null) {
      if (typeof obj.initial_intake_date !== 'string' || !DATE_RE.test(obj.initial_intake_date)) {
        return {
          entries: [],
          error: `Item ${i + 1}: "initial_intake_date" must be a date string in YYYY-MM-DD format when provided.`,
        }
      }
    }

    entries.push({
      name: obj.name.trim(),
      signed_on_date: obj.signed_on_date,
      initial_intake_date: typeof obj.initial_intake_date === 'string' ? obj.initial_intake_date : undefined,
    })
  }

  return { entries, error: null }
}

function validatePersonLinks(raw: string): { entries: PersonLinksImportEntry[]; error: string | null } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { entries: [], error: 'Invalid JSON. Please check syntax and try again.' }
  }

  if (!Array.isArray(parsed)) {
    return { entries: [], error: 'JSON must be an array of objects.' }
  }

  if (parsed.length === 0) {
    return { entries: [], error: 'Array is empty — nothing to import.' }
  }

  const entries: PersonLinksImportEntry[] = []

  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i]
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      return { entries: [], error: `Item ${i + 1} is not an object.` }
    }

    const obj = item as Record<string, unknown>
    if (typeof obj.client_name !== 'string' || obj.client_name.trim().length === 0) {
      return { entries: [], error: `Item ${i + 1}: "client_name" must be a non-empty string.` }
    }

    if (!Array.isArray(obj.people) || obj.people.length === 0) {
      return { entries: [], error: `Item ${i + 1}: "people" must be a non-empty array.` }
    }

    const people: PersonLinkImportItem[] = []
    for (let p = 0; p < obj.people.length; p++) {
      const person = obj.people[p]
      if (typeof person !== 'object' || person === null || Array.isArray(person)) {
        return { entries: [], error: `Item ${i + 1}, person ${p + 1}: must be an object.` }
      }
      const personObj = person as Record<string, unknown>
      if (typeof personObj.display_name !== 'string' || personObj.display_name.trim().length === 0) {
        return {
          entries: [],
          error: `Item ${i + 1}, person ${p + 1}: "display_name" must be a non-empty string.`,
        }
      }
      if (typeof personObj.person_id !== 'string' || personObj.person_id.trim().length === 0) {
        return {
          entries: [],
          error: `Item ${i + 1}, person ${p + 1}: "person_id" must be a non-empty string.`,
        }
      }
      people.push({
        display_name: personObj.display_name.trim(),
        person_id: personObj.person_id.trim(),
      })
    }

    entries.push({
      client_name: obj.client_name.trim(),
      people,
    })
  }

  return { entries, error: null }
}

export function ImportClientsDialog({
  open,
  onOpenChange,
  onAddClient,
  onImportComplete,
}: ImportClientsDialogProps) {
  const [jsonText, setJsonText] = useState('')
  const [mode, setMode] = useState<ImportMode>('clients')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = useCallback(() => {
    setJsonText('')
    setMode('clients')
    setError(null)
    setLoading(false)
    setResult(null)
    setCopied(false)
  }, [])

  function handleOpenChange(open: boolean) {
    if (!open) reset()
    onOpenChange(open)
  }

  async function handleCopySchema() {
    await navigator.clipboard.writeText(
      mode === 'clients' ? CLIENTS_SCHEMA_EXAMPLE : PERSON_LINKS_SCHEMA_EXAMPLE
    )
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleImport() {
    setError(null)
    setResult(null)

    setLoading(true)

    if (mode === 'clients') {
      const { entries, error: validationError } = validateClients(jsonText)
      if (validationError) {
        setLoading(false)
        setError(validationError)
        return
      }

      let imported = 0
      let failed = 0

      for (const entry of entries) {
        const client = await createClientWithExperiences(
          entry.name,
          entry.signed_on_date,
          entry.initial_intake_date ?? null
        )
        if (client) {
          onAddClient(client)
          imported++
        } else {
          failed++
        }
      }

      setLoading(false)
      setResult({ mode: 'clients', imported, failed })

      if (failed === 0) {
        setTimeout(() => {
          handleOpenChange(false)
        }, 1500)
      }
      return
    }

    const { entries, error: validationError } = validatePersonLinks(jsonText)
    if (validationError) {
      setLoading(false)
      setError(validationError)
      return
    }

    let matchedClients = 0
    let skippedClients = 0
    let failedClients = 0
    let peopleInserted = 0
    let peopleUpdated = 0
    let peopleUnchanged = 0

    for (const entry of entries) {
      const upsertResult = await upsertClientPersonLinksByName(entry.client_name, entry.people)
      if (!upsertResult.matchedClient) {
        skippedClients++
        continue
      }
      if (upsertResult.failed) {
        failedClients++
        continue
      }
      matchedClients++
      peopleInserted += upsertResult.inserted
      peopleUpdated += upsertResult.updated
      peopleUnchanged += upsertResult.unchanged
    }

    setLoading(false)
    setResult({
      mode: 'person_links',
      matchedClients,
      skippedClients,
      failedClients,
      peopleInserted,
      peopleUpdated,
      peopleUnchanged,
    })
    onImportComplete?.()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-hidden p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/60">
          <DialogTitle>Import JSON</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 overflow-y-auto min-h-0">
          <div className="space-y-2">
            <Label>Import Type</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={mode === 'clients' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setMode('clients')
                  setError(null)
                  setResult(null)
                }}
              >
                Clients
              </Button>
              <Button
                type="button"
                variant={mode === 'person_links' ? 'default' : 'outline'}
                size="sm"
                onClick={() => {
                  setMode('person_links')
                  setError(null)
                  setResult(null)
                }}
              >
                Person Links
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {mode === 'clients'
                ? 'Create new client rows from JSON.'
                : 'Bulk merge person links by exact client name and person display name.'}
            </p>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="json-input">Paste JSON</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={handleCopySchema}
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    Copy Schema
                  </>
                )}
              </Button>
            </div>
            <Textarea
              id="json-input"
              placeholder={mode === 'clients' ? CLIENTS_SCHEMA_EXAMPLE : PERSON_LINKS_SCHEMA_EXAMPLE}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setError(null)
                setResult(null)
              }}
              rows={12}
              className="font-mono text-sm max-h-[50vh]"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {result?.mode === 'clients' && (
            <p className="text-sm text-green-500">
              Imported {result.imported} client{result.imported !== 1 ? 's' : ''}
              {result.failed > 0 && (
                <span className="text-red-500">
                  {' '}({result.failed} failed)
                </span>
              )}
            </p>
          )}

          {result?.mode === 'person_links' && (
            <p className="text-sm text-green-500">
              Matched {result.matchedClients} client{result.matchedClients !== 1 ? 's' : ''}, inserted{' '}
              {result.peopleInserted}, updated {result.peopleUpdated}, unchanged {result.peopleUnchanged}
              {result.skippedClients > 0 && (
                <span className="text-red-500">
                  {' '}({result.skippedClients} client{result.skippedClients !== 1 ? 's' : ''} not found)
                </span>
              )}
              {result.failedClients > 0 && (
                <span className="text-red-500">
                  {' '}({result.failedClients} client import{result.failedClients !== 1 ? 's' : ''} failed)
                </span>
              )}
            </p>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border/60 bg-background">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleImport}
            disabled={loading || !jsonText.trim()}
          >
            {loading ? (
              'Importing...'
            ) : (
              <>
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                Import
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
