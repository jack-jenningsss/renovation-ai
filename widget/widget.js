// Renovation Vision Widget Logic

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const imagePreview = document.getElementById('imagePreview');
const previewImg = document.getElementById('previewImg');
const styleSelect = document.getElementById('styleSelect');
const customPrompt = document.getElementById('customPrompt');
const generateBtn = document.getElementById('generateBtn');
const loading = document.getElementById('loading');
const results = document.getElementById('results');
const beforeImg = document.getElementById('beforeImg');
const afterImg = document.getElementById('afterImg');
const leadForm = document.getElementById('leadForm');
const successMessage = document.getElementById('successMessage');
const finalImg = document.getElementById('finalImg');
const downloadBtn = document.getElementById('downloadBtn');
const errorMsg = document.getElementById('errorMsg');

let uploadedFilename = '';
let originalImageData = '';
let generatedImageUrl = '';

// Show steps
function showStep(stepId) {
    document.querySelectorAll('.rv-step').forEach(s => s.classList.remove('active'));
    document.getElementById(stepId).classList.add('active');
}

// Upload handling
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#667eea';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

async function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showError('Please upload an image file');
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        originalImageData = e.target.result;
        imagePreview.style.display = 'block';
        showStep('step-style');
        showStep('step-generate');
    };
    reader.readAsDataURL(file);

    // Upload to server
    await uploadImage(file);
}

async function uploadImage(file) {
    try {
        const formData = new FormData();
        formData.append('image', file);

        const response = await fetch(`${window.API_URL}/api/upload`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            uploadedFilename = data.filename;
            generateBtn.disabled = false;
        }
    } catch (err) {
        showError('Upload failed. Please try again.');
    }
}

// Load prompts
async function loadPrompts() {
    try {
        const response = await fetch(`${window.API_URL}/api/prompts/general`);
        const data = await response.json();
        
        data.prompts.forEach(prompt => {
            const option = document.createElement('option');
            option.value = prompt;
            option.textContent = prompt.substring(0, 60) + '...';
            styleSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Failed to load prompts');
    }
}

// Generate button
generateBtn.addEventListener('click', async () => {
    const prompt = customPrompt.value.trim() || styleSelect.value;
    
    if (!prompt) {
        showError('Please select or enter a style');
        return;
    }

    loading.style.display = 'block';
    results.style.display = 'none';
    errorMsg.style.display = 'none';

    try {
        const response = await fetch(`${window.API_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                filename: uploadedFilename,
                prompt: prompt,
                companyId: window.COMPANY_ID
            })
        });

        const data = await response.json();

        if (data.success) {
            generatedImageUrl = data.generatedImageUrl;
            beforeImg.src = originalImageData;
            afterImg.src = generatedImageUrl;
            
            loading.style.display = 'none';
            results.style.display = 'block';
            results.scrollIntoView({ behavior: 'smooth' });
        } else {
            throw new Error(data.error);
        }
    } catch (err) {
        loading.style.display = 'none';
        showError('Generation failed: ' + err.message);
    }
});

// Lead form submission
leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(leadForm);
    const leadData = {
        companyId: window.COMPANY_ID,
        customerName: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
        postcode: formData.get('postcode'),
        projectBudget: formData.get('budget'),
        startDate: formData.get('timeline'),
        notes: formData.get('notes'),
        originalImage: originalImageData,
        generatedImage: generatedImageUrl,
        prompt: customPrompt.value || styleSelect.value
    };

    try {
        const response = await fetch(`${window.API_URL}/api/lead`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(leadData)
        });

        const data = await response.json();

        if (data.success) {
            // Unblur and show success
            afterImg.classList.remove('rv-blurred');
            finalImg.src = generatedImageUrl;
            document.querySelector('.rv-lead-form').style.display = 'none';
            successMessage.style.display = 'block';
        } else {
            throw new Error(data.error);
        }
    } catch (err) {
        showError('Failed to submit. Please try again.');
    }
});

// Download button
downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = generatedImageUrl;
    link.download = `renovation-${Date.now()}.jpg`;
    link.click();
});

function showError(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    setTimeout(() => {
        errorMsg.style.display = 'none';
    }, 5000);
}

// Initialize
loadPrompts();
showStep('step-upload');