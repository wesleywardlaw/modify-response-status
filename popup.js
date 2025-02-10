// Function to validate the form and enable/disable save button
function validateForm() {
  const urlPattern = document.getElementById('urlPattern').value;
  const modifyStatus = document.getElementById('modifyStatus').checked;
  const saveButton = document.getElementById('saveButton');
  const urlPatternValidation = document.getElementById('urlPatternValidation');
  
  let isValid = true;

  // Validate URL pattern
  if (!urlPattern.trim()) {
    urlPatternValidation.style.display = 'block';
    isValid = false;
  } else {
    urlPatternValidation.style.display = 'none';
  }

  // Validate that status modification is enabled
  if (!modifyStatus) {
    isValid = false;
  }

  // Validate status code if enabled
  if (modifyStatus) {
    const statusCode = document.getElementById('statusCode').value;
    if (!statusCode || statusCode < 100 || statusCode > 599) {
      isValid = false;
    }
  }

  saveButton.disabled = !isValid;
  return isValid;
}

// Function to save a new rule
function saveRule() {
  if (!validateForm()) {
    return;
  }

  const urlPattern = document.getElementById('urlPattern').value;
  const rule = {
    urlPattern,
    modifyStatus: false
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
  
  // Add event listener for the Save button
  document.getElementById('saveButton').addEventListener('click', saveRule);
  
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