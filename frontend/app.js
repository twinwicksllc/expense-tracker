// Configuration
const CONFIG = {
    API_BASE_URL: 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod',
    COGNITO: {
        USER_POOL_ID: 'us-east-1_7H7R5DVZT',
        CLIENT_ID: 'pk3l1fkkre0ms4si0prabfavl',
        REGION: 'us-east-1'
    }
};

// State Management
const state = {
    user: null,
    idToken: null,
    expenses: [],
    currentView: 'dashboard'
};

// Utility Functions
const VALID_CATEGORIES = ['Office Supplies', 'Travel', 'Meals', 'Software', 'Equipment', 'Marketing', 'Other'];

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
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 5000);
}

function showSuccess(elementId, message) {
    const element = document.getElementById(elementId);
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 5000);
}

function showLoading(show = true) {
    document.getElementById('loading-overlay').style.display = show ? 'flex' : 'none';
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

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Authentication Functions (Simplified - using API endpoints)
async function signup(email, password) {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Signup failed');
        }

        return data;
    } catch (error) {
        throw error;
    }
}

async function confirmSignup(email, code) {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/auth/confirm`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, code })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Confirmation failed');
        }

        return data;
    } catch (error) {
        throw error;
    }
}

async function login(email, password) {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || 'Login failed');
        }

        // Store authentication data
        state.user = { email };
        state.idToken = data.idToken;
        localStorage.setItem('idToken', data.idToken);
        localStorage.setItem('userEmail', email);

        return data;
    } catch (error) {
        throw error;
    }
}

function logout() {
    state.user = null;
    state.idToken = null;
    localStorage.removeItem('idToken');
    localStorage.removeItem('userEmail');
    showAuthScreen();
}

function checkAuth() {
    const token = localStorage.getItem('idToken');
    const email = localStorage.getItem('userEmail');
    
    if (token && email) {
        state.idToken = token;
        state.user = { email };
        showMainScreen();
        return true;
    }
    return false;
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

    const response = await fetch(`${CONFIG.API_BASE_URL}${endpoint}`, {
        ...options,
        headers
    });

    if (response.status === 401) {
        logout();
        throw new Error('Session expired. Please login again.');
    }

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.message || 'Request failed');
    }

    return data;
}

async function parseReceipt(file) {
    // Step 1: Get pre-signed upload URL
    const urlResponse = await fetch(`${CONFIG.API_BASE_URL}/upload-url`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.idToken}`
        },
        body: JSON.stringify({
            fileName: file.name,
            contentType: file.type
        })
    });

    if (!urlResponse.ok) {
        throw new Error('Failed to get upload URL');
    }

    const { uploadUrl, s3Key } = await urlResponse.json();

    // Step 2: Upload file directly to S3
    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            'Content-Type': file.type
        },
        body: file
    });

    if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
    }

    // Step 3: Call parse-receipt API with S3 key
    const parseResponse = await fetch(`${CONFIG.API_BASE_URL}/parse-receipt`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.idToken}`
        },
        body: JSON.stringify({ s3Key })
    });

    if (!parseResponse.ok) {
        throw new Error('Failed to parse receipt');
    }

    return await parseResponse.json();
}

async function createExpense(expenseData) {
    // expenseData already contains s3Key from parseReceipt
    const response = await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.idToken}`
        },
        body: JSON.stringify(expenseData)
    });

    if (!response.ok) {
        throw new Error('Failed to create expense');
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

// UI Functions
function showAuthScreen() {
    document.getElementById('auth-screen').style.display = 'block';
    document.getElementById('main-screen').style.display = 'none';
}

function showMainScreen() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('main-screen').style.display = 'block';
    document.getElementById('user-email').textContent = state.user.email;
    loadDashboard();
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
    }
}

async function loadDashboard() {
    try {
        showLoading();
        const expenses = await getExpenses();
        state.expenses = expenses;

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

        // Update stats
        document.getElementById('total-expenses').textContent = formatCurrency(total);
        document.getElementById('month-expenses').textContent = formatCurrency(monthTotal);
        document.getElementById('transaction-count').textContent = expenses.length;

        // Calculate category totals
        const categoryTotals = {};
        expenses.forEach(exp => {
            categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + exp.amount;
        });

        // Render category chart
        renderCategoryChart(categoryTotals);
    } catch (error) {
        console.error('Failed to load dashboard:', error);
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
        const percentage = (amount / maxAmount) * 100;
        
        const barHTML = `
            <div class="category-bar">
                <div class="category-name">${category}</div>
                <div class="bar-container">
                    <div class="bar-fill" style="width: ${percentage}%"></div>
                </div>
                <div class="category-amount">${formatCurrency(amount)}</div>
            </div>
        `;
        
        chartContainer.insertAdjacentHTML('beforeend', barHTML);
    });
}

async function loadExpenses() {
    try {
        showLoading();
        const sortBy = document.getElementById('sort-by').value;
        const category = document.getElementById('filter-category').value;
        const projectId = document.getElementById('filter-project').value;

        const [sortField, sortOrder] = sortBy.split('-');
        
        const filters = {
            sortBy: sortField,
            order: sortOrder
        };
        
        // Only add category filter if it has a value
        if (category && category !== '') {
            filters.category = category;
        }
        
        // Only add project filter if it has a value
        if (projectId && projectId !== '') {
            filters.projectId = projectId;
        }
        
        const expenses = await getExpenses(filters);

        state.expenses = expenses;
        renderExpensesList(expenses);
    } catch (error) {
        console.error('Failed to load expenses:', error);
    } finally {
        showLoading(false);
    }
}

function renderExpensesList(expenses) {
    const listContainer = document.getElementById('expenses-list');
    listContainer.innerHTML = '';

    if (expenses.length === 0) {
        listContainer.innerHTML = `
            <div class="empty-state">
                <h3>No expenses found</h3>
                <p>Start by adding your first expense</p>
            </div>
        `;
        return;
    }

    expenses.forEach(expense => {
        const cardHTML = `
            <div class="expense-card">
                <div class="expense-info">
                    <div class="expense-header">
                        <span class="expense-vendor">${expense.vendor}</span>
                        <span class="expense-category">${expense.category}</span>
                    </div>
                    ${expense.projectName ? `<div class="expense-project">📁 ${expense.projectName}</div>` : ''}
                    ${expense.description ? `<div class="expense-description">${expense.description}</div>` : ''}
                    <div class="expense-meta">
                        <span>Transaction: ${formatDate(expense.transactionDate)}</span>
                        <span>Uploaded: ${formatDate(expense.uploadDate)}</span>
                        ${expense.receiptUrl ? `<a href="${expense.receiptUrl}" target="_blank" class="receipt-link">View Receipt</a>` : ''}
                    </div>
                </div>
                <div class="expense-amount-section">
                    <div class="expense-amount">${formatCurrency(expense.amount)}</div>
                </div>
                <div class="expense-actions">
                    <button class="btn btn-secondary btn-small" onclick="editExpense('${expense.transactionId}')">Edit</button>
                    <button class="btn btn-danger btn-small" onclick="confirmDeleteExpense('${expense.transactionId}')">Delete</button>
                </div>
            </div>
        `;
        
        listContainer.insertAdjacentHTML('beforeend', cardHTML);
    });
}

function resetExpenseForm() {
    document.getElementById('expense-form').reset();
    document.getElementById('receipt-input').value = '';
    document.getElementById('preview-section').style.display = 'none';
    document.getElementById('upload-area').style.display = 'block';
    document.getElementById('parsing-status').style.display = 'none';
    
    // Clear s3Key state
    state.currentReceiptS3Key = null;
    
    // Set today's date as default
    document.getElementById('expense-date').valueAsDate = new Date();
}

async function handleReceiptUpload(file) {
    const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    
    if (!file || !allowedTypes.includes(file.type)) {
        showError('expense-error', 'Please upload an image, PDF, or Word document');
        return;
    }

    // Show preview (only for images)
    if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('receipt-preview').src = e.target.result;
            document.getElementById('upload-area').style.display = 'none';
            document.getElementById('preview-section').style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        // For PDFs and docs, show file name instead of preview
        document.getElementById('receipt-preview').style.display = 'none';
        document.getElementById('upload-area').style.display = 'none';
        document.getElementById('preview-section').style.display = 'block';
        const fileName = document.createElement('p');
        fileName.textContent = `File: ${file.name}`;
        fileName.style.padding = '20px';
        fileName.style.textAlign = 'center';
        const previewSection = document.getElementById('preview-section');
        previewSection.insertBefore(fileName, previewSection.firstChild);
    }

    // Parse receipt
    try {
        document.getElementById('parsing-status').style.display = 'block';
        const parsed = await parseReceipt(file);
        
        // Store s3Key in state for later use
        state.currentReceiptS3Key = parsed.s3Key;
        
        // Populate form with parsed data
        if (parsed.vendor) document.getElementById('expense-vendor').value = parsed.vendor;
        if (parsed.amount) document.getElementById('expense-amount').value = parsed.amount;
        if (parsed.date) document.getElementById('expense-date').value = parsed.date;
        if (parsed.category) document.getElementById('expense-category').value = parsed.category;
        
        document.getElementById('parsing-status').style.display = 'none';
    } catch (error) {
        console.error('Failed to parse receipt:', error);
        document.getElementById('parsing-status').style.display = 'none';
        // Continue anyway - user can fill in manually
    }
}

function editExpense(transactionId) {
    const expense = state.expenses.find(e => e.transactionId === transactionId);
    if (!expense) return;

    // Populate edit form
    document.getElementById('edit-transaction-id').value = expense.transactionId;
    document.getElementById('edit-vendor').value = expense.vendor;
    document.getElementById('edit-amount').value = expense.amount;
    document.getElementById('edit-date').value = expense.transactionDate;
    document.getElementById('edit-category').value = expense.category;
    document.getElementById('edit-project').value = expense.projectId || '';
    document.getElementById('edit-description').value = expense.description || '';

    // Show modal
    document.getElementById('edit-modal').classList.add('show');
}

async function confirmDeleteExpense(transactionId) {
    if (!confirm('Are you sure you want to delete this expense?')) {
        return;
    }

    try {
        showLoading();
        await deleteExpense(transactionId);
        await loadExpenses();
        if (state.currentView === 'dashboard') {
            await loadDashboard();
        }
    } catch (error) {
        alert('Failed to delete expense: ' + error.message);
    } finally {
        showLoading(false);
    }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication on load
    if (!checkAuth()) {
        showAuthScreen();
    }

    // Auth tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
            document.getElementById(`${tab}-form`).classList.add('active');
        });
    });

    // Login form
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        try {
            showLoading();
            await login(email, password);
            showMainScreen();
        } catch (error) {
            showError('login-error', error.message);
        } finally {
            showLoading(false);
        }
    });

    // Signup form
    document.getElementById('signup-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('signup-email').value;
        const password = document.getElementById('signup-password').value;
        const confirm = document.getElementById('signup-confirm').value;

        if (password !== confirm) {
            showError('signup-error', 'Passwords do not match');
            return;
        }

        try {
            showLoading();
            await signup(email, password);
            showSuccess('signup-success', 'Account created! Check your email for confirmation code.');
            // Show confirmation code input
            document.getElementById('confirmation-section').style.display = 'block';
            document.getElementById('confirmation-email').value = email;
            document.getElementById('signup-form').reset();
            
            // Switch to login tab after 2 seconds
            setTimeout(() => {
                document.querySelector('.tab-btn[data-tab="login"]').click();
            }, 2000);
        } catch (error) {
            showError('signup-error', error.message);
        } finally {
            showLoading(false);
        }
    });

    // Confirmation form
    document.getElementById('confirm-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('confirmation-email').value;
        const code = document.getElementById('confirmation-code').value;

        try {
            showLoading();
            await confirmSignup(email, code);
            showSuccess('confirm-success', 'Email confirmed! You can now login.');
            document.getElementById('confirmation-section').style.display = 'none';
            document.getElementById('confirm-form').reset();
            // Switch to login tab
            setTimeout(() => {
                document.querySelector('.tab-btn[data-tab="login"]').click();
            }, 2000);
        } catch (error) {
            showError('confirm-error', error.message);
        } finally {
            showLoading(false);
        }
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', logout);

    // Navigation
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchView(btn.dataset.view);
        });
    });

    // Receipt upload
    const uploadArea = document.getElementById('upload-area');
    const receiptInput = document.getElementById('receipt-input');

    uploadArea.addEventListener('click', () => receiptInput.click());

    receiptInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleReceiptUpload(e.target.files[0]);
        }
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
        
        if (e.dataTransfer.files.length > 0) {
            receiptInput.files = e.dataTransfer.files;
            handleReceiptUpload(e.dataTransfer.files[0]);
        }
    });

    // Remove receipt
    document.getElementById('remove-receipt').addEventListener('click', () => {
        receiptInput.value = '';
        document.getElementById('preview-section').style.display = 'none';
        document.getElementById('upload-area').style.display = 'block';
    });

    // Expense form submission
    document.getElementById('expense-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const expenseData = {
            vendor: document.getElementById('expense-vendor').value,
            amount: parseFloat(document.getElementById('expense-amount').value),
            date: document.getElementById('expense-date').value,
            category: document.getElementById('expense-category').value,
            description: document.getElementById('expense-description').value,
            projectId: document.getElementById('expense-project').value || null,
            notes: ''
        };
        
        // Validate form data
        const validation = validateExpenseForm(expenseData);
        if (!validation.isValid) {
            showError('expense-error', validation.errors.join(', '));
            return;
        }
        
        // Only include s3Key if a receipt was uploaded
        if (state.currentReceiptS3Key) {
            expenseData.s3Key = state.currentReceiptS3Key;
        }

        try {
            showLoading();
            await createExpense(expenseData);
            showSuccess('expense-success', 'Expense added successfully!');
            
            setTimeout(() => {
                switchView('expenses');
            }, 1500);
        } catch (error) {
            showError('expense-error', error.message);
        } finally {
            showLoading(false);
        }
    });

    // Cancel expense
    document.getElementById('cancel-expense').addEventListener('click', () => {
        switchView('expenses');
    });

    // Edit expense form
    document.getElementById('edit-expense-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const transactionId = document.getElementById('edit-transaction-id').value;
        const updates = {
            vendor: document.getElementById('edit-vendor').value,
            amount: parseFloat(document.getElementById('edit-amount').value),
            transactionDate: document.getElementById('edit-date').value,
            category: document.getElementById('edit-category').value,
            projectId: document.getElementById('edit-project').value || null,
            description: document.getElementById('edit-description').value
        };

        // Validate form data
        const validation = validateExpenseForm({
            vendor: updates.vendor,
            amount: updates.amount,
            date: updates.transactionDate,
            category: updates.category,
            description: updates.description
        });
        if (!validation.isValid) {
            showError('edit-error', validation.errors.join(', '));
            return;
        }

        try {
            showLoading();
            await updateExpense(transactionId, updates);
            document.getElementById('edit-modal').classList.remove('show');
            await loadExpenses();
            if (state.currentView === 'dashboard') {
                await loadDashboard();
            }
        } catch (error) {
            showError('edit-error', error.message);
        } finally {
            showLoading(false);
        }
    });

    // Close modal
    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', () => {
            document.getElementById('edit-modal').classList.remove('show');
        });
    });

    // Filters
    document.getElementById('sort-by').addEventListener('change', loadExpenses);
    document.getElementById('filter-category').addEventListener('change', loadExpenses);
    document.getElementById('filter-project').addEventListener('change', loadExpenses);
    
    // Initialize project events
    initializeProjectEvents();
    
    // Load projects on app start if authenticated
    if (checkAuth()) {
        loadProjectDropdowns().catch(console.error);
    }
});

// Projects Module - Add this to app.js

// Project API functions
const ProjectAPI = {
    baseURL: 'https://fcnq8h7mai.execute-api.us-east-1.amazonaws.com/prod',
    
    async getProjects() {
        const token = localStorage.getItem('idToken');
        const response = await fetch(`${this.baseURL}/projects`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch projects');
        }
        
        return await response.json();
    },
    
    async createProject(projectData) {
        const token = localStorage.getItem('idToken');
        const response = await fetch(`${this.baseURL}/projects`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(projectData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to create project');
        }
        
        return await response.json();
    },
    
    async updateProject(projectId, projectData) {
        const token = localStorage.getItem('idToken');
        const response = await fetch(`${this.baseURL}/projects/${projectId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(projectData)
        });
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Failed to update project');
        }
        
        return await response.json();
    },
    
    async deleteProject(projectId) {
        const token = localStorage.getItem('idToken');
        const response = await fetch(`${this.baseURL}/projects/${projectId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error('Failed to delete project');
        }
        
        return await response.json();
    }
};

// Project UI State
let allProjects = [];
let currentEditingProject = null;

// Load projects
async function loadProjects() {
    try {
        showLoading();
        allProjects = await ProjectAPI.getProjects();
        renderProjects();
        await loadProjectDropdowns();
    } catch (error) {
        console.error('Error loading projects:', error);
        showError('Failed to load projects');
    } finally {
        hideLoading();
    }
}

// Render projects list
function renderProjects() {
    const projectsList = document.getElementById('projects-list');
    
    if (!allProjects || allProjects.length === 0) {
        projectsList.innerHTML = `
            <div class="empty-state">
                <h3>No Projects Yet</h3>
                <p>Create your first project to start organizing expenses by client or project.</p>
            </div>
        `;
        return;
    }
    
    projectsList.innerHTML = allProjects.map(project => `
        <div class="project-card">
            <div class="project-header">
                <h3 class="project-name">${escapeHtml(project.name)}</h3>
                <div class="project-actions">
                    <button class="btn btn-secondary" onclick="editProject('${project.projectId}')">Edit</button>
                    <button class="btn btn-danger" onclick="deleteProjectConfirm('${project.projectId}', '${escapeHtml(project.name)}')">Delete</button>
                </div>
            </div>
            ${project.description ? `<p class="project-description">${escapeHtml(project.description)}</p>` : ''}
            <div class="project-stats">
                <div class="project-stat">
                    <span class="project-stat-label">Total Expenses</span>
                    <span class="project-stat-value">$${(project.totalAmount || 0).toFixed(2)}</span>
                </div>
                <div class="project-stat">
                    <span class="project-stat-label">Expense Count</span>
                    <span class="project-stat-value">${project.expenseCount || 0}</span>
                </div>
            </div>
        </div>
    `).join('');
}

// Load project dropdowns
async function loadProjectDropdowns() {
    const expenseProjectSelect = document.getElementById('expense-project');
    const editProjectSelect = document.getElementById('edit-project');
    const filterProjectSelect = document.getElementById('filter-project');
    
    const projectOptions = allProjects.map(project => 
        `<option value="${project.projectId}">${escapeHtml(project.name)}</option>`
    ).join('');
    
    if (expenseProjectSelect) {
        expenseProjectSelect.innerHTML = '<option value="">No Project</option>' + projectOptions;
    }
    
    if (editProjectSelect) {
        editProjectSelect.innerHTML = '<option value="">No Project</option>' + projectOptions;
    }
    
    if (filterProjectSelect) {
        filterProjectSelect.innerHTML = '<option value="">All Projects</option>' + projectOptions;
    }
}

// Show project modal
function showProjectModal(projectId = null) {
    const modal = document.getElementById('project-modal');
    const modalTitle = document.getElementById('project-modal-title');
    const projectIdInput = document.getElementById('project-id');
    const projectNameInput = document.getElementById('project-name');
    const projectDescInput = document.getElementById('project-description');
    const projectError = document.getElementById('project-error');
    
    // Clear error
    projectError.textContent = '';
    
    if (projectId) {
        // Edit mode
        const project = allProjects.find(p => p.projectId === projectId);
        if (project) {
            modalTitle.textContent = 'Edit Project';
            projectIdInput.value = project.projectId;
            projectNameInput.value = project.name;
            projectDescInput.value = project.description || '';
            currentEditingProject = project;
        }
    } else {
        // Add mode
        modalTitle.textContent = 'Add Project';
        projectIdInput.value = '';
        projectNameInput.value = '';
        projectDescInput.value = '';
        currentEditingProject = null;
    }
    
    modal.style.display = 'flex';
}

// Hide project modal
function hideProjectModal() {
    const modal = document.getElementById('project-modal');
    modal.style.display = 'none';
    currentEditingProject = null;
}

// Edit project
function editProject(projectId) {
    showProjectModal(projectId);
}

// Delete project confirmation
function deleteProjectConfirm(projectId, projectName) {
    if (confirm(`Are you sure you want to delete the project "${projectName}"?\n\nThis will not delete associated expenses, but will remove the project assignment from them.`)) {
        deleteProject(projectId);
    }
}

// Delete project
async function deleteProject(projectId) {
    try {
        showLoading();
        await ProjectAPI.deleteProject(projectId);
        await loadProjects();
        showSuccess('Project deleted successfully');
    } catch (error) {
        console.error('Error deleting project:', error);
        showError('Failed to delete project');
    } finally {
        hideLoading();
    }
}

// Handle project form submission
async function handleProjectFormSubmit(e) {
    e.preventDefault();
    
    const projectId = document.getElementById('project-id').value;
    const projectName = document.getElementById('project-name').value.trim();
    const projectDesc = document.getElementById('project-description').value.trim();
    const projectError = document.getElementById('project-error');
    
    // Validation
    if (!projectName) {
        projectError.textContent = 'Project name is required';
        return;
    }
    
    if (projectName.length > 120) {
        projectError.textContent = 'Project name must be 120 characters or less';
        return;
    }
    
    if (projectDesc && projectDesc.length > 500) {
        projectError.textContent = 'Description must be 500 characters or less';
        return;
    }
    
    try {
        showLoading();
        projectError.textContent = '';
        
        const projectData = {
            name: projectName,
            description: projectDesc
        };
        
        if (projectId) {
            // Update existing project
            await ProjectAPI.updateProject(projectId, projectData);
            showSuccess('Project updated successfully');
        } else {
            // Create new project
            await ProjectAPI.createProject(projectData);
            showSuccess('Project created successfully');
        }
        
        hideProjectModal();
        await loadProjects();
    } catch (error) {
        console.error('Error saving project:', error);
        projectError.textContent = error.message || 'Failed to save project';
    } finally {
        hideLoading();
    }
}

// Initialize project event listeners
function initializeProjectEvents() {
    // Add project button
    const addProjectBtn = document.getElementById('add-project-btn');
    if (addProjectBtn) {
        addProjectBtn.addEventListener('click', () => showProjectModal());
    }
    
    // Project form
    const projectForm = document.getElementById('project-form');
    if (projectForm) {
        projectForm.addEventListener('submit', handleProjectFormSubmit);
    }
    
    // Modal close buttons
    const projectModal = document.getElementById('project-modal');
    if (projectModal) {
        const closeButtons = projectModal.querySelectorAll('.close-modal');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', hideProjectModal);
        });
        
        // Close on outside click
        projectModal.addEventListener('click', (e) => {
            if (e.target === projectModal) {
                hideProjectModal();
            }
        });
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Export functions to global scope
window.loadProjects = loadProjects;
window.editProject = editProject;
window.deleteProjectConfirm = deleteProjectConfirm;
window.showProjectModal = showProjectModal;
window.hideProjectModal = hideProjectModal;

