require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const RunwayML = require('@runwayml/sdk').default;
const { TaskFailedError } = require('@runwayml/sdk');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 3000;

// Initialize Runway client
const client = new RunwayML({
  apiKey: process.env.RUNWAYML_API_KEY
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files from parent directory
app.use(express.static(path.join(__dirname, '..')));

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

// In-memory storage (replace with database in production)
const companies = new Map();
const leads = [];
const projects = [];

// ROUTE 1: Test endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running!' });
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
    
    // Determine mime type based on file extension
    const ext = path.extname(filename).toLowerCase();
    let mimeType = 'image/jpeg';
    if (ext === '.png') mimeType = 'image/png';
    if (ext === '.webp') mimeType = 'image/webp';
    
    const dataUri = `data:${mimeType};base64,${base64Image}`;

    console.log('Sending request to Runway ML...');

    // Call Runway ML API
    const task = await client.textToImage.create({
      model: 'gen4_image',
      ratio: '1024:1024',
      promptText: `@original ${prompt}`,
      referenceImages: [
        {
          uri: dataUri,
          tag: 'original'
        }
      ]
    }).waitForTaskOutput();

    console.log('Generation complete!');

    // Save project
    const project = {
      id: uuidv4(),
      originalImage: filename,
      prompt: prompt,
      generatedImage: task.output[0],
      createdAt: new Date().toISOString()
    };
    
    projects.push(project);

    res.json({
      success: true,
      generatedImageUrl: task.output[0],
      projectId: project.id
    });

  } catch (error) {
    console.error('Generation error:', error);
    
    if (error instanceof TaskFailedError) {
      res.status(500).json({ 
        error: 'Image generation failed',
        details: error.taskDetails 
      });
    } else {
      res.status(500).json({ 
        error: 'Generation failed',
        message: error.message 
      });
    }
  }
});

// ROUTE 4: Get all projects
app.get('/api/projects', (req, res) => {
  res.json({ projects: projects });
});

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

// ROUTE 7: Capture lead from widget
app.post('/api/lead', async (req, res) => {
  try {
    const {
      companyId,
      customerName,
      email,
      phone,
      postcode,
      projectBudget,
      startDate,
      notes,
      originalImage,
      generatedImage,
      prompt
    } = req.body;

    // Validate required fields
    if (!companyId || !customerName || !email || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Create lead
    const lead = {
      id: uuidv4(),
      companyId,
      customerName,
      email,
      phone,
      postcode,
      projectBudget,
      startDate,
      notes,
      originalImage,
      generatedImage,
      prompt,
      status: 'new', // new, contacted, quoted, won, lost
      projectValue: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    leads.push(lead);

    // TODO: Send email notification to company
    console.log(`📧 New lead for company ${companyId}: ${customerName} (${email})`);

    res.json({
      success: true,
      leadId: lead.id,
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

// ROUTE: Company Login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  // Find company by email
  const company = Array.from(companies.values()).find(c => c.email === email);

  if (!company) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  // Verify password
  if (!verifyPassword(password, company.password)) {
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
      apiKey: company.apiKey
    }
  });
});

// ROUTE: Create demo company (for testing)
app.post('/api/demo/create', (req, res) => {
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

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Runway API key configured: ${process.env.RUNWAYML_API_KEY ? 'Yes' : 'No'}`);
  console.log(`✅ Test the API: http://localhost:${PORT}/api/health`);
});