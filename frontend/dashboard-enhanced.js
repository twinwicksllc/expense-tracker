/**
 * Dashboard Enhancements
 * Adds monthly chart visualization and period toggle functionality
 */

// Global state
let currentPeriod = 'mtd';
let currentGroupBy = 'vendor';
let chartInstance = null;
let controlsInitialized = false;

/**
 * Initialize chart controls (period and grouping buttons)
 */
function initializeChartControls() {
    if (controlsInitialized) {
        console.log('Chart controls already initialized');
        return;
    }

    console.log('Initializing chart controls...');

    // Period buttons
    const periodButtons = document.querySelectorAll('[data-period]');
    periodButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const period = button.getAttribute('data-period');
            if (period !== currentPeriod) {
                // Update active state
                periodButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                currentPeriod = period;
                await updateDashboard();
            }
        });
    });

    // Grouping buttons
    const groupButtons = document.querySelectorAll('[data-groupby]');
    groupButtons.forEach(button => {
        button.addEventListener('click', async (e) => {
            e.preventDefault();
            const groupBy = button.getAttribute('data-groupby');
            if (groupBy !== currentGroupBy) {
                // Update active state
                groupButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');
                
                currentGroupBy = groupBy;
                await updateMonthlyChart();
            }
        });
    });

    // Set initial active states
    document.querySelector(`[data-period="${currentPeriod}"]`)?.classList.add('active');
    document.querySelector(`[data-groupby="${currentGroupBy}"]`)?.classList.add('active');

    controlsInitialized = true;
    console.log('Chart controls initialized successfully');
}

/**
 * Update full dashboard (stats + chart)
 */
async function updateDashboard() {
    try {
        console.log(`Updating dashboard: period=${currentPeriod}, groupBy=${currentGroupBy}`);
        
        const token = localStorage.getItem('idToken');
        if (!token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(`${window.API_BASE_URL}/dashboard?period=${currentPeriod}&groupBy=${currentGroupBy}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Dashboard data received:', data);

        // Update stats
        updateDashboardStats(data);

        // Update chart
        renderMonthlyChart(data.monthlyData, data.groupKeys);

    } catch (error) {
        console.error('Dashboard update error:', error);
        showError('Failed to update dashboard. Please try again.');
    }
}

/**
 * Update monthly chart only
 */
async function updateMonthlyChart() {
    try {
        console.log(`Updating chart: period=${currentPeriod}, groupBy=${currentGroupBy}`);
        
        const token = localStorage.getItem('idToken');
        if (!token) {
            throw new Error('Not authenticated');
        }

        const response = await fetch(`${window.API_BASE_URL}/dashboard?period=${currentPeriod}&groupBy=${currentGroupBy}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('Chart data received:', data);

        // Update chart only
        renderMonthlyChart(data.monthlyData, data.groupKeys);

    } catch (error) {
        console.error('Chart update error:', error);
        showError('Failed to update chart. Please try again.');
    }
}

/**
 * Update dashboard stats display
 */
function updateDashboardStats(data) {
    // Update total expenses
    const totalElement = document.querySelector('#total-expenses');
    if (totalElement) {
        totalElement.textContent = `$${data.totalExpenses.toFixed(2)}`;
    }

    // Update current month total
    const monthElement = document.querySelector('#current-month-total');
    if (monthElement) {
        monthElement.textContent = `$${data.currentMonthTotal.toFixed(2)}`;
    }

    // Update transaction count
    const countElement = document.querySelector('#transaction-count');
    if (countElement) {
        countElement.textContent = data.transactionCount;
    }

    // Update comparison indicators
    updateComparisonIndicator('total-change', data.comparison.totalChange);
    updateComparisonIndicator('month-change', data.comparison.monthChange);
    updateComparisonIndicator('count-change', data.comparison.countChange);
}

/**
 * Update comparison indicator with arrow and color
 */
function updateComparisonIndicator(elementId, percentChange) {
    const element = document.querySelector(`#${elementId}`);
    if (!element) return;

    const arrow = percentChange > 0 ? '↑' : percentChange < 0 ? '↓' : '→';
    const color = percentChange > 0 ? 'red' : percentChange < 0 ? 'green' : 'gray';
    
    element.textContent = `${arrow} ${Math.abs(percentChange).toFixed(1)}%`;
    element.style.color = color;
}

/**
 * Render monthly chart using Chart.js
 */
function renderMonthlyChart(monthlyData, groupKeys) {
    try {
        console.log('Rendering chart with data:', { monthlyData, groupKeys });

        if (!monthlyData || monthlyData.length === 0) {
            console.warn('No monthly data to display');
            return;
        }

        const canvas = document.getElementById('monthly-chart');
        if (!canvas) {
            console.error('Chart canvas not found');
            return;
        }

        // Destroy existing chart
        if (chartInstance) {
            chartInstance.destroy();
        }

        // Prepare data for Chart.js
        const labels = monthlyData.map(item => item.month);
        
        // Generate colors for each group
        const colors = generateColors(groupKeys.length);
        
        // Create datasets for each group key
        const datasets = groupKeys.map((key, index) => ({
            label: key,
            data: monthlyData.map(item => item.breakdown[key] || 0),
            backgroundColor: colors[index],
            borderColor: colors[index],
            borderWidth: 1
        }));

        // Create chart
        const ctx = canvas.getContext('2d');
        chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return '$' + value.toLocaleString();
                            }
                        }
                    }
                },
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return context.dataset.label + ': $' + context.parsed.y.toFixed(2);
                            }
                        }
                    }
                }
            }
        });

        console.log('Chart rendered successfully');

    } catch (error) {
        console.error('Chart rendering error:', error);
        showError('Failed to render chart');
    }
}

/**
 * Generate colors for chart
 */
function generateColors(count) {
    // Brand color (#1f2937) and variations
    const baseColors = [
        '#1f2937',  // Dark gray (primary)
        '#374151',  // Medium gray
        '#4b5563',  // Light gray
        '#6b7280',  // Lighter gray
        '#9ca3af',  // Very light gray
        '#d1d5db'   // Lightest gray
    ];

    // If we need more colors, generate variations
    const colors = [];
    for (let i = 0; i < count; i++) {
        colors.push(baseColors[i % baseColors.length]);
    }

    return colors;
}

/**
 * Show error message to user
 */
function showError(message) {
    // Try to use existing showMessage function if available
    if (typeof showMessage === 'function') {
        showMessage(message, 'error');
        return;
    }

    // Fallback: console error
    console.error(message);
    
    // Try to display in error container if it exists
    const errorContainer = document.querySelector('#error-message');
    if (errorContainer) {
        errorContainer.textContent = message;
        errorContainer.style.display = 'block';
        setTimeout(() => {
            errorContainer.style.display = 'none';
        }, 5000);
    }
}

// Export functions to window object for use in other scripts
window.dashboardEnhanced = {
    initializeChartControls,
    updateDashboard,
    updateMonthlyChart
};

console.log('Dashboard enhancements loaded');

