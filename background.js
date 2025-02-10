// Store custom rules
let customRules = [];

// Store debugger targets
const debuggerTargets = new Map();

// Load rules when extension starts
chrome.runtime.onStartup.addListener(() => {
  loadRulesFromStorage();
});

// Initialize rules when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  loadRulesFromStorage();
});

// Function to load rules from storage
function loadRulesFromStorage() {
  chrome.storage.local.get(['rules'], (result) => {
    if (result.rules) {
      customRules = result.rules;
      console.log('[Response Editor] Loaded rules from storage:', customRules);
      // Broadcast rules to all tabs
      broadcastRulesToTabs();
      // Attach debugger to all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => attachDebugger(tab.id));
      });
    }
  });
}

// Function to broadcast rules to all tabs
function broadcastRulesToTabs() {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        type: 'RULES_UPDATED',
        rules: customRules
      }).catch(() => {
        // Ignore errors for inactive tabs
      });
    });
  });
}

// Function to check if a URL matches a pattern
function urlMatchesPattern(url, pattern) {
  try {
    const regex = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\\\.\*/g, '.*');
    return new RegExp(regex).test(url);
  } catch (error) {
    console.error('[Response Editor] Error matching URL pattern:', error);
    return false;
  }
}

// Function to find matching rule for a URL
function findMatchingRule(url) {
  const rule = customRules.find(rule => urlMatchesPattern(url, rule.urlPattern));
  console.log('[Response Editor] Rule found for URL:', url, rule);
  return rule;
}

// Function to attach debugger
async function attachDebugger(tabId) {
  if (!debuggerTargets.has(tabId)) {
    try {
      console.log('[Response Editor] Attaching debugger to tab:', tabId);
      await chrome.debugger.attach({ tabId }, "1.2");
      await chrome.debugger.sendCommand({ tabId }, "Network.enable", {
        maxPostDataSize: 65536
      });
      await chrome.debugger.sendCommand({ tabId }, "Network.setRequestInterception", {
        patterns: [{ urlPattern: "*" }]
      });
      debuggerTargets.set(tabId, true);
      console.log('[Response Editor] Debugger attached to tab:', tabId);
    } catch (error) {
      console.error('[Response Editor] Failed to attach debugger:', error);
    }
  }
}

// Function to detach debugger
async function detachDebugger(tabId) {
  if (debuggerTargets.has(tabId)) {
    try {
      await chrome.debugger.sendCommand({ tabId }, "Network.setRequestInterception", {
        patterns: []
      });
      await chrome.debugger.detach({ tabId });
      debuggerTargets.delete(tabId);
      console.log('[Response Editor] Debugger detached from tab:', tabId);
    } catch (error) {
      console.error('[Response Editor] Failed to detach debugger:', error);
    }
  }
}

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    attachDebugger(tabId);
  }
});

// Listen for tab removal
chrome.tabs.onRemoved.addListener((tabId) => {
  detachDebugger(tabId);
});

// Store intercepted requests
const interceptedRequests = new Map();

// Listen for debugger events
chrome.debugger.onEvent.addListener(async (source, method, params) => {
  console.log('[Response Editor] Debugger event:', method, params);
  
  if (method === "Network.requestIntercepted") {
    const { interceptionId, request, responseHeaders, responseStatusCode } = params;
    const rule = findMatchingRule(request.url);
    
    if (rule && rule.modifyStatus) {
      console.log('[Response Editor] Modifying response for:', request.url);
      
      // Store the original response
      interceptedRequests.set(interceptionId, {
        url: request.url,
        originalStatus: responseStatusCode,
        modifiedStatus: rule.status.code,
        modifiedStatusText: rule.status.text
      });
      
      // Continue with modified response
      await chrome.debugger.sendCommand(source, "Network.continueInterceptedRequest", {
        interceptionId,
        rawResponse: btoa(unescape(encodeURIComponent(
          `HTTP/1.1 ${rule.status.code} ${rule.status.text}\r\n` +
          Object.entries(responseHeaders || {})
            .map(([k, v]) => `${k}: ${v}`)
            .join('\r\n') +
          '\r\n\r\n'
        )))
      });
      
      // Notify DevTools
      chrome.runtime.sendMessage({
        type: 'RESPONSE_MODIFIED',
        requestId: params.requestId,
        url: request.url,
        status: rule.status.code,
        statusText: rule.status.text
      });
    } else {
      // Continue without modification
      await chrome.debugger.sendCommand(source, "Network.continueInterceptedRequest", {
        interceptionId
      });
    }
  }
});

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[Response Editor] Received message:', request);
  
  if (request.type === 'CHECK_URL') {
    const rule = findMatchingRule(request.url);
    console.log('[Response Editor] Sending rule for URL:', request.url, rule);
    sendResponse({ rule });
  } else if (request.type === 'ADD_RULE') {
    console.log('[Response Editor] Adding new rule:', request.rule);
    customRules.push(request.rule);
    chrome.storage.local.set({ rules: customRules }, () => {
      console.log('[Response Editor] Rules saved to storage:', customRules);
      broadcastRulesToTabs();
      sendResponse({ success: true });
    });
  } else if (request.type === 'GET_RULES') {
    console.log('[Response Editor] Getting rules:', customRules);
    sendResponse({ rules: customRules });
  } else if (request.type === 'REMOVE_RULE') {
    console.log('[Response Editor] Removing rule at index:', request.index);
    customRules = customRules.filter((_, index) => index !== request.index);
    chrome.storage.local.set({ rules: customRules }, () => {
      console.log('[Response Editor] Rules saved after removal:', customRules);
      broadcastRulesToTabs();
      sendResponse({ success: true });
    });
  } else if (request.type === 'DEVTOOLS_REQUEST') {
    // Handle request from DevTools
    const rule = findMatchingRule(request.url);
    if (rule && rule.modifyStatus) {
      // Send modified response back to DevTools
      chrome.runtime.sendMessage({
        type: 'RESPONSE_MODIFIED',
        requestId: request.requestId,
        url: request.url,
        status: rule.status.code,
        statusText: rule.status.text,
        content: request.content
      });
    }
  }
  return true;
});

// Load rules when extension starts
loadRulesFromStorage(); 