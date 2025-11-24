const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const sslPreference = (process.env.DATABASE_SSL || process.env.PGSSLMODE || '').toLowerCase();

// Determine whether SSL is required. Most hosted Postgres vendors enforce TLS,
// so we enable it automatically for non-local hosts while still allowing the
// developer to override the behaviour with DATABASE_SSL / PGSSLMODE.
const truthyValues = new Set(['1', 'true', 'require', 'required', 'verify-ca', 'verify-full', 'prefer']);
const falsyValues = new Set(['0', 'false', 'disable', 'disabled', 'off']);

const getHostFromConnectionString = (urlString) => {
  if (!urlString) return '';
  try {
    return new URL(urlString).hostname || '';
  } catch {
    return '';
  }
};

const host = getHostFromConnectionString(connectionString);
const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(host);

let shouldUseSSL;
if (truthyValues.has(sslPreference)) {
  shouldUseSSL = true;
} else if (falsyValues.has(sslPreference)) {
  shouldUseSSL = false;
} else {
  shouldUseSSL = Boolean(connectionString && !isLocalHost);
}

const pool = new Pool({
  connectionString,
  ssl: shouldUseSSL ? { rejectUnauthorized: false } : false
});

if (!connectionString) {
  console.warn('⚠️  DATABASE_URL is not set. Database features will be unavailable until it is configured.');
} else {
  pool
    .query('SELECT NOW()')
    .then(() => {
      console.log('✅ Database connected');
      if (shouldUseSSL) {
        console.log('🔐 Database SSL: enabled');
      } else {
        console.log('🔐 Database SSL: disabled');
      }
    })
    .catch((err) => {
      console.error('❌ Database connection failed:', err);
      if (err?.code === 'ECONNRESET') {
        console.error(
          '   The remote server closed the connection. If you are using a hosted Postgres provider, set DATABASE_SSL=true or append `?sslmode=require` to your DATABASE_URL.'
        );
      }
    });
}

module.exports = pool;
