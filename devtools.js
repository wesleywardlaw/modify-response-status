// Create a panel in Chrome DevTools
chrome.devtools.panels.create(
  "Response Editor",
  null,
  "panel.html",
  function(panel) {
    console.log("DevTools panel created");
  }
);

// Listen to network requests
chrome.devtools.network.onRequestFinished.addListener(async (request) => {
  const tabId = chrome.devtools.inspectedWindow.tabId;
  
  // Get the response body
  request.getContent((content, encoding) => {
    // Send the request details to background script
    chrome.runtime.sendMessage({
      type: 'DEVTOOLS_REQUEST',
      tabId: tabId,
      requestId: request.requestId,
      url: request.request.url,
      content: content,
      encoding: encoding,
      responseHeaders: request.response.headers,
      status: request.response.status,
      statusText: request.response.statusText
    });
  });
});

// Listen for modifications from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'RESPONSE_MODIFIED') {
    const { requestId, status, statusText, content } = message;
    
    // Update the network panel entry
    chrome.devtools.network.getHAR((har) => {
      const entry = har.entries.find(e => e.request.id === requestId);
      if (entry) {
        entry.response.status = status;
        entry.response.statusText = statusText;
        entry.response.content.text = content;
        
        // Force refresh the network panel
        chrome.devtools.network.onRequestFinished.fire(entry);
      }
    });
  }
}); 