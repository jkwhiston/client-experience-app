'use client'

import { useState, useCallback } from 'react'
import type { ClientWithExperiences } from '@/lib/types'
import { createClientWithExperiences } from '@/lib/queries'
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

const SCHEMA_EXAMPLE = `[
  { "name": "Jane Doe", "signed_on_date": "2026-02-10", "initial_intake_date": "2026-02-11" },
  { "name": "John Smith", "signed_on_date": "2026-01-15" }
]`

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface ImportClientsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddClient: (client: ClientWithExperiences) => void
}

interface ImportEntry {
  name: string
  signed_on_date: string
  initial_intake_date?: string
}

function validate(raw: string): { entries: ImportEntry[]; error: string | null } {
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

export function ImportClientsDialog({
  open,
  onOpenChange,
  onAddClient,
}: ImportClientsDialogProps) {
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = useCallback(() => {
    setJsonText('')
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
    await navigator.clipboard.writeText(SCHEMA_EXAMPLE)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleImport() {
    setError(null)
    setResult(null)

    const { entries, error: validationError } = validate(jsonText)
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)

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
    setResult({ imported, failed })

    if (failed === 0) {
      setTimeout(() => {
        handleOpenChange(false)
      }, 1500)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Import Clients from JSON</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
              placeholder={SCHEMA_EXAMPLE}
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value)
                setError(null)
                setResult(null)
              }}
              rows={8}
              className="font-mono text-sm"
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          {result && (
            <p className="text-sm text-green-500">
              Imported {result.imported} client{result.imported !== 1 ? 's' : ''}
              {result.failed > 0 && (
                <span className="text-red-500">
                  {' '}({result.failed} failed)
                </span>
              )}
            </p>
          )}
        </div>

        <DialogFooter>
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
