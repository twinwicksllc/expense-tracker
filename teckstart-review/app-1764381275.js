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
       if (!file) return alert("Please select a file");
   
       document.getElementById('btn-parse').innerText = "Processing...";
       
       try {
           // 1. Get Pre-signed URL
           const authHeader = `Bearer ${getToken()}`;
           const urlRes = await fetch(`${CONFIG.API_BASE_URL}/upload-url`, {
               method: 'POST',
               mode: 'cors',
               headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
               body: JSON.stringify({ fileName: file.name, fileType: file.type })
           });
           const { uploadUrl, key } = await urlRes.json();
   
           // 2. Upload to S3
           await fetch(uploadUrl, { method: 'PUT', body: file });
   
           // 3. Trigger AI Parse Lambda
           const parseRes = await fetch(`${CONFIG.API_BASE_URL}/parse-receipt`, {
               method: 'POST',
               mode: 'cors',
               headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
               body: JSON.stringify({ fileKey: key })
           });
           
           const data = await parseRes.json();
           
           // 4. Auto-fill Form
           document.getElementById('exp-vendor').value = data.vendor || '';
           document.getElementById('exp-amount').value = data.amount || '';
           document.getElementById('exp-date').value = data.date || '';
           document.getElementById('exp-category').value = data.category || 'Office';
           document.getElementById('exp-tax').checked = data.taxDeductible || false;
           document.getElementById('exp-url').value = `https://${CONFIG.RECEIPTS_BUCKET}.s3.amazonaws.com/${key}`;
           
           alert("Receipt Parsed Successfully!");
   
       } catch (e) {
           console.error(e);
           alert("Error parsing receipt");
       } finally {
           document.getElementById('btn-parse').innerText = "Upload & Parse";
       }
   }
   
   // ---------------------------
   // DATA SAVING
   // ---------------------------
   async function saveExpense(e) {
       e.preventDefault();
       const expense = {
           vendor: document.getElementById('exp-vendor').value,
           description: document.getElementById('exp-desc').value,
           amount: parseFloat(document.getElementById('exp-amount').value),
           date: document.getElementById('exp-date').value,
           category: document.getElementById('exp-category').value,
           projectId: document.getElementById('exp-project-select').value,
           taxDeductible: document.getElementById('exp-tax').checked,
           receiptUrl: document.getElementById('exp-url').value,
           type: 'expense' 
       };
   
       try {
           await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
               method: 'POST',
               mode: 'cors',
               headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
               body: JSON.stringify(expense)
           });
           alert('Expense Saved');
           e.target.reset();
       } catch (e) {
           console.error('Error saving expense:', e);
           alert('Error saving expense: ' + e.message);
       }
   }
   
   async function saveProject(e) {
       e.preventDefault();
       const project = {
           name: document.getElementById('proj-name').value,
           category: document.getElementById('proj-category').value,
           startDate: document.getElementById('proj-start').value,
           endDate: document.getElementById('proj-end').value,
           description: document.getElementById('proj-desc').value,
           type: 'project'
       };
   
       try {
           await fetch(`${CONFIG.API_BASE_URL}/expenses`, { // Reusing endpoint, differentiated by 'type'
               method: 'POST',
               mode: 'cors',
               headers: { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
               body: JSON.stringify(project)
           });
           alert('Project Created');
           e.target.reset();
           loadProjectsList();
       } catch (e) {
           console.error('Error saving project:', e);
           alert('Error saving project: ' + e.message);
       }
   }
   
   async function loadProjectsList() {
       // Fetch all items and filter for projects (MVP style)
       try {
           const res = await fetch(`${CONFIG.API_BASE_URL}/expenses`, {
               mode: 'cors',
               headers: { 'Authorization': `Bearer ${getToken()}` }
           });
           const items = await res.json();
           const projects = items.filter(i => i.type === 'project');
           
           const select = document.getElementById('exp-project-select');
           select.innerHTML = '<option value="">None</option>';
           projects.forEach(p => {
               const opt = document.createElement('option');
               opt.value = p.transactionId; // using transactionId as projectId
               opt.innerText = p.name;
               select.appendChild(opt);
           });
       } catch (e) {
           console.error('Error loading projects:', e);
       }
   }

   async function saveAwsSettings() {
       const accessKey = document.getElementById('aws-access-key').value;
       const secretKey = document.getElementById('aws-secret-key').value;

       if(!accessKey || !secretKey) return alert("Please fill both fields");

       try {
           const res = await fetch(`${CONFIG.API_BASE_URL}/aws-credentials`, {
               method: 'POST',
               mode: 'cors',
               headers: { 
                   'Authorization': `Bearer ${getToken()}`, 
                   'Content-Type': 'application/json'
               },
               body: JSON.stringify({ accessKeyId: accessKey, secretAccessKey: secretKey })
           });

           if (res.ok) {
               alert("Credentials Encrypted & Saved");
               document.getElementById('aws-access-key').value = '';
               document.getElementById('aws-secret-key').value = '';
               checkAwsCredentials();
           } else {
               const errorData = await res.json().catch(() => ({}));
               alert(`Error saving settings: ${errorData.error || 'Unknown error'}`);
           }
       } catch (e) {
           console.error('Error saving AWS settings:', e);
           alert(`Network error: ${e.message}`);
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
           console.error('Error checking AWS credentials:', e);
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
               headers: { 
                   'Authorization': `Bearer ${getToken()}`, 
                   'Content-Type': 'application/json' 
               },
               body: JSON.stringify({ months: parseInt(period) })
           });
           
           const result = await res.json();
           
           if (res.ok) {
               statusDiv.className = 'success';
               const totalAmount = typeof result.totalAmount === 'number' && !isNaN(result.totalAmount) ? result.totalAmount : 0;
               statusDiv.innerHTML = `Successfully imported ${result.count || 0} AWS expenses! Total amount: $${totalAmount.toFixed(2)}`;
               updateDashboard();
               loadProjectsList();
           } else {
               statusDiv.className = 'error';
               statusDiv.innerHTML = `Error importing AWS expenses: ${result.error || 'Unknown error'}`;
           }
       } catch (e) {
           console.error('Error importing AWS expenses:', e);
           statusDiv.className = 'error';
           statusDiv.innerHTML = `Error importing AWS expenses: ${e.message}`;
       }
   }