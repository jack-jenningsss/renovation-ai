require('dotenv').config();
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function hashPassword(password) {
  return Buffer.from(password).toString('base64');
}

async function createDemoCompany() {
  try {
    const demoCompanyId = 'demo_company'; // Keep this ID for backwards compatibility
    
    // Check if demo company exists
    const existing = await pool.query('SELECT id FROM companies WHERE id = $1', [demoCompanyId]);
    
    if (existing.rows.length > 0) {
      console.log('✅ Demo company already exists');
      process.exit(0);
    }

    // Create demo company with the specific ID
    await pool.query(`
      INSERT INTO companies (id, api_key, name, email, password, phone, website, trade, status, trial_ends_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `, [
      demoCompanyId,
      'rva_demo_key',
      'Demo Bathrooms Ltd',
      'demo@example.com',
      hashPassword('demo123'),
      '07700 900123',
      'www.demobathrooms.com',
      'bathroom',
      'trial',
      new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year trial
    ]);

    console.log('✅ Demo company created successfully!');
    console.log('   Email: demo@example.com');
    console.log('   Password: demo123');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to create demo company:', error);
    process.exit(1);
  }
}

createDemoCompany();