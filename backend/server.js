const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { v4: uuidv4 } = require('uuid');
const mime = require('mime-types');
const db = require('./database');


// In-memory storage for lightweight demo/testing usage
// In production these should be persisted in the database (the app also uses the DB in many routes)
const companies = new Map();
const leads = [];

const app = express();
const PORT = 3000;

const emailAutomation = require('./email-automation');

// Start email automation
console.log('✅ Email automation started');

// Initialize Gemini client
const geminiClient = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-1.5-flash';
let geminiImageModel = null;

const getGeminiImageModel = () => {
  if (!geminiClient) {
    return null;
  }
  if (!geminiImageModel) {
    geminiImageModel = geminiClient.getGenerativeModel({
      model: GEMINI_IMAGE_MODEL,
      generationConfig: {
        responseMimeType: 'image/png',
        temperature: 0.4,
        topP: 0.95
      }
    });
  }
  return geminiImageModel;
};

// Ensure Gemini client initialization
if (!geminiClient) {
  console.error('Gemini API key is missing. Please set GEMINI_API_KEY in the environment variables.');
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir);
  ['dashboard', 'widget', 'landing-page'].forEach(dir => {
    const dirPath = path.join(publicDir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath);
    }
  });
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/dashboard', express.static(path.join(__dirname, 'public/dashboard')));
app.use('/widget', express.static(path.join(__dirname, 'public/widget')));
app.use('/landing-page', express.static(path.join(__dirname, 'public/landing-page')));

// Serve uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Root redirect
app.get('/', (req, res) => {
  res.redirect('/dashboard/login.html');
});

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ROUTE 1: Test endpoint
app.get('/api/health', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW()');
    res.json({ 
      status: 'Server is running!',
      database: 'Connected',
      time: result.rows[0].now
    });
  } catch (error) {
    res.json({ 
      status: 'Server is running!',
      database: 'Disconnected',
      error: error.message
    });
  }
});

// ROUTE 2: Upload image
app.post('/api/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }

    const uploadId = uuidv4();
    const fileInfo = {
      id: uploadId,
      filename: req.file.filename,
      path: req.file.path,
      originalName: req.file.originalname,
      size: req.file.size
    };

    res.json({
      success: true,
      uploadId: uploadId,
      filename: req.file.filename,
      message: 'Image uploaded successfully'
    });
    } catch (error) {
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  });
  
// ROUTE 3: Generate renovation image
app.post('/api/generate', async (req, res) => {
  try {
    const model = getGeminiImageModel();
    if (!model) {
      return res.status(500).json({ error: 'Gemini client is not initialized. Check your API key.' });
    }

    const { filename, prompt } = req.body;

    if (!filename || !prompt) {
      return res.status(400).json({ error: 'Missing filename or prompt' });
    }

    // Read the uploaded image
    const imagePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = mime.lookup(imagePath) || 'image/jpeg';

    const promptParts = [
      {
        inlineData: {
          data: base64Image,
          mimeType
        }
      },
      {
        text: `You are a high-end renovation visualization specialist. Starting from the previous photo, apply this transformation: ${prompt}. Keep the structure realistic, use accurate perspective, and output only the updated photo.`
      }
    ];

    // Call Gemini API
    const geminiResult = await model.generateContent(promptParts);
    const imagePart = geminiResult?.response?.candidates
      ?.flatMap(candidate => candidate?.content?.parts || [])
      ?.find(part => part?.inlineData?.data);

    if (!imagePart?.inlineData?.data) {
      throw new Error('Gemini did not return image data');
    }

    const generatedBuffer = Buffer.from(imagePart.inlineData.data, 'base64');
    const generatedFilename = `generated-${uuidv4()}.png`;
    const generatedPath = path.join(uploadsDir, generatedFilename);
    fs.writeFileSync(generatedPath, generatedBuffer);

    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.get('host');
    const generatedImageUrl = `${protocol}://${host}/uploads/${generatedFilename}`;

    res.json({
      success: true,
      generatedImageUrl,
      filename: generatedFilename
    });
  } catch (error) {
    console.error('Image generation error:', error);
    res.status(500).json({ error: 'Image generation failed', message: error.message });
  }
});

// ROUTE 4: Get all projects
app.get('/api/projects', async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM projects ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ projects: result.rows });
  } catch (error) {
    console.error('Projects fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch projects' });
  }
});

// Remove this as we'll place it at the end of the file

// ROUTE 5: Get prompts by trade
app.get('/api/prompts/:trade', (req, res) => {
  const { trade } = req.params;
  
  const promptLibrary = {
    bathroom: [
      'transformed into a modern luxury bathroom with walk-in rainfall shower, marble tiles, and brushed brass fixtures',
      'transformed into a contemporary bathroom with freestanding bathtub, natural stone, and minimalist design',
      'transformed into a spa-style bathroom with wood accents, pebble flooring, and ambient lighting',
      'transformed into a compact modern bathroom with space-saving fixtures and white subway tiles'
    ],
    kitchen: [
      'transformed into a modern kitchen with white shaker cabinets, quartz waterfall island, and stainless steel appliances',
      'transformed into an industrial-style kitchen with exposed brick, dark cabinets, and concrete countertops',
      'transformed into a Scandinavian minimalist kitchen with light wood, white surfaces, and clean lines',
      'transformed into a traditional country kitchen with farmhouse sink, wooden beams, and vintage fixtures'
    ],
    roofing: [
      'with new slate roof tiles and copper flashing, architectural exterior',
      'with modern standing seam metal roof, contemporary design',
      'with architectural shingles and new dormers, traditional style',
      'with clay tile roofing, Mediterranean style'
    ],
    joinery: [
      'with custom built-in oak shelving and cabinetry, high-end carpentry',
      'with new hardwood flooring throughout, professional installation',
      'with bespoke wooden staircase and handrails, artisan craftsmanship',
      'with feature wall paneling and timber details'
    ],
    general: [
      'transformed into an open-plan living space with exposed beams and modern finishes',
      'with extension featuring bi-fold doors and natural light',
      'transformed with loft conversion including skylights and modern insulation',
      'renovated with contemporary interior design, neutral palette, and quality finishes'
    ]
  };

  const prompts = promptLibrary[trade.toLowerCase()] || promptLibrary.general;
  res.json({ prompts });
});

// ============================================
// NEW ROUTES FOR WIDGET & LEAD MANAGEMENT
// ============================================

// ROUTE 6: Register a new company
app.post('/api/company/register', (req, res) => {
  const { name, email, phone, website, trade } = req.body;
  
  const companyId = `company_${uuidv4()}`;
  const apiKey = `rva_${uuidv4()}`;
  
  const company = {
    id: companyId,
    apiKey: apiKey,
    name,
    email,
    phone,
    website,
    trade,
    commissionRate: 0.02, // 2%
    status: 'trial', // trial, active, paused
    createdAt: new Date().toISOString(),
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() // 14 days
  };
  
  companies.set(companyId, company);
  
  res.json({
    success: true,
    companyId: companyId,
    apiKey: apiKey,
    message: 'Company registered successfully'
  });
});
// ROUTE 7: Capture lead from widget (DATABASE VERSION)
app.post('/api/lead', async (req, res) => {
  try {
    const {
      companyId,
      customerName,
      email,
      phone,
      originalImage,
      generatedImage,
      prompt
    } = req.body;

    // Validate required fields
    if (!companyId || !customerName || !email || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Generate unique reference code
    const leadId = uuidv4();
    const referenceCode = `RV-${leadId.substring(0, 8).toUpperCase()}`;

    // Create lead in database
    await db.query(
      `INSERT INTO leads (id, company_id, customer_name, email, phone, 
                          original_image, generated_image, prompt, reference_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'new')`,
      [leadId, companyId, customerName, email, phone, originalImage, generatedImage, prompt, referenceCode]
    );

    console.log(`📧 New lead captured: ${customerName} (${email}) - Ref: ${referenceCode}`);

    // TODO: Send emails (we'll add this next)

    res.json({
      success: true,
      leadId: leadId,
      referenceCode: referenceCode,
      message: 'Lead captured successfully'
    });

  } catch (error) {
    console.error('Lead capture error:', error);
    res.status(500).json({ error: 'Failed to capture lead' });
  }
});

// ROUTE 8: Get leads for a company
app.get('/api/company/:companyId/leads', (req, res) => {
  const { companyId } = req.params;
  const { status } = req.query;

  let companyLeads = leads.filter(lead => lead.companyId === companyId);

  if (status) {
    companyLeads = companyLeads.filter(lead => lead.status === status);
  }

  // Sort by date (newest first)
  companyLeads.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    success: true,
    leads: companyLeads,
    total: companyLeads.length
  });
});

// ROUTE 9: Update lead status
app.put('/api/lead/:leadId', (req, res) => {
  const { leadId } = req.params;
  const { status, projectValue } = req.body;

  const lead = leads.find(l => l.id === leadId);

  if (!lead) {
    return res.status(404).json({ error: 'Lead not found' });
  }

  if (status) {
    lead.status = status;
  }

  if (projectValue) {
    lead.projectValue = projectValue;
    if (status === 'won') {
      lead.wonDate = new Date().toISOString();
    }
  }

  lead.updatedAt = new Date().toISOString();

  res.json({
    success: true,
    lead: lead
  });
});

// ROUTE 10: Get company dashboard stats
app.get('/api/company/:companyId/stats', (req, res) => {
  const { companyId } = req.params;
  const { month } = req.query; // Format: YYYY-MM

  let companyLeads = leads.filter(lead => lead.companyId === companyId);

  if (month) {
    companyLeads = companyLeads.filter(lead => 
      lead.createdAt.startsWith(month)
    );
  }

  const totalLeads = companyLeads.length;
  const wonLeads = companyLeads.filter(l => l.status === 'won');
  const totalRevenue = wonLeads.reduce((sum, lead) => sum + (lead.projectValue || 0), 0);
  
  const company = companies.get(companyId);
  const commissionRate = company?.commissionRate || 0.02;
  const commissionAmount = totalRevenue * commissionRate;

  const conversionRate = totalLeads > 0 ? (wonLeads.length / totalLeads * 100).toFixed(1) : 0;

  res.json({
    success: true,
    stats: {
      totalLeads,
      newLeads: companyLeads.filter(l => l.status === 'new').length,
      quotedLeads: companyLeads.filter(l => l.status === 'quoted').length,
      wonLeads: wonLeads.length,
      lostLeads: companyLeads.filter(l => l.status === 'lost').length,
      totalRevenue,
      commissionAmount,
      conversionRate,
      averageProjectValue: wonLeads.length > 0 ? (totalRevenue / wonLeads.length).toFixed(2) : 0
    }
  });
});

// ROUTE 11: Get company details
app.get('/api/company/:companyId', (req, res) => {
  const { companyId } = req.params;
  const company = companies.get(companyId);

  if (!company) {
    return res.status(404).json({ error: 'Company not found' });
  }

  res.json({
    success: true,
    company: company
  });
});

// ROUTE 12: Get embed code for company
app.get('/api/company/:companyId/embed', (req, res) => {
  const { companyId } = req.params;
  
  const embedCode = `<!-- Renovation Vision Widget -->
<div id="renovation-vision-widget"></div>
<script>
  window.RENOVATION_VISION_COMPANY_ID = '${companyId}';
</script>
<script src="https://yourdomain.com/widget/embed.js"></script>
<!-- End Renovation Vision Widget -->`;

  res.json({
    success: true,
    embedCode: embedCode
  });
});

// ============================================
// AUTHENTICATION & REGISTRATION
// ============================================

// Simple password hashing (in production, use bcrypt!)
function hashPassword(password) {
  return Buffer.from(password).toString('base64');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// ROUTE: Company Registration (Sign Up)
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, phone, website, trade } = req.body;

  // Validate required fields
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  // Check if email already exists
  const existingCompany = Array.from(companies.values()).find(c => c.email === email);
  if (existingCompany) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  // Create company
  const companyId = `company_${uuidv4()}`;
  const apiKey = `rva_${uuidv4()}`;

  const company = {
    id: companyId,
    apiKey: apiKey,
    name,
    email,
    password: hashPassword(password), // In production, use bcrypt!
    phone: phone || '',
    website: website || '',
    trade: trade || 'general',
    commissionRate: 0.02, // 2%
    status: 'trial',
    createdAt: new Date().toISOString(),
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  };

  companies.set(companyId, company);

  console.log(`✅ New company registered: ${name} (${companyId})`);

  res.json({
    success: true,
    companyId: companyId,
    apiKey: apiKey,
    message: 'Company registered successfully',
    company: {
      id: company.id,
      name: company.name,
      email: company.email,
      trade: company.trade,
      status: company.status
    }
  });
});

// ROUTE: Create demo company (for testing)
app.get('/api/demo/create', (req, res) => {
  const demoCompanyId = 'demo_company';
  
  if (!companies.has(demoCompanyId)) {
    const demoCompany = {
      id: demoCompanyId,
      apiKey: 'rva_demo_key',
      name: 'Demo Bathrooms Ltd',
      email: 'demo@example.com',
      password: hashPassword('demo123'),
      phone: '07700 900123',
      website: 'www.demobathrooms.com',
      trade: 'bathroom',
      commissionRate: 0.02,
      status: 'trial',
      createdAt: new Date().toISOString(),
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
    };
    
    companies.set(demoCompanyId, demoCompany);
    
    // Create some demo leads
    for (let i = 1; i <= 10; i++) {
      leads.push({
        id: `demo_lead_${i}`,
        companyId: demoCompanyId,
        customerName: `Customer ${i}`,
        email: `customer${i}@email.com`,
        phone: `07700 90${String(i).padStart(4, '0')}`,
        postcode: `SW1A ${i}AA`,
        projectBudget: ['under-5k', '5k-10k', '10k-20k', '20k-plus'][i % 4],
        startDate: ['asap', '1-3months', '3-6months'][i % 3],
        notes: 'Looking for a complete renovation',
        originalImage: 'https://via.placeholder.com/400x300?text=Before',
        generatedImage: 'https://via.placeholder.com/400x300?text=After',
        prompt: 'Modern bathroom with marble tiles',
        status: ['new', 'contacted', 'quoted', 'won', 'lost'][i % 5],
        projectValue: i % 5 === 3 ? 12000 + (i * 1000) : null,
        createdAt: new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
  }
  
  res.json({
    success: true,
    message: 'Demo company created',
    login: {
      email: 'demo@example.com',
      password: 'demo123'
    }
  });
});

// Alias for legacy/alternate route: support /api/create/demo -> /api/demo/create
app.get('/api/create/demo', (req, res) => {
  // Redirect to the canonical demo creation endpoint
  res.redirect('/api/demo/create');
});

// ============================================
// AUTHENTICATION & REGISTRATION
// ============================================

// Simple password hashing (in production, use bcrypt!)
function hashPassword(password) {
  return Buffer.from(password).toString('base64');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// ROUTE: Company Registration (Sign Up)
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone, website, trade } = req.body;

  // Validate required fields
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    // Check if email already exists
    const existing = await db.query('SELECT id FROM companies WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create company
    const companyId = `company_${uuidv4()}`;
    const apiKey = `rva_${uuidv4()}`;

    await db.query(
      `INSERT INTO companies (id, api_key, name, email, password, phone, website, trade, status, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'trial', $9)`,
      [
        companyId,
        apiKey,
        name,
        email,
        hashPassword(password),
        phone || '',
        website || '',
        trade || 'general',
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      ]
    );

    console.log(`✅ New company registered: ${name} (${companyId})`);

    res.json({
      success: true,
      companyId: companyId,
      apiKey: apiKey,
      message: 'Company registered successfully',
      company: {
        id: companyId,
        name: name,
        email: email,
        trade: trade || 'general',
        status: 'trial'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ROUTE: Create demo company (for testing)
app.post('/api/demo/create', async (req, res) => {
  const demoCompanyId = 'demo_company';
  
  try {
    // Check if exists
    const existing = await db.query('SELECT id FROM companies WHERE id = $1', [demoCompanyId]);
    
    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO companies (id, api_key, name, email, password, phone, website, trade, status, trial_ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'trial', $9)`,
        [
          demoCompanyId,
          'rva_demo_key',
          'Demo Bathrooms Ltd',
          'demo@example.com',
          hashPassword('demo123'),
          '07700 900123',
          'www.demobathrooms.com',
          'bathroom',
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        ]
      );
      
      console.log('✅ Demo company created');
    } else {
      console.log('✅ Demo company already exists');
    }
    
    res.json({
      success: true,
      message: 'Demo company ready',
      login: {
        email: 'demo@example.com',
        password: 'demo123'
      }
    });
  } catch (error) {
    console.error('Demo creation error:', error);
    res.status(500).json({ error: 'Failed to create demo company', message: error.message });
  }
});

// Password hashing functions
function hashPassword(password) {
  return Buffer.from(password).toString('base64');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// ROUTE: Company Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  console.log('Login attempt:', email); // This should show in terminal

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await db.query('SELECT * FROM companies WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const company = result.rows[0];

    if (!verifyPassword(password, company.password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log(`✅ Company logged in: ${company.name}`);

    res.json({
      success: true,
      companyId: company.id,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        trade: company.trade,
        status: company.status
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
});

// ============================================
// AUTHENTICATION & COMPANY MANAGEMENT
// ============================================

// Password hashing functions
function hashPassword(password) {
  return Buffer.from(password).toString('base64');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

// ROUTE: Create demo company
app.post('/api/demo/create', async (req, res) => {
  const demoCompanyId = 'demo_company';
  
  try {
    // Check if exists
    const existing = await db.query('SELECT id FROM companies WHERE id = $1', [demoCompanyId]);
    
    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO companies (id, api_key, name, email, password, phone, website, trade, status, trial_ends_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'trial', $9)`,
        [
          demoCompanyId,
          'rva_demo_key',
          'Demo Bathrooms Ltd',
          'demo@example.com',
          hashPassword('demo123'),
          '07700 900123',
          'www.demobathrooms.com',
          'bathroom',
          new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
        ]
      );
      
      console.log('✅ Demo company created');
    } else {
      console.log('✅ Demo company already exists');
    }
    
    res.json({
      success: true,
      message: 'Demo company ready',
      login: {
        email: 'demo@example.com',
        password: 'demo123'
      }
    });
  } catch (error) {
    console.error('Demo creation error:', error);
    res.status(500).json({ error: 'Failed to create demo company', message: error.message });
  }
});

// ROUTE: Company Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  console.log('Login attempt for:', email);

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find company by email
    const result = await db.query('SELECT * FROM companies WHERE email = $1', [email]);

    if (result.rows.length === 0) {
      console.log('❌ Email not found:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const company = result.rows[0];

    // Verify password
    if (!verifyPassword(password, company.password)) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    console.log(`✅ Company logged in: ${company.name} (${company.id})`);

    res.json({
      success: true,
      companyId: company.id,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        trade: company.trade,
        status: company.status,
        apiKey: company.api_key
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', message: error.message });
  }
});

// ROUTE: Company Registration
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone, website, trade } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  try {
    // Check if email exists
    const existing = await db.query('SELECT id FROM companies WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Create company
    const companyId = `company_${uuidv4()}`;
    const apiKey = `rva_${uuidv4()}`;

    await db.query(
      `INSERT INTO companies (id, api_key, name, email, password, phone, website, trade, status, trial_ends_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'trial', $9)`,
      [
        companyId,
        apiKey,
        name,
        email,
        hashPassword(password),
        phone || '',
        website || '',
        trade || 'general',
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
      ]
    );

    console.log(`✅ New company registered: ${name} (${companyId})`);

    res.json({
      success: true,
      companyId: companyId,
      apiKey: apiKey,
      message: 'Company registered successfully',
      company: {
        id: companyId,
        name: name,
        email: email,
        trade: trade || 'general',
        status: 'trial'
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed', message: error.message });
  }
});

// Catch-all route - must be last
app.get('*', (req, res) => {
  // If requesting the root, redirect to login
  if (req.path === '/') {
    return res.redirect('/dashboard/login.html');
  }
  // For dashboard routes, serve the dashboard index
  if (req.path.startsWith('/dashboard')) {
    return res.sendFile(path.join(__dirname, 'public/dashboard/index.html'));
  }
  // 404 for everything else
  res.status(404).send('Not Found');
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Gemini API key configured: ${process.env.GEMINI_API_KEY ? 'Yes' : 'No'}`);
  console.log(`✅ Test the API: http://localhost:${PORT}/api/health`);
});

const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Send confirmation email to customer
async function sendCustomerEmail(name, email, referenceCode, imageUrl) {
  const msg = {
    to: email,
    from: 'hello@renovationvision.io', // Use your verified sender
    subject: 'Your Dream Renovation Visualization',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #667eea;">🏠 Your Visualization is Ready!</h2>
        
        <p>Hi ${name},</p>
        
        <p>Thank you for using our AI visualization tool! Your dream renovation is one step closer to reality.</p>
        
        <div style="background: #f0f4ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0;">Your Reference Code:</h3>
          <h1 style="color: #667eea; font-size: 32px; letter-spacing: 2px; margin: 10px 0;">${referenceCode}</h1>
          <p style="font-size: 14px; color: #666;">Mention this code when you call for priority service!</p>
        </div>
        
        <img src="${imageUrl}" alt="Your renovation" style="max-width: 100%; border-radius: 8px; margin: 20px 0;">
        
        <h3>What happens next?</h3>
        <ul>
          <li>We'll contact you within 24 hours</li>
          <li>Get a free, no-obligation quote</li>
          <li>Discuss your vision with our experts</li>
        </ul>
        
        <p style="color: #999; font-size: 14px; margin-top: 40px;">
          You're receiving this email because you used our renovation visualization tool.
        </p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Customer email sent to ${email}`);
  } catch (error) {
    console.error('Email send error:', error);
  }
}

// Send notification to company
async function sendCompanyNotification(companyId, customerName, email, phone, referenceCode) {
  const company = await db.query('SELECT name, email FROM companies WHERE id = $1', [companyId]);
  
  if (company.rows.length === 0) return;

  const companyEmail = company.rows[0].email;
  const companyName = company.rows[0].name;

  const msg = {
    to: companyEmail,
    from: 'leads@renovationvision.io',
    subject: `🔥 New Lead Alert - ${customerName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #667eea;">New Lead from AI Tool!</h2>
        
        <p>Hi ${companyName},</p>
        
        <p>You have a new lead from your Renovation Vision widget:</p>
        
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3>Lead Details:</h3>
          <p><strong>Name:</strong> ${customerName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Phone:</strong> ${phone}</p>
          <p><strong>Reference Code:</strong> ${referenceCode}</p>
        </div>
        
        <p><a href="https://app.renovationvision.io/dashboard/leads.html" style="background: #667eea; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View in Dashboard</a></p>
        
        <p style="margin-top: 30px; color: #666; font-size: 14px;">
          <strong>💡 Pro Tip:</strong> Leads who use the visualization tool are 3x more likely to close. Contact them within 24 hours for best results!
        </p>
      </div>
    `
  };

  try {
    await sgMail.send(msg);
    console.log(`✅ Company notification sent to ${companyEmail}`);
  } catch (error) {
    console.error('Email send error:', error);
  }
}