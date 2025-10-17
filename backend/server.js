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
app.use(express.static('public'));

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

// Store for projects (in production, use a database)
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

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Runway API key configured: ${process.env.RUNWAYML_API_KEY ? 'Yes' : 'No'}`);
  console.log(`✅ Test the API: http://localhost:${PORT}/api/health`);
});