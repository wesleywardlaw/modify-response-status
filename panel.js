// Keep track of modified requests
const modifiedRequests = new Map();

// Listen for modifications from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RESPONSE_MODIFIED') {
    const { requestId, url, status, statusText } = message;
    
    // Store the modified request
    modifiedRequests.set(requestId, {
      url,
      status,
      statusText,
      timestamp: new Date().toLocaleTimeString()
    });
    
    // Update the UI
    updateRequestList();
  }
});

// Function to update the request list in the UI
function updateRequestList() {
  const requestList = document.getElementById('requestList');
  requestList.innerHTML = '';
  
  for (const [requestId, request] of modifiedRequests) {
    const item = document.createElement('div');
    item.className = 'request-item modified';
    item.innerHTML = `
      <div><strong>URL:</strong> ${request.url}</div>
      <div><strong>Status:</strong> ${request.status} ${request.statusText}</div>
      <div><strong>Time:</strong> ${request.timestamp}</div>
    `;
    requestList.appendChild(item);
  }
  
  if (modifiedRequests.size === 0) {
    requestList.innerHTML = '<div class="request-item">No modified requests yet</div>';
  }
}

// Initial UI update
updateRequestList(); 