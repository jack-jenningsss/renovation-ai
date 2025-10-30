// Dashboard Logic

async function loadDashboard() {
    const companyId = window.COMPANY_ID;
    const apiUrl = window.API_URL;

    try {
        // Load company info
        const companyResponse = await fetch(`${apiUrl}/api/company/${companyId}`);
        const companyData = await companyResponse.json();
        
        if (companyData.success) {
            document.getElementById('companyName').textContent = companyData.company.name;
        }

        // Load stats
        const statsResponse = await fetch(`${apiUrl}/api/company/${companyId}/stats`);
        const statsData = await statsResponse.json();

        if (statsData.success) {
            const stats = statsData.stats;
            
            document.getElementById('totalLeads').textContent = stats.totalLeads;
            document.getElementById('wonLeads').textContent = stats.wonLeads;
            document.getElementById('totalRevenue').textContent = `£${stats.totalRevenue.toLocaleString()}`;
            document.getElementById('commission').textContent = `£${stats.commissionAmount.toLocaleString()}`;
            document.getElementById('conversionRate').textContent = `${stats.conversionRate}% conversion`;
        }

        // Load recent leads
        const leadsResponse = await fetch(`${apiUrl}/api/company/${companyId}/leads`);
        const leadsData = await leadsResponse.json();

        if (leadsData.success) {
            displayRecentLeads(leadsData.leads.slice(0, 5)); // Show 5 most recent
        }

        // Load embed code
        const embedResponse = await fetch(`${apiUrl}/api/company/${companyId}/embed`);
        const embedData = await embedResponse.json();

        if (embedData.success) {
            document.getElementById('embedCode').textContent = embedData.embedCode;
        }

    } catch (error) {
        console.error('Failed to load dashboard:', error);
        document.querySelector('.leads-list').innerHTML = '<div class="loading">Failed to load data</div>';
    }
}

function displayRecentLeads(leads) {
    const container = document.getElementById('recentLeads');

    if (leads.length === 0) {
        container.innerHTML = '<div class="loading">No leads yet. Add the widget to your website to start capturing leads!</div>';
        return;
    }

    container.innerHTML = leads.map(lead => `
        <div class="lead-card">
            <div class="lead-info">
                <h3>${lead.customerName}</h3>
                <div class="lead-meta">
                    <span>📧 ${lead.email}</span>
                    <span>📞 ${lead.phone}</span>
                    <span>📍 ${lead.postcode}</span>
                </div>
                <span class="lead-budget">${lead.projectBudget}</span>
                <p class="text-small" style="margin-top: 10px; color: #999;">
                    ${new Date(lead.createdAt).toLocaleDateString('en-GB', { 
                        day: 'numeric', 
                        month: 'short', 
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </p>
            </div>
            <div class="lead-actions">
                <span class="status-badge status-${lead.status}">${lead.status.toUpperCase()}</span>
            </div>
        </div>
    `).join('');
}

function copyEmbedCode() {
    const code = document.getElementById('embedCode').textContent;
    navigator.clipboard.writeText(code).then(() => {
        alert('Embed code copied to clipboard!');
    });
}