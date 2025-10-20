require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function fixCompanyId() {
  try {
    console.log('🔄 Updating companies table to use TEXT id...');
    
    // Drop existing foreign key constraints
    await pool.query(`
      ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_company_id_fkey;
      ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_company_id_fkey;
      ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_company_id_fkey;
    `);
    
    // Change id column type to TEXT
    await pool.query(`
      ALTER TABLE companies ALTER COLUMN id TYPE TEXT;
    `);
    
    // Change foreign key columns to TEXT
    await pool.query(`
      ALTER TABLE leads ALTER COLUMN company_id TYPE TEXT;
      ALTER TABLE projects ALTER COLUMN company_id TYPE TEXT;
      ALTER TABLE invoices ALTER COLUMN company_id TYPE TEXT;
    `);
    
    // Re-add foreign key constraints
    await pool.query(`
      ALTER TABLE leads ADD CONSTRAINT leads_company_id_fkey 
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
      ALTER TABLE projects ADD CONSTRAINT projects_company_id_fkey 
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
      ALTER TABLE invoices ADD CONSTRAINT invoices_company_id_fkey 
        FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
    `);
    
    console.log('✅ Companies table updated successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to update table:', error);
    process.exit(1);
  }
}

fixCompanyId();