// Init
   window.onload = function() {
       if(checkAuth()) {
           loadProjectsList(); // Populate select dropdowns
           updateDashboard();
           checkAwsCredentials(); // Check if AWS credentials are configured
       }
   };
   
   // UI Logic
   function showTab(tabId) {
       document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
       document.getElementById(tabId).classList.add('active');
   }
   
   // ---------------------------
   // RECEIPT PARSING (AI)
   // ---------------------------
   async function handleFileUpload() {
       const fileInput = document.getElementById('receipt-upload');
       const file = fileInput.files[0];
       if (!file) {
           Toast.warning("Please select a file");
           return;
       }
   
       const btn = document.getElementById('btn-parse');
       btn.disabled = true;
       btn.innerText = "Processing...";
       
       try {
           const authHeader = `Bearer ${getToken()}`;
           let urlRes;
           try {
               urlRes = await fetch(`${CONFIG.API_BASE_URL}/upload-url`, {
                   method: 'POST',
                   mode: 'cors',
                   credentials: 'same-origin',
                   headers: { 
                       'Authorization': authHeader, 
                       'Content-Type': 'application/json',
                       'X-Requested-With': 'XMLHttpRequest'
                   },
                   body: JSON.stringify({ fileName: file.name, fileType: file.type })
               });
           } catch (networkError) {
               throw new Error('Network error: Please check your internet connection');
           }
           
           if (!urlRes.ok) {
               throw new Error(`Upload URL request failed: ${urlRes.status}`);
           }
           
           const { uploadUrl, key } = await urlRes.json();
           
           if (!uploadUrl || typeof uploadUrl !== 'string') {
               throw new Error('Invalid upload URL from server');
           }
           
           const urlObj = new URL(uploadUrl);
           if (!urlObj.hostname.includes('s3') && !urlObj.hostname.includes('amazonaws')) {
               throw new Error('Upload URL must be an S3 URL');
           }
   
           const s3Upload = await fetch(uploadUrl, { method: 'PUT', body: file });
           if (!s3Upload.ok) {
               throw new Error(`S3 upload failed: ${s3Upload.status}`);
           }
   
           const parseRes = await fetch(`${CONFIG.API_BASE_URL}/parse-receipt`, {
               method: 'POST',
               mode: 'cors',
               headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
               body: JSON.stringify({ fileKey: key })
           });
           
           if (!parseRes.ok) {
               throw new Error(`Receipt parsing failed: ${parseRes.status}`);
           }
           
           const data = await parseRes.json();
           
           document.getElementById('exp-vendor').value = data.vendor || '';
           document.getElementById('exp-amount').value = data.amount || '';
           document.getElementById('exp-date').value = data.date || '';
           document.getElementById('exp-category').value = data.category || '';
           document.getElementById('exp-tax').checked = Boolean(data.taxDeductible);
           if (!key || typeof key !== 'string' || key.includes('..') || key.includes('//')) {
               throw new Error('Invalid key from server');
           }
           document.getElementById('exp-url').value = `https://${CONFIG.RECEIPTS_BUCKET}.s3.amazonaws.com/${key}`;
           
           Toast.success("Receipt Parsed Successfully!");
   
       } catch (e) {
           Logger.error('Failed to upload and parse receipt', {
               error: e.message,
               stack: e.stack,
               fileName: file.name,
               fileType: file.type,
               fileSize: file.size,
               action: 'handleFileUpload',
               isSSRFAttempt: e.message.includes('S3 URL')
           });
           Toast.error(`Error parsing receipt: ${e.message}`);
       } finally {
           btn.disabled = false;
           btn.innerText = "Upload & Parse";
       }
   }
   
   // ---------------------------
   // DATA SAVING
   // ---------------------------
   async function saveExpense(e) {
       e.preventDefault();
       
       const vendor = document.getElementById('exp-vendor').value.trim();
       const amount = parseFloat(document.getElementById('exp-amount').value);
       const date = document.getElementById('exp-date').value;
       const category = document.getElementById('exp-category').value;
       
       if (!vendor || !amount || !date || !category) {
           Toast.warning('Please fill in all required fields');
           return;
       }
       
       if (isNaN(amount) || amount <= 0) {
           Toast.error('Please enter a valid amount');
           return;
       }
       
       const expense = {
           vendor: vendor,
           description: document.getElementById('exp-desc').value.trim(),
           amount: amount,
           date: date,
           category: category,
           projectId: document.getElementById('exp-project-select').value || null,
           taxDeductible: document.getElementById('exp-tax').checked,
           receiptUrl: document.getElementById('exp-url').value.trim(),
           type: 'expense' 
       };
   
       try {
           const res = await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
               method: 'POST',
               mode: 'cors',
               credentials: 'same-origin',
               headers: { 
                   'Authorization': `Bearer ${getToken()}`, 
                   'Content-Type': 'application/json',
                   'X-Requested-With': 'XMLHttpRequest'
               },
               body: JSON.stringify(expense)
           });
           
           if (!res.ok) {
               const errorData = await res.json().catch(() => ({}));
               throw new Error(errorData.error || `Request failed: ${res.status}`);
           }
           
           Toast.success('Expense Saved');
           document.getElementById('exp-vendor').value = '';
           document.getElementById('exp-desc').value = '';
           document.getElementById('exp-amount').value = '';
           document.getElementById('exp-date').value = '';
           document.getElementById('exp-category').value = '';
           document.getElementById('exp-project-select').value = '';
           document.getElementById('exp-tax').checked = false;
           document.getElementById('exp-url').value = '';
       } catch (e) {
           Logger.error('Failed to save expense', {
               error: e.message,
               stack: e.stack,
               expense: { vendor, amount, date, category },
               action: 'saveExpense'
           });
           Toast.error('Error saving expense: ' + e.message);
       }
   }
   
   async function saveProject(e) {
       e.preventDefault();
       
       const name = document.getElementById('proj-name').value.trim();
       const category = document.getElementById('proj-category').value;
       
       if (!name || !category) {
           Toast.warning('Please fill in project name and category');
           return;
       }
       
       const project = {
           name: name,
           category: category,
           startDate: document.getElementById('proj-start').value,
           endDate: document.getElementById('proj-end').value,
           description: document.getElementById('proj-desc').value.trim(),
           type: 'project'
       };
   
       try {
           const res = await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
               method: 'POST',
               mode: 'cors',
               credentials: 'same-origin',
               headers: { 
                   'Authorization': `Bearer ${getToken()}`, 
                   'Content-Type': 'application/json',
                   'X-Requested-With': 'XMLHttpRequest'
               },
               body: JSON.stringify(project)
           });
           
           if (!res.ok) {
               const errorData = await res.json().catch(() => ({}));
               throw new Error(errorData.error || `Request failed: ${res.status}`);
           }
           
           Toast.success('Project Created');
           document.getElementById('proj-name').value = '';
           document.getElementById('proj-category').value = '';
           document.getElementById('proj-start').value = '';
           document.getElementById('proj-end').value = '';
           document.getElementById('proj-desc').value = '';
           loadProjectsList();
       } catch (e) {
           Logger.error('Failed to save project', {
               error: e.message,
               stack: e.stack,
               project: { name, category },
               action: 'saveProject'
           });
           Toast.error('Error saving project: ' + e.message);
       }
   }
   
   async function loadProjectsList() {
       // Fetch all items and filter for projects (MVP style)
       try {
           const res = await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
               mode: 'cors',
               headers: { 'Authorization': `Bearer ${getToken()}` }
           });
           if (!res.ok) {
               throw new Error(`Failed to load projects: ${res.status}`);
           }
           const items = await res.json();
           const projects = Array.isArray(items) ? items.filter(i => i.type === 'project') : [];
           
           const select = document.getElementById('exp-project-select');
           if (!select) return;
           select.innerHTML = '<option value="">None</option>';
           projects.forEach(p => {
               const opt = document.createElement('option');
               opt.value = p.transactionId; // using transactionId as projectId
               opt.innerText = p.name;
               select.appendChild(opt);
           });
       } catch (e) {
           Logger.error('Failed to load projects list', {
               error: e.message,
               stack: e.stack,
               action: 'loadProjectsList'
           });
       }
   }

   async function saveAwsSettings() {
       const accessKey = document.getElementById('aws-access-key').value.trim();
       const secretKey = document.getElementById('aws-secret-key').value.trim();

       if(!accessKey || !secretKey) {
           Toast.warning("Please fill both fields");
           return;
       }

       try {
           const res = await fetch(`${CONFIG.API_BASE_URL}/aws-credentials`, {
               method: 'POST',
               mode: 'cors',
               credentials: 'same-origin',
               headers: { 
                   'Authorization': `Bearer ${getToken()}`, 
                   'Content-Type': 'application/json',
                   'X-Requested-With': 'XMLHttpRequest'
               },
               body: JSON.stringify({ accessKeyId: accessKey, secretAccessKey: secretKey })
           });

           if (res.ok) {
               Toast.success("Credentials Encrypted & Saved");
               document.getElementById('aws-access-key').value = '';
               document.getElementById('aws-secret-key').value = '';
               checkAwsCredentials();
           } else {
               const errorData = await res.json().catch(() => ({}));
               Toast.error(`Error saving settings: ${errorData.error || 'Unknown error'}`);
           }
       } catch (e) {
           Logger.error('Failed to save AWS credentials', {
               error: e.message,
               stack: e.stack,
               action: 'saveAwsSettings'
           });
           Toast.error(`Network error: ${e.message}`);
       }
   }

   async function checkAwsCredentials() {
       try {
           const res = await fetch(`${CONFIG.API_BASE_URL}/aws-credentials`, {
               mode: 'cors',
               headers: { 'Authorization': `Bearer ${getToken()}` }
           });
           const settings = await res.json();
           
           if (settings.configured) {
               document.getElementById('aws-import-section').style.display = 'block';
               document.getElementById('aws-credentials-needed').style.display = 'none';
           } else {
               document.getElementById('aws-import-section').style.display = 'none';
               document.getElementById('aws-credentials-needed').style.display = 'block';
           }
       } catch (e) {
           Logger.error('Failed to check AWS credentials', {
               error: e.message,
               stack: e.stack,
               action: 'checkAwsCredentials'
           });
           document.getElementById('aws-import-section').style.display = 'none';
           document.getElementById('aws-credentials-needed').style.display = 'block';
       }
   }

   async function importAwsExpenses() {
       const period = document.getElementById('aws-import-period').value;
       const statusDiv = document.getElementById('aws-import-status');
       
       statusDiv.className = 'loading';
       statusDiv.innerHTML = `Importing AWS expenses for the last ${period} month(s)... This may take a few minutes.`;
       
       try {
           const res = await fetch(`${CONFIG.API_BASE_URL}/aws-cost-import`, {
               method: 'POST',
               mode: 'cors',
               credentials: 'same-origin',
               headers: { 
                   'Authorization': `Bearer ${getToken()}`, 
                   'Content-Type': 'application/json',
                   'X-Requested-With': 'XMLHttpRequest'
               },
               body: JSON.stringify({ months: parseInt(period) })
           });
           
           const result = await res.json().catch(() => ({}));
           
           if (!res.ok) {
               throw new Error(result.error || `Request failed: ${res.status}`);
           }
           statusDiv.className = 'success';
           const totalAmount = typeof result.totalAmount === 'number' && !isNaN(result.totalAmount) ? result.totalAmount : 0;
           statusDiv.innerHTML = `Successfully imported ${result.count || 0} AWS expenses! Total amount: $${totalAmount.toFixed(2)}`;
           try {
               updateDashboard();
               loadProjectsList();
           } catch (refreshError) {
               Logger.error('Failed to refresh dashboard after import', {
                   error: refreshError.message,
                   action: 'importAwsExpenses'
               });
           }
       } catch (e) {
           Logger.error('Failed to import AWS expenses', {
               error: e.message,
               stack: e.stack,
               period: period,
               endpoint: `${CONFIG.API_BASE_URL}/aws-cost-import`,
               action: 'importAwsExpenses'
           });
           statusDiv.className = 'error';
           statusDiv.innerHTML = `Error importing AWS expenses: ${e.message}`;
       }
   }