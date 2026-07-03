// Read-only check: lists the columns of the `categories` table.
// Usage (PowerShell), passing your PRODUCTION connection string:
//   node scripts/check-columns.js "postgresql://user:pass@host:5432/dbname"
// Or set DATABASE_URL to the production URL and run without an argument.

const { Pool } = require('pg');

const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('No connection string. Pass it as an argument or set DATABASE_URL.');
  process.exit(1);
}

const pool = new Pool({ connectionString });

(async () => {
  try {
    const { rows } = await pool.query(
      `SELECT column_name
         FROM information_schema.columns
        WHERE table_name = 'categories'
        ORDER BY ordinal_position;`
    );
    console.log('Columns in "categories":');
    for (const r of rows) console.log('  -', r.column_name);

    const names = rows.map((r) => r.column_name);
    if (names.includes('limit_amount')) {
      console.log('\n=> DB has `limit_amount`. Just redeploy the backend; no DB change needed.');
    } else if (names.includes('monthly_limit')) {
      console.log('\n=> DB has `monthly_limit`. Run: ALTER TABLE categories RENAME COLUMN monthly_limit TO limit_amount;  then redeploy.');
    } else {
      console.log('\n=> Neither column found. Share this output and we\'ll figure out the next step.');
    }
  } catch (err) {
    console.error('Query failed:', err.message);
  } finally {
    await pool.end();
  }
})();
