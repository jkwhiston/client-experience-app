import { createClient } from '@/lib/supabase/client'
import type { ClientWithExperiences, ExperienceType } from './types'
import { MONTHLY_MONTH_RANGE } from './types'

const supabase = createClient()

function normalizeClient(client: ClientWithExperiences): ClientWithExperiences {
  return {
    ...client,
    initial_intake_date: client.initial_intake_date ?? null,
    initial_intake_pulse_enabled: client.initial_intake_pulse_enabled ?? true,
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

  return ((data as ClientWithExperiences[]) || []).map(normalizeClient)
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
