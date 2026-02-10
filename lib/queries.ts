import { createClient } from '@/lib/supabase/client'
import type { ClientWithExperiences, ExperienceType } from './types'

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
  // Insert client
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .insert({ name, signed_on_date: signedOnDate })
    .select()
    .single()

  if (clientError || !client) {
    console.error('Error creating client:', clientError)
    return null
  }

  // Insert 3 experience rows
  const experiences: { client_id: string; experience_type: ExperienceType }[] = [
    { client_id: client.id, experience_type: 'hour24' },
    { client_id: client.id, experience_type: 'day14' },
    { client_id: client.id, experience_type: 'day30' },
  ]

  const { data: exps, error: expError } = await supabase
    .from('client_experiences')
    .insert(experiences)
    .select()

  if (expError) {
    console.error('Error creating experiences:', expError)
    return null
  }

  return {
    ...client,
    client_experiences: exps || [],
  } as ClientWithExperiences
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
