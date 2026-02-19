import { NextResponse } from 'next/server'
import pg from 'pg'

const STEP1_SQL = [
  `ALTER TYPE experience_type ADD VALUE IF NOT EXISTS 'monthly'`,
  `ALTER TABLE client_experiences ADD COLUMN IF NOT EXISTS month_number integer`,
]

const STEP2_SQL = [
  `DELETE FROM client_experiences WHERE experience_type = 'monthly'`,
  `ALTER TABLE client_experiences DROP CONSTRAINT IF EXISTS client_experiences_client_id_experience_type_key`,
  `CREATE UNIQUE INDEX IF NOT EXISTS client_experiences_client_id_experience_type_key ON client_experiences (client_id, experience_type, COALESCE(month_number, 0))`,
  `INSERT INTO client_experiences (client_id, experience_type, month_number, status, notes, todos)
   SELECT c.id, 'monthly', m.month_number, 'pending', '', '[]'::jsonb
   FROM clients c
   CROSS JOIN generate_series(2, 18) AS m(month_number)
   WHERE NOT EXISTS (
     SELECT 1 FROM client_experiences ce
     WHERE ce.client_id = c.id
       AND ce.experience_type = 'monthly'
       AND ce.month_number = m.month_number
   )`,
]

export async function GET() {
  return NextResponse.json({
    status: 'ready',
    instructions: 'POST with { "databaseUrl": "postgresql://..." }. Step 1 (DDL) runs first, then a second connection runs Step 2 (backfill) so the new enum value is committed before use.',
    step1: STEP1_SQL,
    step2: STEP2_SQL,
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const databaseUrl = body.databaseUrl || process.env.DATABASE_URL

    if (!databaseUrl) {
      return NextResponse.json(
        { error: 'Provide databaseUrl in request body or set DATABASE_URL env var' },
        { status: 400 }
      )
    }

    const clientOpts = {
      connectionString: databaseUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    }

    const client1 = new pg.Client(clientOpts)
    await client1.connect()
    try {
      for (const sql of STEP1_SQL) {
        await client1.query(sql)
      }
    } finally {
      await client1.end()
    }

    const client2 = new pg.Client(clientOpts)
    await client2.connect()
    try {
      let rowsInserted = 0
      for (const sql of STEP2_SQL) {
        const result = await client2.query(sql)
        if (sql.startsWith('INSERT')) rowsInserted = result.rowCount ?? 0
      }
      return NextResponse.json({
        success: true,
        rowsInserted,
        message: 'Migration applied successfully. Reload the app.',
      })
    } finally {
      await client2.end()
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
