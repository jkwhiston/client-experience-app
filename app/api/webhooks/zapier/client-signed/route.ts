import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

type ZapierClientSignedPayload = {
  source?: string
  event?: string
  payload_version?: number
  client_name?: string
  taxdome_slug?: string
  occurred_at_utc?: string
}

const LOS_ANGELES_TZ = 'America/Los_Angeles'
const WEBHOOK_SECRET_HEADER = 'x-webhook-secret'

function getLosAngelesDateString(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LOS_ANGELES_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date)
}

function getLosAngelesDateTimeString(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: LOS_ANGELES_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function validatePayload(body: ZapierClientSignedPayload): string | null {
  if (body.source !== 'zapier') return 'Invalid source; expected "zapier".'
  if (body.event !== 'client_signed') return 'Invalid event; expected "client_signed".'
  if (body.payload_version !== 1) return 'Invalid payload_version; expected 1.'
  if (!body.client_name || typeof body.client_name !== 'string') return 'client_name is required.'
  if (!body.occurred_at_utc || typeof body.occurred_at_utc !== 'string') return 'occurred_at_utc is required.'
  if (body.taxdome_slug != null && typeof body.taxdome_slug !== 'string') return 'taxdome_slug must be a string.'
  return null
}

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    endpoint: '/api/webhooks/zapier/client-signed',
    required_headers: ['content-type: application/json'],
    optional_headers: [`${WEBHOOK_SECRET_HEADER}: <ZAPIER_WEBHOOK_SECRET>`],
    expected_payload: {
      source: 'zapier',
      event: 'client_signed',
      payload_version: 1,
      client_name: 'Jane Doe',
      taxdome_slug: 'my-taxdome-slug',
      occurred_at_utc: '2026-02-24T22:40:00Z',
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.ZAPIER_WEBHOOK_SECRET
    if (expectedSecret) {
      const providedSecret = request.headers.get(WEBHOOK_SECRET_HEADER)
      if (!providedSecret || providedSecret !== expectedSecret) {
        return NextResponse.json({ error: 'Unauthorized webhook request.' }, { status: 401 })
      }
    }

    const body = (await request.json()) as ZapierClientSignedPayload
    const validationError = validatePayload(body)
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 })
    }

    const occurredAtUtc = new Date(body.occurred_at_utc as string)
    if (Number.isNaN(occurredAtUtc.getTime())) {
      return NextResponse.json({ error: 'occurred_at_utc must be a valid ISO date string.' }, { status: 400 })
    }

    const clientName = (body.client_name as string).trim()
    if (!clientName) {
      return NextResponse.json({ error: 'client_name cannot be blank.' }, { status: 400 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!supabaseUrl || !supabaseAnonKey) {
      return NextResponse.json({ error: 'Supabase environment variables are missing.' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    const signedOnDateLa = getLosAngelesDateString(occurredAtUtc)

    // Guard against duplicate client creation on webhook retries.
    const { data: existingClient, error: existingClientError } = await supabase
      .from('clients')
      .select('*')
      .eq('name', clientName)
      .eq('signed_on_date', signedOnDateLa)
      .limit(1)
      .maybeSingle()

    if (existingClientError) {
      return NextResponse.json({ error: existingClientError.message }, { status: 500 })
    }

    if (existingClient) {
      return NextResponse.json({
        success: true,
        created: false,
        client: existingClient,
        normalized: {
          client_name: clientName,
          taxdome_slug: body.taxdome_slug ?? null,
          occurred_at_utc: body.occurred_at_utc,
          occurred_at_la: getLosAngelesDateTimeString(occurredAtUtc),
          signed_on_date_la: signedOnDateLa,
        },
      })
    }

    const { data: client, error: clientError } = await supabase
      .from('clients')
      .insert({ name: clientName, signed_on_date: signedOnDateLa })
      .select()
      .single()

    if (clientError || !client) {
      return NextResponse.json({ error: clientError?.message ?? 'Failed to create client.' }, { status: 500 })
    }

    const initialExperiences = [
      { client_id: client.id, experience_type: 'hour24' },
      { client_id: client.id, experience_type: 'day14' },
      { client_id: client.id, experience_type: 'day30' },
    ]

    const { error: initialError } = await supabase.from('client_experiences').insert(initialExperiences)
    if (initialError) {
      return NextResponse.json({ error: initialError.message }, { status: 500 })
    }

    const monthlyExperiences: { client_id: string; experience_type: 'monthly'; month_number: number }[] = []
    for (let month = 2; month <= 18; month += 1) {
      monthlyExperiences.push({
        client_id: client.id,
        experience_type: 'monthly',
        month_number: month,
      })
    }

    // If monthly migration has not been applied yet, this insert can fail and we continue.
    await supabase.from('client_experiences').insert(monthlyExperiences)

    return NextResponse.json({
      success: true,
      created: true,
      client,
      normalized: {
        client_name: clientName,
        taxdome_slug: body.taxdome_slug ?? null,
        occurred_at_utc: body.occurred_at_utc,
        occurred_at_la: getLosAngelesDateTimeString(occurredAtUtc),
        signed_on_date_la: signedOnDateLa,
      },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
