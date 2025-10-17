// Configuration
const API_URL = 'http://localhost:3000';

// State
let selectedTrade = '';
let uploadedFilename = '';
let originalImageUrl = '';

// Elements
const tradeBtns = document.querySelectorAll('.trade-btn');
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewContainer = document.getElementById('previewContainer');
const previewImage = document.getElementById('previewImage');
const promptSelect = document.getElementById('promptSelect');
const customPrompt = document.getElementById('customPrompt');
const generateBtn = document.getElementById('generateBtn');
const loading = document.getElementById('loading');
const error = document.getElementById('error');
const results = document.getElementById('results');
const beforeImage = document.getElementById('beforeImage');
const afterImage = document.getElementById('afterImage');
const downloadBtn = document.getElementById('downloadBtn');
const newProjectBtn = document.getElementById('newProjectBtn');

// Step visibility
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const step4 = document.getElementById('step4');

// Trade selection
tradeBtns.forEach(btn => {
    btn.addEventListener('click', async () => {
        // Update active state
        tradeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        selectedTrade = btn.dataset.trade;
        
        // Show next step
        step2.style.display = 'block';
        
        // Load prompts for this trade
        await loadPrompts(selectedTrade);
        
        // Scroll to upload area
        step2.scrollIntoView({ behavior: 'smooth' });
    });
});

// Upload area click
uploadArea.addEventListener('click', () => {
    fileInput.click();
});

// Drag and drop
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});

// File input change
fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

// Handle file selection
async function handleFileSelect(file) {
    // Validate file
    if (!file.type.startsWith('image/')) {
        showError('Please upload an image file');
        return;
    }
    
    if (file.size > 10 * 1024 * 1024) {
        showError('Image must be less than 10MB');
        return;
    }
    
    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        originalImageUrl = e.target.result;
        previewContainer.style.display = 'block';
        
        // Show next steps
        step3.style.display = 'block';
        step4.style.display = 'block';
        
        // Scroll to prompt selection
        setTimeout(() => {
            step3.scrollIntoView({ behavior: 'smooth' });
        }, 300);
    };
    reader.readAsDataURL(file);
    
    // Upload to server
    await uploadImage(file);
}

// Upload image to server
async function uploadImage(file) {
    try {
        const formData = new FormData();
        formData.append('image', file);
        
        const response = await fetch(`${API_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        if (data.success) {
            uploadedFilename = data.filename;
            generateBtn.disabled = false;
        } else {
            showError('Upload failed. Please try again.');
        }
    } catch (err) {
        showError('Could not connect to server. Make sure backend is running.');
    }
}

// Load prompts for trade
async function loadPrompts(trade) {
    try {
        const response = await fetch(`${API_URL}/api/prompts/${trade}`);
        const data = await response.json();
        
        // Clear existing options
        promptSelect.innerHTML = '<option value="">-- Select a renovation style --</option>';
        
        // Add prompts
        data.prompts.forEach(prompt => {
            const option = document.createElement('option');
            option.value = prompt;
            option.textContent = prompt.replace('transformed into', '').replace('with', '').substring(0, 80) + '...';
            promptSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading prompts:', err);
    }
}

// Prompt selection change
promptSelect.addEventListener('change', () => {
    if (promptSelect.value) {
        customPrompt.value = '';
    }
});

customPrompt.addEventListener('input', () => {
    if (customPrompt.value) {
        promptSelect.value = '';
    }
});

// Generate button
generateBtn.addEventListener('click', async () => {
    const prompt = customPrompt.value.trim() || promptSelect.value;
    
    if (!prompt) {
        showError('Please select or enter a renovation prompt');
        return;
    }
    
    if (!uploadedFilename) {
        showError('Please upload an image first');
        return;
    }
    
    // Hide error
    error.classList.remove('active');
    generateBtn.disabled = true;
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Helper function to show errors
function showError(message) {
    error.textContent = message;
    error.classList.add('active');
    
    setTimeout(() => {
        error.classList.remove('active');
    }, 5000);
}

// Test server connection on load
window.addEventListener('load', async () => {
    try {
        const response = await fetch(`${API_URL}/api/health`);
        const data = await response.json();
        console.log('✅ Connected to backend:', data.status);
    } catch (err) {
        showError('⚠️ Cannot connect to backend. Make sure server is running on http://localhost:3000');
    }
});