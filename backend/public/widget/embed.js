// Renovation Vision Embed Script
// This loads the widget into the company's website

(function() {
  'use strict';

  // Configuration
  const WIDGET_URL = 'https://renovation-ai-production.up.railway.app/widget/widget.html'; // Change to your production URL
  const companyId = window.RENOVATION_VISION_COMPANY_ID;

  if (!companyId) {
    console.error('Renovation Vision: Missing RENOVATION_VISION_COMPANY_ID');
    return;
  }

  // Create iframe
  const container = document.getElementById('renovation-vision-widget');
  
  if (!container) {
    console.error('Renovation Vision: Container element not found');
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.src = WIDGET_URL;
  iframe.style.width = '100%';
  iframe.style.border = 'none';
  iframe.style.minHeight = '600px';
  iframe.id = 'rv-widget-iframe';

  // Listen for height changes from widget
  window.addEventListener('message', (event) => {
    if (event.data.type === 'rv-resize') {
      iframe.style.height = event.data.height + 'px';
    }
  });

  container.appendChild(iframe);

  // Pass company ID to iframe
  iframe.onload = function() {
    iframe.contentWindow.postMessage({
      type: 'rv-init',
      companyId: companyId
    }, '*');
  };
})();