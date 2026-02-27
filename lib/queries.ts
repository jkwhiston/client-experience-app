import { createClient } from '@/lib/supabase/client'
import type { ClientPersonLink, ClientWithExperiences, ExperienceType } from './types'
import { MONTHLY_MONTH_RANGE } from './types'

const supabase = createClient()

function normalizeClient(client: ClientWithExperiences): ClientWithExperiences {
  const personLinks = [...(client.client_people_links ?? [])].sort((a, b) => {
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
    return a.display_name.localeCompare(b.display_name)
  })

  return {
    ...client,
    initial_intake_date: client.initial_intake_date ?? null,
    initial_intake_pulse_enabled: client.initial_intake_pulse_enabled ?? true,
    client_people_links: personLinks,
    client_experiences: client.client_experiences.map((exp) => {
      // Backward-compat: older databases still store the middle onboarding node as "day14".
      // Normalize it to "day10" in app state so rendering and deadline logic stay consistent.
      if ((exp.experience_type as unknown as string) === 'day14') {
        return { ...exp, experience_type: 'day10' as ExperienceType }
      }
      return exp
    }),
  }
}

function hasMissingIntakeColumnsError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase()
  return message.includes('initial_intake_date') || message.includes('initial_intake_pulse_enabled')
}

function hasMissingDay10EnumError(error: unknown): boolean {
  const message = String((error as { message?: string } | null)?.message ?? '').toLowerCase()
  return message.includes('day10') && message.includes('experience_type')
}

export async function fetchClients(): Promise<ClientWithExperiences[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*, client_experiences(*)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching clients:', error)
    return []
  }

  const clients = ((data as ClientWithExperiences[]) || []).map((client) => ({
    ...client,
    client_people_links: [],
  }))

  if (clients.length === 0) return clients.map(normalizeClient)

  const clientIds = clients.map((client) => client.id)
  const { data: peopleLinks, error: peopleLinksError } = await supabase
    .from('client_people_links')
    .select('*')
    .in('client_id', clientIds)

  // Backward-compat: if table not migrated yet, keep app usable with empty links.
  if (peopleLinksError) {
    if (!String(peopleLinksError.message || '').toLowerCase().includes('client_people_links')) {
      console.error('Error fetching client person links:', peopleLinksError)
    }
    return clients.map(normalizeClient)
  }

  const linksByClientId = new Map<string, ClientPersonLink[]>()
  for (const row of (peopleLinks as ClientPersonLink[] | null) ?? []) {
    const existing = linksByClientId.get(row.client_id) ?? []
    existing.push(row)
    linksByClientId.set(row.client_id, existing)
  }

  return clients.map((client) =>
    normalizeClient({
      ...client,
      client_people_links: linksByClientId.get(client.id) ?? [],
    })
  )
}

export async function createClientWithExperiences(
  name: string,
  signedOnDate: string,
  initialIntakeDate?: string | null,
  initialIntakePulseEnabled: boolean = true
): Promise<ClientWithExperiences | null> {
  let { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({
      name,
      signed_on_date: signedOnDate,
      initial_intake_date: initialIntakeDate ?? null,
      initial_intake_pulse_enabled: initialIntakePulseEnabled,
    })
    .select()
    .single()

  // Backward-compat for DBs where intake columns haven't been migrated yet.
  if (clientError && hasMissingIntakeColumnsError(clientError)) {
    const fallback = await supabase
      .from('clients')
      .insert({ name, signed_on_date: signedOnDate })
      .select()
      .single()
    client = fallback.data
    clientError = fallback.error
  }

  if (clientError || !client) {
    console.error('Error creating client:', clientError)
    return null
  }

  let initialExperiences: { client_id: string; experience_type: ExperienceType }[] = [
    { client_id: client.id, experience_type: 'hour24' },
    { client_id: client.id, experience_type: 'day10' },
    { client_id: client.id, experience_type: 'day30' },
  ]

  let { data: initialExps, error: initialError } = await supabase
    .from('client_experiences')
    .insert(initialExperiences)
    .select()

  // Backward-compat for DBs where the enum value is still day14.
  if (initialError && hasMissingDay10EnumError(initialError)) {
    initialExperiences = [
      { client_id: client.id, experience_type: 'hour24' },
      { client_id: client.id, experience_type: 'day14' as ExperienceType },
      { client_id: client.id, experience_type: 'day30' },
    ]
    const fallbackInitial = await supabase
      .from('client_experiences')
      .insert(initialExperiences)
      .select()
    initialExps = fallbackInitial.data
    initialError = fallbackInitial.error
  }

  if (initialError) {
    console.error('Error creating initial experiences:', initialError)
    return null
  }

  let allExps = initialExps || []

  const monthlyExperiences: { client_id: string; experience_type: ExperienceType; month_number: number }[] = []
  for (let m = MONTHLY_MONTH_RANGE.min; m <= MONTHLY_MONTH_RANGE.max; m++) {
    monthlyExperiences.push({ client_id: client.id, experience_type: 'monthly', month_number: m })
  }

  const { data: monthlyExps, error: monthlyError } = await supabase
    .from('client_experiences')
    .insert(monthlyExperiences)
    .select()

  if (!monthlyError && monthlyExps) {
    allExps = [...allExps, ...monthlyExps]
  }

  return normalizeClient({
    ...client,
    client_experiences: allExps,
    client_people_links: [],
  } as ClientWithExperiences)
}

/**
 * Backfill monthly experiences for clients that were created before the ongoing feature.
 * Checks each client and creates any missing monthly experience rows.
 */
export async function backfillMonthlyExperiences(
  clients: ClientWithExperiences[]
): Promise<ClientWithExperiences[]> {
  const toInsert: { client_id: string; experience_type: ExperienceType; month_number: number }[] = []

  for (const client of clients) {
    const existingMonths = new Set(
      client.client_experiences
        .filter((e) => e.experience_type === 'monthly')
        .map((e) => e.month_number)
    )

    for (let m = MONTHLY_MONTH_RANGE.min; m <= MONTHLY_MONTH_RANGE.max; m++) {
      if (!existingMonths.has(m)) {
        toInsert.push({ client_id: client.id, experience_type: 'monthly', month_number: m })
      }
    }
  }

  if (toInsert.length === 0) return clients

  const { data: newExps, error } = await supabase
    .from('client_experiences')
    .insert(toInsert)
    .select()

  if (error) {
    console.error('Error backfilling monthly experiences:', error)
    return clients
  }

  if (!newExps || newExps.length === 0) return clients

  const newExpsMap = new Map<string, typeof newExps>()
  for (const exp of newExps) {
    const existing = newExpsMap.get(exp.client_id) || []
    existing.push(exp)
    newExpsMap.set(exp.client_id, existing)
  }

  return clients.map((c) => {
    const additions = newExpsMap.get(c.id)
    if (!additions) return c
    return { ...c, client_experiences: [...c.client_experiences, ...additions] }
  })
}

/**
 * Check if the monthly experiences migration has been applied.
 * Returns true if the month_number column exists and monthly experiences can be created.
 */
export async function checkMonthlyMigration(): Promise<boolean> {
  const { error } = await supabase
    .from('client_experiences')
    .select('month_number')
    .limit(1)

  return !error
}

export async function updateClient(
  id: string,
  updates: Record<string, unknown>
): Promise<boolean> {
  let { error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)

  if (error && hasMissingIntakeColumnsError(error)) {
    const fallbackUpdates = { ...updates }
    delete fallbackUpdates.initial_intake_date
    delete fallbackUpdates.initial_intake_pulse_enabled

    // If nothing remains to update, the caller is trying to persist intake-only fields
    // on a DB that does not yet have those columns.
    if (Object.keys(fallbackUpdates).length === 0) {
      return false
    }

    const fallback = await supabase
      .from('clients')
      .update(fallbackUpdates)
      .eq('id', id)
    error = fallback.error
  }

  if (error) {
    console.error('Error updating client:', error)
    return false
  }
  return true
}

export async function updateExperience(
  id: string,
  updates: Record<string, unknown>
): Promise<boolean> {
  const { error } = await supabase
    .from('client_experiences')
    .update(updates)
    .eq('id', id)

  if (error) {
    console.error('Error updating experience:', error)
    return false
  }
  return true
}

export async function deleteClient(id: string): Promise<boolean> {
  const { error: expError } = await supabase
    .from('client_experiences')
    .delete()
    .eq('client_id', id)

  if (expError) {
    console.error('Error deleting client experiences:', expError)
    return false
  }

  const { error } = await supabase
    .from('clients')
    .delete()
    .eq('id', id)

  if (error) {
    console.error('Error deleting client:', error)
    return false
  }
  return true
}

export async function createClientPersonLink(
  clientId: string,
  payload: { display_name: string; person_id: string; sort_order?: number }
): Promise<ClientPersonLink | null> {
  const displayName = payload.display_name.trim()
  const personId = payload.person_id.trim()
  const sortOrder = payload.sort_order ?? 0

  if (!displayName || !personId) return null

  const { data, error } = await supabase
    .from('client_people_links')
    .insert({
      client_id: clientId,
      display_name: displayName,
      person_id: personId,
      sort_order: sortOrder,
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating client person link:', error)
    return null
  }

  return data as ClientPersonLink
}

export async function updateClientPersonLink(
  linkId: string,
  updates: { display_name?: string; person_id?: string; sort_order?: number }
): Promise<boolean> {
  const normalized: { display_name?: string; person_id?: string; sort_order?: number } = {}
  if (typeof updates.display_name === 'string') normalized.display_name = updates.display_name.trim()
  if (typeof updates.person_id === 'string') normalized.person_id = updates.person_id.trim()
  if (typeof updates.sort_order === 'number') normalized.sort_order = updates.sort_order

  if (normalized.display_name != null && normalized.display_name.length === 0) return false
  if (normalized.person_id != null && normalized.person_id.length === 0) return false

  const { error } = await supabase
    .from('client_people_links')
    .update(normalized)
    .eq('id', linkId)

  if (error) {
    console.error('Error updating client person link:', error)
    return false
  }

  return true
}

export async function deleteClientPersonLink(linkId: string): Promise<boolean> {
  const { error } = await supabase
    .from('client_people_links')
    .delete()
    .eq('id', linkId)

  if (error) {
    console.error('Error deleting client person link:', error)
    return false
  }

  return true
}

export interface PersonLinkImportEntry {
  display_name: string
  person_id: string
}

export interface UpsertClientPersonLinksByNameResult {
  matchedClient: boolean
  failed: boolean
  inserted: number
  updated: number
  unchanged: number
  errorMessage?: string
}

export async function upsertClientPersonLinksByName(
  clientName: string,
  entries: PersonLinkImportEntry[]
): Promise<UpsertClientPersonLinksByNameResult> {
  const normalizedName = clientName.trim()
  if (!normalizedName) {
    return { matchedClient: false, failed: false, inserted: 0, updated: 0, unchanged: 0 }
  }

  const { data: clients, error: clientError } = await supabase
    .from('clients')
    .select('id')
    .eq('name', normalizedName)
    .order('created_at', { ascending: false })
    .limit(1)

  if (clientError) {
    console.error('Error finding client for person-link upsert:', clientError)
    return {
      matchedClient: false,
      failed: true,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      errorMessage: String(clientError.message || 'Could not find client'),
    }
  }

  const clientId = clients?.[0]?.id as string | undefined
  if (!clientId) {
    return { matchedClient: false, failed: false, inserted: 0, updated: 0, unchanged: 0 }
  }

  const normalizedEntries = entries
    .map((entry, index) => ({
      client_id: clientId,
      display_name: entry.display_name.trim(),
      person_id: entry.person_id.trim(),
      sort_order: index,
    }))
    .filter((entry) => entry.display_name.length > 0 && entry.person_id.length > 0)

  if (normalizedEntries.length === 0) {
    return { matchedClient: true, failed: false, inserted: 0, updated: 0, unchanged: 0 }
  }

  const dedupedByDisplayName = new Map<string, typeof normalizedEntries[number]>()
  for (const entry of normalizedEntries) dedupedByDisplayName.set(entry.display_name, entry)
  const upsertRows = [...dedupedByDisplayName.values()]

  const { data: existing, error: existingError } = await supabase
    .from('client_people_links')
    .select('id, display_name, person_id')
    .eq('client_id', clientId)

  let inserted = upsertRows.length
  let updated = 0
  let unchanged = 0

  if (existingError) {
    console.error('Error loading existing person links:', existingError)
  } else {
    const byDisplayName = new Map<string, { person_id: string }>()
    for (const row of (existing as Pick<ClientPersonLink, 'display_name' | 'person_id'>[] | null) ?? []) {
      byDisplayName.set(row.display_name, { person_id: row.person_id })
    }

    inserted = 0
    updated = 0
    unchanged = 0
    for (const row of upsertRows) {
      const current = byDisplayName.get(row.display_name)
      if (!current) {
        inserted++
      } else if (current.person_id === row.person_id) {
        unchanged++
      } else {
        updated++
      }
    }
  }

  const { error: upsertError } = await supabase
    .from('client_people_links')
    .upsert(upsertRows, { onConflict: 'client_id,display_name' })

  if (upsertError) {
    console.error('Error upserting person links:', upsertError)
    return {
      matchedClient: true,
      failed: true,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      errorMessage: String(upsertError.message || 'Could not save person links'),
    }
  }

  return { matchedClient: true, failed: false, inserted, updated, unchanged }
}
