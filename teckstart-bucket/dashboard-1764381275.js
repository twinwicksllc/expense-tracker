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
        Logger.error('Dashboard load failed', {
            error: e.message,
            stack: e.stack,
            action: 'updateDashboard',
            hasToken: !!getToken(),
            expensesCount: expensesData?.length || 0,
            projectsCount: projectsData?.length || 0
        });
    }
}

async function fetchExpenses() {
    try {
        let res;
        try {
            const token = getToken();
            res = await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
                mode: 'cors',
                credentials: 'same-origin',
                headers: { 'Authorization': `Bearer ${token}` }
            });
        } catch (networkError) {
            throw new Error('Network error: ' + networkError.message);
        }
        
        if (!res.ok) {
            throw new Error(`Failed to fetch expenses: ${res.status}`);
        }
        
        let data;
        try {
            data = await res.json();
        } catch (parseError) {
            throw new Error('Invalid JSON response: ' + parseError.message);
        }
        
        expensesData = Array.isArray(data) ? data.filter(item => item.type === 'expense') : [];
    } catch (error) {
        Logger.error('Failed to fetch expenses', {
            error: error.message,
            stack: error.stack,
            action: 'fetchExpenses'
        });
        expensesData = [];
        throw error;
    }
}

async function fetchProjects() {
    try {
        let res;
        try {
            res = await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
                mode: 'cors',
                credentials: 'same-origin',
                headers: { 'Authorization': `Bearer ${getToken()}` }
            });
        } catch (networkError) {
            throw new Error('Network error: ' + networkError.message);
        }
        
        if (!res.ok) {
            throw new Error(`Failed to fetch projects: ${res.status}`);
        }
        
        let data;
        try {
            data = await res.json();
        } catch (parseError) {
            throw new Error('Invalid JSON response: ' + parseError.message);
        }
        
        projectsData = Array.isArray(data) ? data.filter(item => item.type === 'project') : [];
    } catch (error) {
        Logger.error('Failed to fetch projects', {
            error: error.message,
            stack: error.stack,
            action: 'fetchProjects'
        });
        projectsData = [];
        throw error;
    }
}

function setTimePeriod(period) {
    try {
        const validPeriods = ['ytd', 'month'];
        if (!validPeriods.includes(period)) {
            throw new Error(`Invalid period: ${period}`);
        }
        
        currentTimePeriod = period;
        document.querySelectorAll('.chart-controls button').forEach(btn => btn.classList.remove('active'));
        
        const btn = document.getElementById(period + '-btn');
        if (!btn) {
            throw new Error(`Period button not found: ${period}-btn`);
        }
        btn.classList.add('active');
        renderChart();
    } catch (error) {
        Logger.error('Failed to set time period', {
            error: error.message,
            stack: error.stack,
            period: period,
            action: 'setTimePeriod'
        });
    }
}

// amazonq-ignore-next-line
function updateChart() {
    renderChart();
}

// ----------------------
// Calculations
// ----------------------
const CURRENCY_OPTIONS = { style: 'currency', currency: 'USD' };

function calculateStats() {
    try {
        const ytdExpensesEl = document.getElementById('ytd-expenses');
        
        if (!ytdExpensesEl) {
            Logger.error('Stats elements not found', {
                action: 'calculateStats'
            });
            return;
        }
        
        const currentYear = new Date().getFullYear();
        
        const ytdExpenses = expensesData
            .filter(e => new Date(e.date).getFullYear() === currentYear)
            .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

        ytdExpensesEl.innerText = formatCurrency(ytdExpenses);
    } catch (error) {
        Logger.error('Failed to calculate stats', {
            error: error.message,
            stack: error.stack,
            action: 'calculateStats'
        });
    }
}

function formatCurrency(num) {
    try {
        if (typeof num !== 'number' || isNaN(num)) {
            return '$0.00';
        }
        return new Intl.NumberFormat('en-US', CURRENCY_OPTIONS).format(num);
    } catch (error) {
        Logger.error('Failed to format currency', {
            error: error.message,
            num: num,
            action: 'formatCurrency'
        });
        return '$0.00';
    }
}

// ----------------------
// Charting
// ----------------------
function renderChart() {
    try {
        const chartElement = document.getElementById('spendingChart');
        if (!chartElement) {
            throw new Error('Chart element not found');
        }
        const ctx = chartElement.getContext('2d');
        
        const filterElement = document.getElementById('chart-filter');
        if (!filterElement) {
            throw new Error('Chart filter element not found');
        }
        const filterType = filterElement.value;
        
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
    } catch (error) {
        Logger.error('Failed to render chart', {
            error: error.message,
            stack: error.stack,
            action: 'renderChart',
            currentTimePeriod: currentTimePeriod,
            expensesCount: expensesData.length,
            hasChartInstance: !!spendingChartInstance
        });
    }
}

function createYTDChart(filterType) {
    try {
        const currentYear = new Date().getFullYear();
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        const monthlyData = {};
        const categories = new Set();
        
        expensesData.forEach(exp => {
            if (!exp || !exp.date) return;
            const expDate = new Date(exp.date);
            if (isNaN(expDate.getTime()) || expDate.getFullYear() !== currentYear) return;
            
            const month = months[expDate.getMonth()];
            let category = getCategory(exp, filterType);
            
            categories.add(category);
            if (!monthlyData[month]) monthlyData[month] = {};
            const amount = parseFloat(exp.amount);
            monthlyData[month][category] = (monthlyData[month][category] || 0) + (isNaN(amount) ? 0 : amount);
        });
        
        const datasets = Array.from(categories).map((cat, i) => ({
            label: cat,
            data: months.map(month => monthlyData[month]?.[cat] || 0),
            backgroundColor: categories.size > 0 ? `hsl(${i * 360 / categories.size}, 70%, 60%)` : 'hsl(0, 70%, 60%)',
            borderWidth: 1
        }));
        
        return { labels: months, datasets };
    } catch (error) {
        Logger.error('Failed to create YTD chart', {
            error: error.message,
            stack: error.stack,
            filterType: filterType,
            action: 'createYTDChart'
        });
        return { labels: [], datasets: [] };
    }
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
        if (!exp || !exp.date) return;
        const expDate = new Date(exp.date);
        if (isNaN(expDate.getTime())) return;
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
        backgroundColor: categories.size > 0 ? `hsl(${i * 360 / categories.size}, 70%, 60%)` : 'hsl(0, 70%, 60%)',
        borderWidth: 1
    }));
    
    return { labels: last12Months, datasets };
}

function getCategory(exp, filterType) {
    if (!exp) return 'Unknown';
    
    if (filterType === 'vendor') {
        return exp.vendor || 'Unknown Vendor';
    } else if (filterType === 'category') {
        return exp.category || 'Uncategorized';
    } else if (filterType === 'project') {
        if (exp.projectId) {
            const proj = Array.isArray(projectsData) ? projectsData.find(p => p && p.transactionId === exp.projectId) : null;
            return proj && proj.name ? proj.name : 'Deleted Project';
        }
        return 'No Project';
    }
    return 'Unknown';
}

function updateProjectDropdowns() {
    try {
        const projectSelects = document.querySelectorAll('.project-select');
        
        if (!Array.isArray(projectsData)) {
            throw new Error('projectsData is not an array');
        }
        
        projectSelects.forEach(select => {
            const firstOption = select.firstElementChild;
            const defaultValue = firstOption ? firstOption.outerHTML : '<option value="">None</option>';
            
            const optionsHTML = projectsData
                .filter(project => project && typeof project === 'object')
                .map(project => {
                    const id = project.transactionId || project.id || '';
                    const name = (project.name || project.project_name || 'Unknown Project').toString();
                    if (!id) {
                        Logger.warn('Project missing ID', { project, action: 'updateProjectDropdowns' });
                        return '';
                    }
                    return `<option value="${id}">${name}</option>`;
                })
                .filter(html => html)
                .join('');
            
            select.innerHTML = defaultValue + optionsHTML;
        });
        
        Logger.info('Updated project dropdowns', {
            dropdownCount: projectSelects.length,
            projectCount: projectsData.length,
            action: 'updateProjectDropdowns'
        });
    } catch (error) {
        Logger.error('Error updating project dropdowns', {
            error: error.message,
            stack: error.stack,
            projectCount: projectsData ? projectsData.length : 'unknown',
            action: 'updateProjectDropdowns'
        });
    }
}
