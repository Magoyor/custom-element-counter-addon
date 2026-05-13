// content.js

// Recursively collect elements from shadow DOMs
function collectAllElements(root, selector, mode, results = []) {
  let elements;
  if (mode === "css") {
    elements = root.querySelectorAll(selector);
  } else {
    const xpathResult = document.evaluate(
      selector,
      root,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    elements = [];
    for (let i = 0; i < xpathResult.snapshotLength; i++) {
      elements.push(xpathResult.snapshotItem(i));
    }
  }
  results.push(...elements);

  // Check for shadow roots
  const allNodes = root.querySelectorAll("*");
  for (let node of allNodes) {
    if (node.shadowRoot) {
      collectAllElements(node.shadowRoot, selector, mode, results);
    }
  }
  return results;
}

// Count elements based on mode and selector, with optional shadow DOM
function countElements(selector, mode, includeShadowDOM) {
  if (!selector || selector.trim() === "") return 0;
  try {
    if (includeShadowDOM) {
      const all = collectAllElements(document, selector, mode, []);
      return all.length;
    } else {
      if (mode === "css") {
        return document.querySelectorAll(selector).length;
      } else {
        const result = document.evaluate(
          selector,
          document,
          null,
          XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
          null
        );
        return result.snapshotLength;
      }
    }
  } catch (e) {
    console.error("Custom Element Counter error:", e);
    return -1;
  }
}

// Listen for messages from background script
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getCount") {
    const count = countElements(message.selector, message.mode, message.shadowDOM || false);
    sendResponse({ count: count === -1 ? "error" : count });
    return true;
  }
});