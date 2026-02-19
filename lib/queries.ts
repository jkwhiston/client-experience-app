import { createClient } from '@/lib/supabase/client'
import type { ClientWithExperiences, ExperienceType } from './types'
import { MONTHLY_MONTH_RANGE } from './types'

const supabase = createClient()

export async function fetchClients(): Promise<ClientWithExperiences[]> {
  const { data, error } = await supabase
    .from('clients')
    .select('*, client_experiences(*)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching clients:', error)
    return []
  }

  return (data as ClientWithExperiences[]) || []
}

export async function createClientWithExperiences(
  name: string,
  signedOnDate: string
): Promise<ClientWithExperiences | null> {
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({ name, signed_on_date: signedOnDate })
    .select()
    .single()

  if (clientError || !client) {
    console.error('Error creating client:', clientError)
    return null
  }

  const initialExperiences: { client_id: string; experience_type: ExperienceType }[] = [
    { client_id: client.id, experience_type: 'hour24' },
    { client_id: client.id, experience_type: 'day14' },
    { client_id: client.id, experience_type: 'day30' },
  ]

  const { data: initialExps, error: initialError } = await supabase
    .from('client_experiences')
    .insert(initialExperiences)
    .select()

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

  return {
    ...client,
    client_experiences: allExps,
  } as ClientWithExperiences
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
  const { error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', id)

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
