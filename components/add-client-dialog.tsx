'use client'

import { useState } from 'react'
import { format } from 'date-fns'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface AddClientDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddClient: (client: ClientWithExperiences) => void
}

export function AddClientDialog({
  open,
  onOpenChange,
  onAddClient,
}: AddClientDialogProps) {
  const [name, setName] = useState('')
  const [signedOnDate, setSignedOnDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !signedOnDate) return

    setLoading(true)
    const client = await createClientWithExperiences(name.trim(), signedOnDate)
    setLoading(false)

    if (client) {
      onAddClient(client)
      setName('')
      setSignedOnDate(format(new Date(), 'yyyy-MM-dd'))
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="client-name">Client Name</Label>
            <Input
              id="client-name"
              placeholder="e.g. John Smith"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="signed-on-date">Signed-on Date</Label>
            <Input
              id="signed-on-date"
              type="date"
              value={signedOnDate}
              onChange={(e) => setSignedOnDate(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()}>
              {loading ? 'Adding...' : 'Add Client'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
