// Create a unique ID for each request
let requestCounter = 0;
const pendingRequests = new Map();
const pendingRules = new Map();

// Store modified status values
const modifiedStatus = new WeakMap();
const modifiedStatusText = new WeakMap();

// Track if the extension context is valid
let isExtensionContextValid = true;

// Function to convert relative URL to absolute URL
function getAbsoluteUrl(url) {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const base = window.location.origin;
  return url.startsWith('/') ? `${base}${url}` : `${base}/${url}`;
}

console.log('[Response Editor] Page script initialized');

// Function to clean up when extension is reloaded
function cleanup() {
  console.log('[Response Editor] Cleaning up page script');
  // Resolve any pending requests
  pendingRequests.forEach((request) => {
    request.resolve(undefined);
  });
  pendingRequests.clear();
  pendingRules.clear();
  isExtensionContextValid = false;
}

// Function to handle extension context invalidation
function handleContextInvalidation() {
  console.log('[Response Editor] Extension context invalidated, cleaning up');
  cleanup();
  // Notify content script
  window.postMessage({
    type: 'RESPONSE_EDITOR_CONTEXT_INVALIDATED'
  }, '*');
}

// Listen for extension context invalidation
window.addEventListener('RESPONSE_EDITOR_CONTEXT_INVALIDATED', handleContextInvalidation);

// Function to check extension context
async function checkExtensionContext() {
  if (!isExtensionContextValid) {
    console.log('[Response Editor] Extension context is invalid, resolving without modifications');
    return false;
  }
  return true;
}

// Function to safely send messages
async function sendMessageSafely(message) {
  if (!await checkExtensionContext()) {
    return { error: 'Extension context invalid' };
  }
  
  try {
    window.postMessage(message, '*');
    return { success: true };
  } catch (error) {
    console.error('[Response Editor] Error sending message:', error);
    handleContextInvalidation();
    return { error: error.message };
  }
}

// Intercept XMLHttpRequest
const XHR = XMLHttpRequest.prototype;
const originalOpen = XHR.open;
const originalSend = XHR.send;

// Store original response getters
const originalResponseGetter = Object.getOwnPropertyDescriptor(XHR, 'response');
const originalResponseTextGetter = Object.getOwnPropertyDescriptor(XHR, 'responseText');

// Intercept XHR open
XHR.open = function(...args) {
  const requestId = ++requestCounter;
  const absoluteUrl = getAbsoluteUrl(args[1]);
  console.log(`[Response Editor] XHR Open - RequestID: ${requestId}, URL: ${absoluteUrl}`);
  this._responseEditorData = {
    requestId,
    method: args[0],
    url: absoluteUrl
  };
  return originalOpen.apply(this, args);
};

// Create a promise for each request
function createRequestPromise(requestId) {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  pendingRequests.set(requestId, { promise, resolve, reject });
  console.log(`[Response Editor] Created promise for request ${requestId}`);
  return promise;
}

// Parse response based on content type
function parseResponse(response, contentType) {
  if (!response) return null;
  
  console.log('[Response Editor] Parsing response with content-type:', contentType);
  try {
    if (contentType && contentType.includes('application/json')) {
      // Remove any security prefixes like )]} or )]}'
      const cleanJson = response.replace(/^\)]}'\s*/, '');
      const parsed = JSON.parse(cleanJson);
      console.log('[Response Editor] Parsed JSON response:', parsed);
      return parsed;
    }
  } catch (e) {
    console.error('[Response Editor] Error parsing JSON response:', e);
  }
  
  console.log('[Response Editor] Returning raw response');
  return response;
}

// Intercept XHR send
XHR.send = function(...args) {
  const xhr = this;
  const { requestId, url } = xhr._responseEditorData;
  console.log(`[Response Editor] XHR Send - RequestID: ${requestId}`);

  // Create a promise for this request
  const requestPromise = createRequestPromise(requestId);

  // Check if we have any rules for this URL
  console.log('[Response Editor] Checking for rules:', url);
  sendMessageSafely({
    type: 'RESPONSE_EDITOR_CHECK_URL',
    url,
    requestId
  }).catch(() => {
    // If message fails, resolve without modifications
    const pendingRequest = pendingRequests.get(requestId);
    if (pendingRequest) {
      pendingRequest.resolve(undefined);
      pendingRequests.delete(requestId);
    }
  });

  // Store original response handlers
  const originalOnLoad = xhr.onload;
  const originalOnError = xhr.onerror;

  // Override response getters
  Object.defineProperty(xhr, 'response', {
    get: function() {
      // Check flags before getting original response
      const hasStatusMod = !!this._responseEditorStatusModified;
      const hasBodyMod = !!this._responseEditorModified;
      const hasModified = hasStatusMod || hasBodyMod;

      // Get original response
      const originalResponse = originalResponseGetter.get.call(this);

      console.log(`[Response Editor] Response getter debug for ${requestId}:`, {
        hasModified,
        hasStatusMod,
        hasBodyMod,
        status: this.status,
        statusText: this.statusText,
        _responseEditorStatusModified: this._responseEditorStatusModified,
        originalResponse
      });

      if (!hasModified) {
        return originalResponse;
      }

      // If we have a body modification, use that
      if (hasBodyMod) {
        return typeof this._responseEditorModified === 'string' 
          ? this._responseEditorModified 
          : JSON.stringify(this._responseEditorModified);
      }

      // If we only have status modification, return original response as is
      return originalResponse;
    },
    configurable: true,
    enumerable: true
  });

  Object.defineProperty(xhr, 'responseText', {
    get: function() {
      console.log(`[Response Editor] Getting responseText for ${requestId}`);
      const hasStatusMod = !!this._responseEditorStatusModified;
      const hasBodyMod = !!this._responseEditorModified;
      const hasModified = hasStatusMod || hasBodyMod;

      if (hasModified && hasBodyMod) {
        return typeof this._responseEditorModified === 'string'
          ? this._responseEditorModified
          : JSON.stringify(this._responseEditorModified);
      }
      return originalResponseTextGetter.get.call(this);
    },
    configurable: true,
    enumerable: true
  });

  // Override status and statusText early
  const originalStatus = Object.getOwnPropertyDescriptor(xhr, 'status') || {
    get: function() { return 0; },
    configurable: true,
    enumerable: true
  };
  const originalStatusText = Object.getOwnPropertyDescriptor(xhr, 'statusText') || {
    get: function() { return ''; },
    configurable: true,
    enumerable: true
  };

  // Store original values
  let currentStatus = 0;
  let currentStatusText = '';

  // Create getters that maintain internal state
  Object.defineProperties(xhr, {
    'status': {
      get: function() {
        if (this._responseEditorStatusModified && modifiedStatus.has(this)) {
          const status = modifiedStatus.get(this);
          console.log(`[Response Editor] Getting modified status: ${status}`);
          return status;
        }
        try {
          currentStatus = originalStatus.get ? originalStatus.get.call(this) : 0;
          return currentStatus;
        } catch (e) {
          console.warn('[Response Editor] Error getting original status:', e);
          return currentStatus;
        }
      },
      set: function(value) {
        if (this._responseEditorStatusModified) {
          modifiedStatus.set(this, value);
        } else if (originalStatus.set) {
          originalStatus.set.call(this, value);
        }
      },
      configurable: true,
      enumerable: true
    },
    'statusText': {
      get: function() {
        if (this._responseEditorStatusModified && modifiedStatusText.has(this)) {
          const text = modifiedStatusText.get(this);
          console.log(`[Response Editor] Getting modified statusText: ${text}`);
          return text;
        }
        try {
          currentStatusText = originalStatusText.get ? originalStatusText.get.call(this) : '';
          return currentStatusText;
        } catch (e) {
          console.warn('[Response Editor] Error getting original statusText:', e);
          return currentStatusText;
        }
      },
      set: function(value) {
        if (this._responseEditorStatusModified) {
          modifiedStatusText.set(this, value);
        } else if (originalStatusText.set) {
          originalStatusText.set.call(this, value);
        }
      },
      configurable: true,
      enumerable: true
    }
  });

  // Override onload
  xhr.onload = async function(...loadArgs) {
    console.log(`[Response Editor] XHR Load - RequestID: ${requestId}`);
    try {
      // Check for status modifications first
      const result = await sendMessageSafely({
        type: 'RESPONSE_EDITOR_CHECK_STATUS',
        headers: {},  // We don't need headers anymore since we store the rule
        requestId
      });

      if (result.error) {
        console.log(`[Response Editor] Skipping modifications due to error:`, result.error);
        // Call original handler without modifications
        if (originalOnLoad) {
          originalOnLoad.apply(this, loadArgs);
        }
        return;
      }

      // Wait for status check
      const statusResponse = await requestPromise;
      console.log(`[Response Editor] Status check response for ${requestId}:`, statusResponse);

      if (statusResponse?.statusMod) {
        // Track modifications BEFORE calling original handler
        this._responseEditorStatusModified = true;
        modifiedStatus.set(this, statusResponse.statusMod.code);
        modifiedStatusText.set(this, statusResponse.statusMod.text);

        // Verify the properties were set
        console.log(`[Response Editor] Status modification check for ${requestId}:`, {
          statusModified: this._responseEditorStatusModified,
          currentStatus: this.status,
          currentStatusText: this.statusText
        });

        // Clean up after status modification
        pendingRequests.delete(requestId);
        pendingRules.delete(requestId);
      } else {
        // No status modification needed, clean up
        pendingRequests.delete(requestId);
        pendingRules.delete(requestId);
      }

      // Call original handler after modifications
      if (originalOnLoad) {
        originalOnLoad.apply(this, loadArgs);
      }
    } catch (error) {
      console.error('[Response Editor] Error in XHR response handling:', error);
      // Clean up on error
      pendingRequests.delete(requestId);
      pendingRules.delete(requestId);
      // Call original handler even if modification fails
      if (originalOnLoad) {
        originalOnLoad.apply(this, loadArgs);
      }
    }
  };

  xhr.onerror = function(...errorArgs) {
    console.error(`[Response Editor] XHR Error - RequestID: ${requestId}`);
    pendingRequests.delete(requestId);
    pendingRules.delete(requestId);
    if (originalOnError) {
      originalOnError.apply(xhr, errorArgs);
    }
  };

  return originalSend.apply(xhr, args);
};

// Intercept Fetch
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const requestId = ++requestCounter;
  const url = (typeof args[0] === 'string') ? args[0] : args[0].url;
  const absoluteUrl = getAbsoluteUrl(url);
  console.log(`[Response Editor] Fetch - RequestID: ${requestId}, URL: ${absoluteUrl}`);

  // Create a promise for this request
  const requestPromise = createRequestPromise(requestId);

  // Check if we have any rules for this URL
  const result = await sendMessageSafely({
    type: 'RESPONSE_EDITOR_CHECK_URL',
    url: absoluteUrl,
    requestId
  });

  if (result.error) {
    console.log(`[Response Editor] Skipping modifications due to error:`, result.error);
    return originalFetch.apply(this, args);
  }

  // Wait for the original response
  const response = await originalFetch.apply(this, args);
  console.log(`[Response Editor] Fetch response received - RequestID: ${requestId}`);
  
  // Clone the response so we can read it multiple times
  const clonedResponse = response.clone();
  
  try {
    const contentType = clonedResponse.headers.get('content-type');
    console.log(`[Response Editor] Fetch content-type: ${contentType}`);
    let originalBody;
    
    if (contentType && contentType.includes('application/json')) {
      const text = await clonedResponse.text();
      // Remove any security prefixes like )]} or )]}'
      const cleanJson = text.replace(/^\)]}'\s*/, '');
      originalBody = JSON.parse(cleanJson);
    } else {
      originalBody = await clonedResponse.text();
    }
    console.log(`[Response Editor] Fetch original body:`, originalBody);

    // Get the rule for this request
    const rule = pendingRules.get(requestId);

    // Only send for modification if we have a rule
    if (rule) {
      // Send original response for modification
      const modifyResult = await sendMessageSafely({
        type: 'RESPONSE_EDITOR_MODIFY_RESPONSE',
        originalResponse: originalBody,
        rule,
        requestId
      });

      if (modifyResult.error) {
        console.log(`[Response Editor] Skipping response modification due to error:`, modifyResult.error);
        return response;
      }
      
      // Wait for potential modifications
      const modifiedResponse = await requestPromise;
      console.log(`[Response Editor] Fetch modified response:`, modifiedResponse);
      
      if (modifiedResponse !== undefined) {
        // Create a new response with modified data
        const body = modifiedResponse.body !== undefined
          ? (typeof modifiedResponse.body === 'string' 
              ? modifiedResponse.body 
              : JSON.stringify(modifiedResponse.body))
          : (typeof originalBody === 'string'
              ? originalBody
              : JSON.stringify(originalBody));
          
        return new Response(body, {
          status: modifiedResponse.status.code,
          statusText: modifiedResponse.status.text,
          headers: response.headers
        });
      }
    } else {
      // No rule found, resolve with original response
      const pendingRequest = pendingRequests.get(requestId);
      if (pendingRequest) {
        pendingRequest.resolve(undefined);
        pendingRequests.delete(requestId);
      }
    }
  } catch (error) {
    console.error('[Response Editor] Error in fetch modification:', error);
    // Clean up on error
    const pendingRequest = pendingRequests.get(requestId);
    if (pendingRequest) {
      pendingRequest.resolve(undefined);
      pendingRequests.delete(requestId);
    }
  }
  
  return response;
};

// Listen for messages from content script
window.addEventListener('message', function(event) {
  // Only accept messages from our window
  if (event.source !== window) return;
  if (!event.data.type || !event.data.type.startsWith('RESPONSE_EDITOR_')) return;

  console.log('[Response Editor] Received message:', event.data);

  switch (event.data.type) {
    case 'RESPONSE_EDITOR_RULE_FOUND':
      const { rule, requestId } = event.data;
      console.log(`[Response Editor] Rule found for ${requestId}:`, rule);
      const request = pendingRequests.get(requestId);
      
      if (request) {
        if (rule) {
          // Store the rule for this request
          pendingRules.set(requestId, rule);
          // Don't send another message - let the XHR/fetch handlers do that
          // when they have the actual response
        } else {
          // No rule found, resolve with original response
          console.log(`[Response Editor] No rule found for ${requestId}`);
          request.resolve(undefined);
          pendingRequests.delete(requestId);
        }
      }
      break;

    case 'RESPONSE_EDITOR_STATUS_CHECKED':
      const { statusMod, requestId: statusRequestId } = event.data;
      console.log(`[Response Editor] Status check result for ${statusRequestId}:`, statusMod);
      const statusRequest = pendingRequests.get(statusRequestId);
      
      if (statusRequest) {
        statusRequest.resolve({ statusMod });
        // Don't delete the request yet as we might need it for body modifications
      }
      break;

    case 'RESPONSE_EDITOR_RESPONSE_MODIFIED':
      const { response, requestId: modifiedRequestId } = event.data;
      console.log(`[Response Editor] Response modified for ${modifiedRequestId}:`, response);
      const pendingRequest = pendingRequests.get(modifiedRequestId);
      
      if (pendingRequest) {
        // Make sure we always include status in the response if it's being modified
        if (response && response.status) {
          pendingRequest.resolve(response);
        } else {
          // No modifications needed
          pendingRequest.resolve(undefined);
        }
        pendingRequests.delete(modifiedRequestId);
        pendingRules.delete(modifiedRequestId);
      }
      break;
  }
}); 