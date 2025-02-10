// Function to validate the form and enable/disable save button
function validateForm() {
  const urlPattern = document.getElementById('urlPattern').value;
  const modifyStatus = document.getElementById('modifyStatus').checked;
  const modifyHeaders = document.getElementById('modifyHeaders').checked;
  const modifyBody = document.getElementById('modifyBody').checked;
  const saveButton = document.getElementById('saveButton');
  const urlPatternValidation = document.getElementById('urlPatternValidation');
  const jsonValidation = document.getElementById('jsonValidation');
  
  let isValid = true;

  // Validate URL pattern
  if (!urlPattern.trim()) {
    urlPatternValidation.style.display = 'block';
    isValid = false;
  } else {
    urlPatternValidation.style.display = 'none';
  }

  // Validate that at least one modification is enabled
  if (!modifyStatus && !modifyHeaders && !modifyBody) {
    isValid = false;
  }

  // Validate status code if enabled
  if (modifyStatus) {
    const statusCode = document.getElementById('statusCode').value;
    if (!statusCode || statusCode < 100 || statusCode > 599) {
      isValid = false;
    }
  }

  // Validate headers if enabled
  if (modifyHeaders) {
    const headerRows = document.querySelectorAll('.header-row');
    let hasValidHeader = false;
    headerRows.forEach(row => {
      const name = row.querySelector('.header-name').value;
      if (name.trim()) {
        hasValidHeader = true;
      }
    });
    if (!hasValidHeader) {
      isValid = false;
    }
  }

  // Validate JSON if enabled
  if (modifyBody) {
    const jsonBody = document.getElementById('jsonBody').value;
    if (jsonBody.trim()) {
      try {
        if (!jsonBody.includes('$original')) {
          JSON.parse(jsonBody);
        }
        jsonValidation.style.display = 'none';
      } catch (e) {
        jsonValidation.style.display = 'block';
        isValid = false;
      }
    } else {
      isValid = false;
    }
  }

  saveButton.disabled = !isValid;
  return isValid;
}

// Function to remove a header row
function removeHeaderRow(button) {
  button.closest('.header-row').remove();
  validateForm();
}

// Function to add a new header row
function addHeaderRow() {
  const container = document.getElementById('headersContainer');
  const headerRow = document.createElement('div');
  headerRow.className = 'header-row';
  headerRow.innerHTML = `
    <div>
      <label class="input-label">Header Name</label>
      <input type="text" placeholder="Header name" class="header-name">
    </div>
    <div>
      <label class="input-label">Operation</label>
      <select class="header-operation">
        <option value="set">Set</option>
        <option value="remove">Remove</option>
        <option value="append">Append</option>
      </select>
    </div>
    <div>
      <label class="input-label">Value</label>
      <input type="text" placeholder="Header value" class="header-value">
    </div>
    <button class="remove-btn remove-header-row" style="margin-top: 21px;">X</button>
  `;
  container.insertBefore(headerRow, container.querySelector('.add-header-btn'));
  
  // Add validation listeners to new inputs
  headerRow.querySelectorAll('input, select').forEach(input => {
    input.addEventListener('input', validateForm);
  });
  
  validateForm();
}

// Function to save a new rule
function saveRule() {
  if (!validateForm()) {
    return;
  }

  const urlPattern = document.getElementById('urlPattern').value;
  const rule = {
    urlPattern,
    modifyStatus: false,
    modifyHeaders: false,
    modifyBody: false
  };

  // Get status modification
  if (document.getElementById('modifyStatus').checked) {
    const statusCode = document.getElementById('statusCode').value;
    const statusText = document.getElementById('statusText').value;
    rule.modifyStatus = true;
    rule.status = {
      code: parseInt(statusCode),
      text: statusText
    };
  }

  // Get header modifications
  if (document.getElementById('modifyHeaders').checked) {
    const headers = [];
    const headerRows = document.querySelectorAll('.header-row');
    
    headerRows.forEach(row => {
      const name = row.querySelector('.header-name').value;
      const operation = row.querySelector('.header-operation').value;
      const value = row.querySelector('.header-value').value;
      
      if (name) {
        headers.push({
          name,
          operation,
          value
        });
      }
    });

    if (headers.length > 0) {
      rule.modifyHeaders = true;
      rule.headers = headers;
    }
  }

  // Get body modifications
  if (document.getElementById('modifyBody').checked) {
    const jsonBody = document.getElementById('jsonBody').value;
    if (jsonBody.trim()) {
      rule.modifyBody = true;
      rule.body = jsonBody;
    }
  }

  chrome.runtime.sendMessage({
    type: 'ADD_RULE',
    rule
  }, response => {
    if (response.success) {
      loadRules();
      // Clear form
      document.getElementById('urlPattern').value = '';
      document.getElementById('modifyStatus').checked = false;
      document.getElementById('statusSection').style.display = 'none';
      document.getElementById('statusCode').value = '';
      document.getElementById('statusText').value = '';
      document.getElementById('modifyHeaders').checked = false;
      document.getElementById('headersContainer').style.display = 'none';
      document.getElementById('modifyBody').checked = false;
      document.getElementById('bodyContainer').style.display = 'none';
      document.getElementById('jsonBody').value = '';
      
      // Clear header rows
      const container = document.getElementById('headersContainer');
      while (container.children.length > 2) {
        container.removeChild(container.firstElementChild);
      }
      const firstRow = container.querySelector('.header-row');
      if (firstRow) {
        firstRow.querySelector('.header-name').value = '';
        firstRow.querySelector('.header-operation').value = 'set';
        firstRow.querySelector('.header-value').value = '';
      }

      validateForm();
    }
  });
}

// Function to load existing rules
function loadRules() {
  chrome.runtime.sendMessage({ type: 'GET_RULES' }, response => {
    updateRuleList(response.rules);
  });
}

// Function to remove a rule
function removeRule(index) {
  chrome.runtime.sendMessage({
    type: 'REMOVE_RULE',
    index
  }, response => {
    if (response.success) {
      loadRules();
    }
  });
}

// Function to create a rule item element
function createRuleElement(rule, index) {
  const ruleElement = document.createElement('div');
  ruleElement.className = 'rule-item';
  
  let ruleContent = `<strong>URL Pattern:</strong> ${rule.urlPattern}<br>`;
  
  if (rule.modifyStatus) {
    ruleContent += `<strong>Status:</strong> ${rule.status.code} ${rule.status.text}<br>`;
  }
  
  if (rule.modifyHeaders) {
    ruleContent += `<strong>Headers:</strong><br>`;
    ruleContent += rule.headers.map(h => `${h.name} - ${h.operation}: ${h.value}`).join('<br>');
    ruleContent += '<br>';
  }
  
  if (rule.modifyBody) {
    ruleContent += `<strong>Body Modification:</strong><br>`;
    ruleContent += `<code>${rule.body.substring(0, 100)}${rule.body.length > 100 ? '...' : ''}</code><br>`;
  }
  
  ruleContent += `<button class="remove-btn" data-rule-index="${index}">Remove Rule</button>`;
  
  ruleElement.innerHTML = ruleContent;
  return ruleElement;
}

// Function to update the rule list
function updateRuleList(rules) {
  const ruleList = document.getElementById('ruleList');
  // Clear existing rules except the heading
  while (ruleList.children.length > 1) {
    ruleList.removeChild(ruleList.lastChild);
  }

  rules.forEach((rule, index) => {
    const ruleElement = createRuleElement(rule, index);
    ruleList.appendChild(ruleElement);
  });
}

// Initialize form validation and event listeners
document.addEventListener('DOMContentLoaded', function() {
  // Initialize form validation
  validateForm();

  // Load rules
  loadRules();

  // Add event listeners for form inputs
  document.getElementById('urlPattern').addEventListener('input', validateForm);
  
  document.getElementById('modifyStatus').addEventListener('change', function() {
    document.getElementById('statusSection').style.display = this.checked ? 'flex' : 'none';
    validateForm();
  });
  
  document.getElementById('statusCode').addEventListener('input', validateForm);
  document.getElementById('statusText').addEventListener('input', validateForm);
  
  document.getElementById('modifyHeaders').addEventListener('change', function() {
    document.getElementById('headersContainer').style.display = this.checked ? 'block' : 'none';
    validateForm();
  });
  
  document.getElementById('modifyBody').addEventListener('change', function() {
    document.getElementById('bodyContainer').style.display = this.checked ? 'block' : 'none';
    validateForm();
  });
  
  document.getElementById('jsonBody').addEventListener('input', validateForm);
  
  // Add event listener for the Add Header button
  document.getElementById('addHeaderBtn').addEventListener('click', addHeaderRow);
  
  // Add event listener for the Save button
  document.getElementById('saveButton').addEventListener('click', saveRule);
  
  // Add event delegation for header row removal
  document.getElementById('headersContainer').addEventListener('click', function(event) {
    if (event.target.classList.contains('remove-header-row')) {
      removeHeaderRow(event.target);
    }
  });
  
  // Add event delegation for rule removal
  document.getElementById('ruleList').addEventListener('click', function(event) {
    if (event.target.classList.contains('remove-btn')) {
      const index = parseInt(event.target.dataset.ruleIndex, 10);
      if (!isNaN(index)) {
        removeRule(index);
      }
    }
  });
}); 