// Flag to track if extension context is valid
let isExtensionContextValid = true;

// Store for rules and active rules
let rules = [];
let activeRequests = new Map();

// Function to check for status modification headers
function checkForStatusModification(headers, requestId) {
  // Check if we have an active rule for this request
  const rule = activeRequests.get(requestId);
  console.log('[Response Editor] Checking status modification for request:', requestId, rule);
  
  if (rule && rule.modifyStatus) {
    console.log('[Response Editor] Applying status modification:', rule.status);
    return rule.status;
  }

  return null;
}

// Inject the page script to intercept XHR and fetch
function injectPageScript() {
  console.log('[Response Editor] Injecting page script');
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('pageScript.js');
  (document.head || document.documentElement).appendChild(script);
  script.onload = () => {
    console.log('[Response Editor] Page script loaded');
    script.remove();
  };
}

// Handle extension context invalidation
chrome.runtime.onMessageExternal?.addListener(() => {
  console.log('[Response Editor] Extension context invalidated');
  isExtensionContextValid = false;
});

// Listen for rule updates from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RULES_UPDATED') {
    console.log('[Response Editor] Rules updated:', message.rules);
    rules = message.rules;
  }
});

// Attempt to inject the page script
try {
  injectPageScript();
} catch (error) {
  console.error('[Response Editor] Failed to inject page script:', error);
}

// Listen for messages from the page script
window.addEventListener('message', async function(event) {
  // Only accept messages from our window
  if (event.source !== window) return;
  if (!event.data.type || !event.data.type.startsWith('RESPONSE_EDITOR_')) return;

  console.log('[Response Editor] Received message:', event.data);

  switch (event.data.type) {
    case 'RESPONSE_EDITOR_CHECK_URL': {
      const { url, requestId } = event.data;
      // Forward to background script
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'CHECK_URL',
          url: url
        });
        console.log('[Response Editor] Background response:', response);
        
        // Store the rule if one was found
        if (response.rule) {
          activeRequests.set(requestId, response.rule);
        }
        
        // Forward rule back to page script
        window.postMessage({
          type: 'RESPONSE_EDITOR_RULE_FOUND',
          rule: response.rule,
          requestId: requestId
        }, '*');
      } catch (error) {
        console.error('[Response Editor] Error checking URL:', error);
      }
      break;
    }
    case 'RESPONSE_EDITOR_CHECK_STATUS': {
      const { headers, requestId } = event.data;
      const statusMod = checkForStatusModification(headers, requestId);
      window.postMessage({
        type: 'RESPONSE_EDITOR_STATUS_CHECKED',
        statusMod,
        requestId: requestId
      }, '*');
      
      // Clean up after status check
      if (activeRequests.has(requestId)) {
        activeRequests.delete(requestId);
      }
      break;
    }
  }
}); 