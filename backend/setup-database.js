require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function setupDatabase() {
  try {
    console.log('🔄 Creating database tables...');

    // Companies table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        api_key VARCHAR(100) UNIQUE NOT NULL,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password TEXT NOT NULL,
        phone VARCHAR(50),
        website VARCHAR(255),
        trade VARCHAR(100),
        commission_rate DECIMAL(4,2) DEFAULT 0.02,
        status VARCHAR(50) DEFAULT 'trial',
        stripe_customer_id VARCHAR(100),
        stripe_subscription_id VARCHAR(100),
        trial_ends_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Companies table created');

    // Leads table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS leads (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        customer_name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        postcode VARCHAR(20),
        project_budget VARCHAR(50),
        start_date VARCHAR(50),
        notes TEXT,
        original_image TEXT,
        generated_image TEXT,
        prompt TEXT,
        reference_code VARCHAR(20),
        status VARCHAR(50) DEFAULT 'new',
        project_value DECIMAL(10,2),
        won_date TIMESTAMP,
        follow_up_1_sent BOOLEAN DEFAULT false,
        follow_up_2_sent BOOLEAN DEFAULT false,
        follow_up_3_sent BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Leads table created');

    // Projects table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id),
        original_image VARCHAR(255),
        generated_image TEXT,
        prompt TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Projects table created');

    // Invoices table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
        invoice_number VARCHAR(50) UNIQUE NOT NULL,
        month VARCHAR(7) NOT NULL,
        total_leads INT DEFAULT 0,
        won_leads INT DEFAULT 0,
        total_revenue DECIMAL(10,2) DEFAULT 0,
        commission_amount DECIMAL(10,2) DEFAULT 0,
        status VARCHAR(50) DEFAULT 'draft',
        due_date DATE,
        paid_date DATE,
        stripe_invoice_id VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('✅ Invoices table created');

    // Create indexes for performance
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_companies_email ON companies(email);
      CREATE INDEX IF NOT EXISTS idx_leads_company_id ON leads(company_id);
      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
    `);
    console.log('✅ Indexes created');

    console.log('🎉 Database setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

setupDatabase();