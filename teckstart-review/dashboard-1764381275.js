// dashboard-enhanced.js

let expensesData = [];
let projectsData = [];
let spendingChartInstance = null;
let currentTimePeriod = 'ytd';

// Main Initialization
async function updateDashboard() {
    if (!getToken()) return;

    try {
        await fetchExpenses();
        await fetchProjects();
        
        calculateStats();
        renderChart();
        updateProjectDropdowns();
    } catch (e) {
        console.error("Dashboard Load Error:", e);
    }
}

async function fetchExpenses() {
    const res = await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    expensesData = data.filter(item => item.type === 'expense');
}

async function fetchProjects() {
    const res = await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
        headers: { 'Authorization': `Bearer ${getToken()}` }
    });
    const data = await res.json();
    projectsData = data.filter(item => item.type === 'project');
}

function setTimePeriod(period) {
    currentTimePeriod = period;
    document.querySelectorAll('.chart-controls button').forEach(btn => btn.classList.remove('active'));
    document.getElementById(period + '-btn').classList.add('active');
    renderChart();
}

function updateChart() {
    renderChart();
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

    // Display expenses as positive values
    document.getElementById('ytd-expenses').innerText = formatCurrency(ytdExpenses);
    document.getElementById('ytd-profit').innerText = formatCurrency(ytdExpenses);
}

function formatCurrency(num) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

// ----------------------
// Charting
// ----------------------
function renderChart() {
    const ctx = document.getElementById('spendingChart').getContext('2d');
    const filterType = document.getElementById('chart-filter').value;
    
    let chartData;
    if (currentTimePeriod === 'ytd') {
        chartData = createYTDChart(filterType);
    } else {
        chartData = createMonthlyChart(filterType);
    }

    if (spendingChartInstance) {
        spendingChartInstance.destroy();
    }

    spendingChartInstance = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true }
            },
            plugins: {
                legend: { display: true }
            }
        }
    });
}

function createYTDChart(filterType) {
    const currentYear = new Date().getFullYear();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Group by month and filter type
    const monthlyData = {};
    const categories = new Set();
    
    expensesData.forEach(exp => {
        const expDate = new Date(exp.date);
        if (expDate.getFullYear() !== currentYear) return;
        
        const month = months[expDate.getMonth()];
        let category = getCategory(exp, filterType);
        
        categories.add(category);
        if (!monthlyData[month]) monthlyData[month] = {};
        monthlyData[month][category] = (monthlyData[month][category] || 0) + parseFloat(exp.amount);
    });
    
    const datasets = Array.from(categories).map((cat, i) => ({
        label: cat,
        data: months.map(month => monthlyData[month]?.[cat] || 0),
        backgroundColor: `hsl(${i * 360 / categories.size}, 70%, 60%)`,
        borderWidth: 1
    }));
    
    return { labels: months, datasets };
}

function createMonthlyChart(filterType) {
    const last12Months = [];
    const now = new Date();
    
    for (let i = 11; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        last12Months.push(date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }));
    }
    
    const monthlyData = {};
    const categories = new Set();
    
    expensesData.forEach(exp => {
        const expDate = new Date(exp.date);
        const monthKey = expDate.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
        
        if (!last12Months.includes(monthKey)) return;
        
        let category = getCategory(exp, filterType);
        categories.add(category);
        
        if (!monthlyData[monthKey]) monthlyData[monthKey] = {};
        monthlyData[monthKey][category] = (monthlyData[monthKey][category] || 0) + parseFloat(exp.amount);
    });
    
    const datasets = Array.from(categories).map((cat, i) => ({
        label: cat,
        data: last12Months.map(month => monthlyData[month]?.[cat] || 0),
        backgroundColor: `hsl(${i * 360 / categories.size}, 70%, 60%)`,
        borderWidth: 1
    }));
    
    return { labels: last12Months, datasets };
}

function getCategory(exp, filterType) {
    if (filterType === 'vendor') {
        return exp.vendor || 'Unknown Vendor';
    } else if (filterType === 'category') {
        return exp.category || 'Uncategorized';
    } else if (filterType === 'project') {
        if (exp.projectId) {
            const proj = projectsData.find(p => p.transactionId === exp.projectId);
            return proj ? proj.name : 'Deleted Project';
        }
        return 'No Project';
    }
    return 'Unknown';
}

// Missing function - update project dropdowns
function updateProjectDropdowns() {
    try {
        const projectSelects = document.querySelectorAll('.project-select');
        
        projectSelects.forEach(select => {
            // Clear existing options except first (default) option
            while (select.children.length > 1) {
                select.removeChild(select.lastChild);
            }
            
            // Add project options
            projectsData.forEach(project => {
                const option = document.createElement('option');
                option.value = project.transactionId || project.id || '';
                option.textContent = project.name || project.project_name || 'Unknown Project';
                select.appendChild(option);
            });
        });
        
        console.log(`Updated ${projectSelects.length} project dropdowns with ${projectsData.length} projects`);
    } catch (error) {
        console.error('Error updating project dropdowns:', error);
    }
}
