// Mock XMLHttpRequest
class MockXHR {
  constructor() {
    this.headers = new Map();
    this.responseHeaders = new Map();
    this.onload = null;
    this.onerror = null;
    this.status = 200;
    this.statusText = 'OK';
    this.response = '{"test": "data"}';
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  send(data) {
    this.data = data;
    // Simulate async response
    setTimeout(() => {
      if (this.onload) this.onload();
    }, 0);
  }

  setRequestHeader(name, value) {
    this.headers.set(name, value);
  }

  getResponseHeader(name) {
    return this.responseHeaders.get(name);
  }
}

// Test cases
async function runTests() {
  console.log('[Response Editor Tests] Starting tests...');

  // Test 1: Basic XHR interception
  console.log('\nTest 1: Basic XHR interception');
  const xhr = new MockXHR();
  const originalXHR = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype = xhr;

  try {
    // Simulate a request
    xhr.open('GET', 'https://photography-zeta-gilt.vercel.app/api/challenges/1');
    xhr.send();

    // Verify request ID was assigned
    console.assert(xhr._responseEditorData?.requestId > 0, 'Request ID should be assigned');
    console.assert(xhr._responseEditorData?.url === 'https://photography-zeta-gilt.vercel.app/api/challenges/1', 'URL should be stored');
  } catch (error) {
    console.error('Test 1 failed:', error);
  }

  // Test 2: Status modification
  console.log('\nTest 2: Status modification');
  try {
    // Simulate status modification headers
    xhr.responseHeaders.set('x-response-editor-status', '400');
    xhr.responseHeaders.set('x-response-editor-status-text', 'Bad Request');

    // Trigger load event
    await new Promise(resolve => {
      xhr.onload = () => {
        console.assert(xhr.status === 400, 'Status should be modified to 400');
        console.assert(xhr.statusText === 'Bad Request', 'Status text should be modified');
        resolve();
      };
      xhr.send();
    });
  } catch (error) {
    console.error('Test 2 failed:', error);
  }

  // Test 3: URL pattern matching
  console.log('\nTest 3: URL pattern matching');
  try {
    const testPatterns = [
      {
        pattern: '*://photography-zeta-gilt.vercel.app/api/challenges/*',
        testUrl: 'https://photography-zeta-gilt.vercel.app/api/challenges/1',
        shouldMatch: true
      },
      {
        pattern: 'https://*.example.com/*',
        testUrl: 'https://api.example.com/test',
        shouldMatch: true
      },
      {
        pattern: 'http://test.com/api/*',
        testUrl: 'http://test.com/other',
        shouldMatch: false
      }
    ];

    for (const test of testPatterns) {
      const urlCondition = convertUrlPatternToFilter(test.pattern);
      const regex = new RegExp(urlCondition.regexFilter);
      const matches = regex.test(test.testUrl);
      console.assert(matches === test.shouldMatch, 
        `Pattern ${test.pattern} should ${test.shouldMatch ? 'match' : 'not match'} ${test.testUrl}`);
    }
  } catch (error) {
    console.error('Test 3 failed:', error);
  }

  // Test 4: Response modification
  console.log('\nTest 4: Response modification');
  try {
    const originalResponse = '{"data": "test"}';
    xhr.response = originalResponse;

    // Test status-only modification
    xhr._responseEditorStatusModified = true;
    xhr._responseEditorModified = false;

    const response = xhr.response;
    console.assert(response === originalResponse, 'Original response should be preserved for status-only modifications');

    // Test body modification
    xhr._responseEditorModified = { data: 'modified' };
    const modifiedResponse = xhr.response;
    console.assert(modifiedResponse === '{"data":"modified"}', 'Response should be modified when body is changed');
  } catch (error) {
    console.error('Test 4 failed:', error);
  }

  // Cleanup
  XMLHttpRequest.prototype = originalXHR;
  console.log('\n[Response Editor Tests] Tests completed');
}

// Run tests
runTests(); 