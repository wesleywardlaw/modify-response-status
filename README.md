# Response Editor Chrome Extension

A Chrome extension that allows you to modify API response headers and content using Manifest V3.

## Features

- Modify response headers for specific URL patterns
- Support for multiple header operations (set, remove, append)
- Persistent rules storage
- User-friendly interface

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

## Usage

1. Click the extension icon in your Chrome toolbar
2. Enter a URL pattern (e.g., `*://*.example.com/*`)
3. Add header modifications:
   - Header Name: The name of the header to modify
   - Operation: Choose between Set, Remove, or Append
   - Header Value: The value to set or append (not needed for Remove)
4. Click "Save Rule" to apply the modifications
5. You can add multiple rules and remove them as needed

## URL Pattern Examples

- Match all URLs: `*://*/*`
- Match specific domain: `*://*.example.com/*`
- Match specific path: `*://*.example.com/api/*`
- Match specific protocol: `https://*.example.com/*`

## Notes

- The extension uses the `declarativeNetRequest` API from Manifest V3
- Rules are persisted across browser sessions
- You can modify multiple headers for the same URL pattern 