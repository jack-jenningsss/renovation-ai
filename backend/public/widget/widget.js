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
const blurOverlay = document.getElementById('blurOverlay');
const leadForm = document.getElementById('leadForm');
const leadFormContainer = document.getElementById('leadFormContainer');
const successMessage = document.getElementById('successMessage');
const finalImg = document.getElementById('finalImg');
const downloadBtn = document.getElementById('downloadBtn');
const errorMsg = document.getElementById('errorMsg');

let uploadedFilename = '';
let originalImageData = '';
let generatedImageUrl = '';
let currentLeadId = '';

// Upload handling
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#667eea';
    uploadArea.style.background = '#f0f4ff';
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.style.borderColor = '#ccc';
    uploadArea.style.background = '#f9f9f9';
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = '#ccc';
    uploadArea.style.background = '#f9f9f9';
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

    if (file.size > 10 * 1024 * 1024) {
        showError('Image must be less than 10MB');
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImg.src = e.target.result;
        originalImageData = e.target.result;
        imagePreview.style.display = 'block';
        uploadArea.style.display = 'none';
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
            checkFormComplete();
        }
    } catch (err) {
        showError('Upload failed. Please try again.');
    }
}

// Check if form is complete to enable button
function checkFormComplete() {
    const hasImage = uploadedFilename !== '';
    const hasPrompt = styleSelect.value !== '' || customPrompt.value.trim() !== '';
    
    generateBtn.disabled = !(hasImage && hasPrompt);
}

// Listen for prompt changes
styleSelect.addEventListener('change', () => {
    if (styleSelect.value) {
        customPrompt.value = '';
    }
    checkFormComplete();
});

customPrompt.addEventListener('input', () => {
    if (customPrompt.value.trim()) {
        styleSelect.value = '';
    }
    checkFormComplete();
});

// Generate button
generateBtn.addEventListener('click', async () => {
    const prompt = customPrompt.value.trim() || styleSelect.value;
    
    if (!prompt) {
        showError('Please select or enter a style');
        return;
    }

    if (!uploadedFilename) {
        showError('Please upload an image first');
        return;
    }

    // Hide form, show loading
    document.querySelector('.rv-main-form').style.display = 'none';
    loading.style.display = 'block';
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
            
            // Keep image blurred
            afterImg.classList.add('rv-blurred');
            
            loading.style.display = 'none';
            results.style.display = 'block';
            
            // Scroll to results
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            throw new Error(data.error || 'Generation failed');
        }
    } catch (err) {
        loading.style.display = 'none';
        document.querySelector('.rv-main-form').style.display = 'block';
        showError('Generation failed: ' + err.message);
    }
});

// Lead form submission
leadForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const unlockBtn = document.getElementById('unlockBtn');
    unlockBtn.disabled = true;
    unlockBtn.textContent = '⏳ Unlocking...';

    const formData = new FormData(leadForm);
    const leadData = {
        companyId: window.COMPANY_ID,
        customerName: formData.get('name'),
        email: formData.get('email'),
        phone: formData.get('phone'),
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
            currentLeadId = data.leadId;
            
            // Unblur image
            afterImg.classList.remove('rv-blurred');
            afterImg.classList.add('unblurred');
            blurOverlay.classList.add('hidden');
            
            // Hide form, show success
            leadFormContainer.style.display = 'none';
            successMessage.style.display = 'block';
            
            // Show reference code
            document.getElementById('referenceCode').textContent = data.referenceCode;
            
            // Show full image
            finalImg.src = generatedImageUrl;
            
            // Scroll to top
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            throw new Error(data.error || 'Submission failed');
        }
    } catch (err) {
        showError('Failed to submit. Please try again: ' + err.message);
        unlockBtn.disabled = false;
        unlockBtn.textContent = '🔓 Unlock Full Image & Get Free Quote';
    }
});

// Download button
downloadBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = generatedImageUrl;
    link.download = `renovation-${currentLeadId}.jpg`;
    link.click();
});

function showError(message) {
    errorMsg.textContent = '⚠️ ' + message;
    errorMsg.style.display = 'block';
    
    setTimeout(() => {
        errorMsg.style.display = 'none';
    }, 5000);
}

// Initialize
console.log('Widget loaded, API URL:', window.API_URL);