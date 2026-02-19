import pg from 'pg'
const { Client } = pg

const DB_PASSWORD = process.env.DB_PASSWORD || ''
const PROJECT_REF = 'jxovmexbnhixtohmrmxy'

const regions = ['us-east-1', 'us-west-1', 'us-west-2', 'eu-west-1', 'eu-central-1', 'ap-southeast-1', 'ap-northeast-1', 'ap-southeast-2']

function buildConfigs(password) {
  const configs = []
  for (const region of regions) {
    configs.push({
      name: `Pooler session ${region}`,
      host: `aws-0-${region}.pooler.supabase.com`,
      port: 5432,
      database: 'postgres',
      user: `postgres.${PROJECT_REF}`,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    })
    configs.push({
      name: `Pooler transaction ${region}`,
      host: `aws-0-${region}.pooler.supabase.com`,
      port: 6543,
      database: 'postgres',
      user: `postgres.${PROJECT_REF}`,
      password,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    })
  }
  configs.push({
    name: 'Direct connection',
    host: `db.${PROJECT_REF}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  })
  return configs
}

async function tryConnect(config) {
  const { name, ...pgConfig } = config
  const client = new Client(pgConfig)
  try {
    await client.connect()
    return client
  } catch (err) {
    const msg = err.message.includes('Tenant') ? 'tenant not found' :
                err.message.includes('password') ? 'wrong password' :
                err.message.includes('ENOTFOUND') ? 'host not found' :
                err.message.includes('timeout') ? 'timeout' :
                err.message.substring(0, 40)
    process.stdout.write(`  ${name}: ${msg}\n`)
    try { await client.end() } catch {}
    return null
  }
}

async function run() {
  if (!DB_PASSWORD) {
    console.error('Usage: DB_PASSWORD=your_database_password node scripts/apply-migration.mjs')
    console.error('\nFind your database password in the Supabase Dashboard:')
    console.error('Project Settings > Database > Connection string')
    process.exit(1)
  }

  console.log('Trying database connections...')
  const configs = buildConfigs(DB_PASSWORD)

  let client = null
  for (const config of configs) {
    client = await tryConnect(config)
    if (client) {
      console.log(`\nConnected via: ${config.name}\n`)
      break
    }
  }

  if (!client) {
    console.error('\nCould not connect to the database.')
    console.error('Make sure DB_PASSWORD is the database password from Supabase Dashboard > Project Settings > Database.')
    process.exit(1)
  }

  try {
    console.log('1/3 Adding monthly to experience_type enum...')
    await client.query(`ALTER TYPE experience_type ADD VALUE IF NOT EXISTS 'monthly'`)
    console.log('  Done.')

    console.log('2/3 Adding month_number column...')
    await client.query(`ALTER TABLE client_experiences ADD COLUMN IF NOT EXISTS month_number integer`)
    console.log('  Done.')
  } catch (err) {
    console.error('Step 1 failed:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }

  console.log('\nReconnecting for backfill (new enum value must be committed first)...')
  let client2 = null
  for (const config of configs) {
    client2 = await tryConnect(config)
    if (client2) break
  }
  if (!client2) {
    console.error('Could not reconnect for step 2.')
    process.exit(1)
  }

  try {
    console.log('3/3 Backfilling monthly experience rows...')
    const result = await client2.query(`
      INSERT INTO client_experiences (client_id, experience_type, month_number, status, notes, todos)
      SELECT c.id, 'monthly', m.month_number, 'pending', '', '[]'::jsonb
      FROM clients c
      CROSS JOIN generate_series(2, 18) AS m(month_number)
      WHERE NOT EXISTS (
        SELECT 1 FROM client_experiences ce
        WHERE ce.client_id = c.id
          AND ce.experience_type = 'monthly'
          AND ce.month_number = m.month_number
      )
    `)
    console.log(`  Done. Inserted ${result.rowCount} rows.`)
    console.log('\nMigration complete! Reload the app to see monthly experiences on the Ongoing tab.')
  } catch (err) {
    console.error('Step 2 (backfill) failed:', err.message)
    process.exit(1)
  } finally {
    await client2.end()
  }
}

run()
