// Configuration loaded from config.js

// State Management
const state = {
    user: null,
    idToken: null,
    expenses: [],
    currentView: 'dashboard'
};

// Utility Functions
const VALID_CATEGORIES = ['Office Supplies', 'Travel', 'Meals', 'Software', 'Equipment', 'Marketing', 'Other'];

/**
 * Parses JWT token to extract payload
 */
function parseJwt(token) {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        return JSON.parse(jsonPayload);
    } catch (error) {
        console.error('Error parsing JWT:', error);
        return null;
    }
}

/**
 * Checks if JWT token is expired
 */
function isTokenExpired(token) {
    try {
        const payload = parseJwt(token);
        if (!payload || !payload.exp) {
            return true; // Token without exp is considered invalid
        }
        
        const currentTime = Math.floor(Date.now() / 1000);
        const expirationTime = payload.exp;
        
        // Add 5-minute buffer before expiration
        return expirationTime <= (currentTime + 300);
    } catch (error) {
        console.error('Error checking token expiration:', error);
        return true; // If we can't parse token, consider it expired
    }
}

/**
 * Enhanced authentication check that consolidates both methods
 */
function checkAuthentication() {
    const token = localStorage.getItem('idToken');
    const email = localStorage.getItem('userEmail');
    const authProvider = localStorage.getItem('authProvider');
    
    if (!token || !email) {
        return false;
    }
    
    // Check token expiration
    if (isTokenExpired(token)) {
        console.log('Token expired, clearing authentication');
        localStorage.clear();
        return false;
    }
    
    // Set state
    state.idToken = token;
    state.user = {
        email,
        name: localStorage.getItem('userName') || '',
        authProvider: authProvider || 'Cognito'
    };
    
    return true;
}

function validateExpenseForm(data) {
    const errors = [];
    
    // Validate vendor
    if (!data.vendor || data.vendor.trim().length === 0) {
        errors.push('Vendor is required');
    } else if (data.vendor.length > 200) {
        errors.push('Vendor must be less than 200 characters');
    }
    
    // Validate amount
    if (!data.amount || isNaN(data.amount)) {
        errors.push('Amount must be a valid number');
    } else if (data.amount <= 0) {
        errors.push('Amount must be greater than 0');
    } else if (data.amount > 1000000) {
        errors.push('Amount must be less than $1,000,000');
    }
    
    // Validate date
    if (!data.date) {
        errors.push('Date is required');
    } else {
        const dateObj = new Date(data.date);
        if (isNaN(dateObj.getTime())) {
            errors.push('Date must be a valid date');
        } else if (dateObj > new Date()) {
            errors.push('Date cannot be in the future');
        }
    }
    
    // Validate category
    if (!data.category || data.category === 'Select category') {
        errors.push('Category is required');
    } else if (!VALID_CATEGORIES.includes(data.category)) {
        errors.push('Invalid category selected');
    }
    
    // Validate optional fields
    if (data.description && data.description.length > 1000) {
        errors.push('Description must be less than 1000 characters');
    }
    
    return {
        isValid: errors.length === 0,
        errors
    };
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Error element not found: ${elementId}`);
        console.error(`Error message: ${message}`);
        alert(message); // Fallback to alert if element doesn't exist
        return;
    }
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 5000);
}

function showSuccess(elementId, message) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`Success element not found: ${elementId}`);
        console.log(`Success message: ${message}`);
        return;
    }
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 5000);
}

function showLoading(show = true) {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
        loadingOverlay.style.display = show ? 'flex' : 'none';
    }
}

function hideLoading() {
    showLoading(false);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

function showAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    const mainScreen = document.getElementById('main-screen');
    
    if (authScreen) authScreen.style.display = 'block';
    if (mainScreen) mainScreen.style.display = 'none';
}

function showMainScreen() {
    const authScreen = document.getElementById('auth-screen');
    const mainScreen = document.getElementById('main-screen');
    const userEmail = document.getElementById('user-email');
    
    if (authScreen) authScreen.style.display = 'none';
    if (mainScreen) mainScreen.style.display = 'block';
    if (userEmail && state.user && state.user.email) {
        userEmail.textContent = state.user.email;
    }
    
    // Only load dashboard if dashboard elements exist (not on settings page)
    if (document.getElementById('total-expenses')) {
        loadDashboard();
    }
}

function switchView(viewName) {
    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.view === viewName);
    });

    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    document.getElementById(`${viewName}-view`).classList.add('active');

    state.currentView = viewName;

    // Load view data
    if (viewName === 'dashboard') {
        loadDashboard();
    } else if (viewName === 'expenses') {
        loadExpenses();
    } else if (viewName === 'add-expense') {
        resetExpenseForm();
    } else if (viewName === 'projects') {
        loadProjects();
    } else if (viewName === 'settings') {
        loadAWSCredentialsStatus();
    }
}

// API Functions
async function apiRequest(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (state.idToken) {
        headers['Authorization'] = `Bearer ${state.idToken}`;
    }

    // Check token expiration before request
    if (state.idToken && isTokenExpired(state.idToken)) {
        console.log('Token expired during API request, clearing authentication');
        localStorage.clear();
        showAuthScreen();
        throw new Error('Session expired. Please log in again.');
    }

    const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
        method: 'GET',
        headers,
        ...options
    });

    if (response.status === 401) {
        console.log('Unauthorized response, clearing authentication');
        localStorage.clear();
        showAuthScreen();
        throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    return await response.json();
}

async function getExpenses(filters = {}) {
    const params = new URLSearchParams(filters);
    return await apiRequest(`/expenses?${params}`);
}

async function updateExpense(transactionId, updates) {
    return await apiRequest(`/expenses/${transactionId}`, {
        method: 'PUT',
        body: JSON.stringify(updates)
    });
}

async function deleteExpense(transactionId) {
    return await apiRequest(`/expenses/${transactionId}`, {
        method: 'DELETE'
    });
}

async function getDashboardData() {
    return await apiRequest('/dashboard/summary');
}

async function loadDashboard() {
    try {
        showLoading();
        console.log('Loading dashboard data...');
        
        const expenses = await getExpenses();
        state.expenses = expenses;
        console.log(`Loaded ${expenses.length} expenses`);

        // Calculate statistics
        const total = expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthTotal = expenses
            .filter(exp => {
                const date = new Date(exp.transactionDate);
                return date.getMonth() === currentMonth && date.getFullYear() === currentYear;
            })
            .reduce((sum, exp) => sum + exp.amount, 0);

        // Update UI elements with error checking
        const totalElement = document.getElementById('total-expenses');
        const monthElement = document.getElementById('month-expenses');
        const countElement = document.getElementById('transaction-count');
        
        if (totalElement) totalElement.textContent = formatCurrency(total);
        if (monthElement) monthElement.textContent = formatCurrency(monthTotal);
        if (countElement) countElement.textContent = expenses.length;

        // Calculate category totals for chart
        const categoryTotals = {};
        expenses.forEach(exp => {
            categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
        });

        // Render category chart
        try {
            renderCategoryChart(categoryTotals);
        } catch (chartError) {
            console.error('Failed to render category chart:', chartError);
        }

        // Initialize chart controls and load monthly chart
        if (window.dashboardEnhanced && typeof window.dashboardEnhanced.initializeChartControls === 'function') {
            try {
                window.dashboardEnhanced.initializeChartControls();
            } catch (chartError) {
                console.error('Failed to initialize chart controls:', chartError);
            }
        }

        if (window.dashboardEnhanced && typeof window.dashboardEnhanced.updateMonthlyChart === 'function') {
            try {
                await window.dashboardEnhanced.updateMonthlyChart();
            } catch (chartError) {
                console.error('Failed to update monthly chart:', chartError);
            }
        } else {
            console.warn('Dashboard enhanced module not available');
        }
        
        console.log('Dashboard loaded successfully');
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        
        // Show user-friendly error message
        const errorMessage = error.message || 'Failed to load expense data';
        
        // Try to show error in a UI element if available
        const errorElement = document.getElementById('error-message');
        if (errorElement) {
            errorElement.textContent = errorMessage;
            errorElement.style.display = 'block';
            setTimeout(() => {
                errorElement.style.display = 'none';
            }, 5000);
        } else {
            alert(`Dashboard Error: ${errorMessage}`);
        }
        
        // Set default values on error
        const totalElement = document.getElementById('total-expenses');
        const monthElement = document.getElementById('month-expenses');
        const countElement = document.getElementById('transaction-count');
        
        if (totalElement) totalElement.textContent = '$0.00';
        if (monthElement) monthElement.textContent = '$0.00';
        if (countElement) countElement.textContent = '0';
    } finally {
        showLoading(false);
    }
}

function renderCategoryChart(categoryTotals) {
    const chartContainer = document.getElementById('category-chart');
    chartContainer.innerHTML = '';

    const maxAmount = Math.max(...Object.values(categoryTotals), 1);
    const sortedCategories = Object.entries(categoryTotals)
        .sort((a, b) => b[1] - a[1]);

    if (sortedCategories.length === 0) {
        chartContainer.innerHTML = '<p class="empty-state">No expenses yet</p>';
        return;
    }

    sortedCategories.forEach(([category, amount]) => {
        const barContainer = document.createElement('div');
        barContainer.className = 'category-bar';
        
        const bar = document.createElement('div');
        bar.className = 'bar';
        bar.style.width = `${(amount / maxAmount) * 100}%`;
        
        const label = document.createElement('div');
        label.className = 'category-label';
        label.textContent = `${category}: ${formatCurrency(amount)}`;
        
        barContainer.appendChild(bar);
        barContainer.appendChild(label);
        chartContainer.appendChild(barContainer);
    });
}

function checkAuth() {
    const token = localStorage.getItem('idToken');
    const email = localStorage.getItem('userEmail');
    
    if (token && email) {
        // Check token expiration
        if (isTokenExpired(token)) {
            console.log('Token expired, clearing authentication');
            localStorage.clear();
            return false;
        }
        
        state.idToken = token;
        state.user = { email };
        showMainScreen();
        return true;
    }
    return false;
}

// Original functions that would need to be added from the rest of the file...
// [Rest of the original app.js content would continue here]

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    // Check if this is an OAuth callback
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    
    // Handle OAuth callback if present
    if (code && (window.location.pathname === '/' || window.location.pathname.includes('callback'))) {
        if (typeof handleOAuthCallback === 'function') {
            await handleOAuthCallback();
        }
        return;
    }
    
    // Check authentication on load (using consolidated function)
    if (!checkAuthentication()) {
        showAuthScreen();
    } else {
        showMainScreen();
    }

    // Only initialize dashboard-specific event listeners if on dashboard page
    const isDashboardPage = document.getElementById('expense-form') !== null;
    
    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.view === 'settings') {
                window.location.href = 'settings.html';
            } else {
                switchView(btn.dataset.view);
            }
        });
    });

    // Logout button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            if (typeof logoutWithOAuth === 'function') {
                logoutWithOAuth();
            } else {
                localStorage.clear();
                showAuthScreen();
            }
        });
    }
});