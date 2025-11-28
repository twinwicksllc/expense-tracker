// dashboard-enhanced.js

let expensesData = [];
let projectsData = [];
let spendingChartInstance = null;

// Main Initialization
async function updateDashboard() {
    if (!getToken()) return;

    try {
        await Promise.all([fetchExpenses(), fetchProjects()]);
        
        calculateStats();
        renderChart();
        updateProjectDropdowns(); // Helper to keep dropdowns in sync
    } catch (e) {
        console.error("Dashboard Load Error:", e);
    }
}

async function fetchExpenses() {
    const res = await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    expensesData = await res.json();
}

async function fetchProjects() {
    const res = await fetch(`${CONFIG.API_BASE_URL}/projects`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    // Filter out the SETTINGS row if it returns in the scan
    projectsData = data.filter(p => p.projectId !== 'SETTINGS');
}

// ----------------------
// Calculations
// ----------------------
function calculateStats() {
    const currentYear = new Date().getFullYear();
    
    // YTD Expenses
    const ytdExpenses = expensesData
        .filter(e => new Date(e.date).getFullYear() === currentYear)
        .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    // Estimated Profit (Mock Logic: Assuming Revenue isn't tracked yet, or is negative expenses)
    // For MVP, let's just show Expenses. If you add Revenue later, we update this.
    // Display:
    document.getElementById('ytd-expenses').innerText = formatCurrency(ytdExpenses);
    document.getElementById('ytd-profit').innerText = formatCurrency(0 - ytdExpenses); // Simple calc
}

function formatCurrency(num) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

// ----------------------
// Charting
// ----------------------
function renderChart() {
    const ctx = document.getElementById('spendingChart').getContext('2d');
    const filterType = document.getElementById('chart-filter').value; // 'category' or 'project'
    
    // Group Data
    const groupedData = {};
    
    expensesData.forEach(exp => {
        let key = 'Unknown';
        
        if (filterType === 'category') {
            key = exp.category || 'Uncategorized';
        } else if (filterType === 'project') {
            // Find project name by ID
            if (exp.projectId) {
                const proj = projectsData.find(p => p.projectId === exp.projectId);
                key = proj ? proj.name : 'Deleted Project';
            } else {
                key = 'No Project';
            }
        } else if (filterType === 'service') {
            key = exp.vendor || 'Unknown Vendor';
        }

        groupedData[key] = (groupedData[key] || 0) + parseFloat(exp.amount);
    });

    const labels = Object.keys(groupedData);
    const data = Object.values(groupedData);

    if (spendingChartInstance) {
        spendingChartInstance.destroy();
    }

    spendingChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Spending',
                data: data,
                backgroundColor: 'rgba(54, 162, 235, 0.6)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true }
            }
        }
    });
}