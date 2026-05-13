// background.js
let countTimer = null;
let currentSettings = {
  selector: "",
  mode: "css",
  includeShadowDOM: false,
  intervalMs: 2000,
  autoRefreshEnabled: false,
  lastCount: null,
  lastError: null
};

async function sendCountToPopup() {
  try {
    await browser.runtime.sendMessage({
      action: "countUpdate",
      count: currentSettings.lastCount,
      error: currentSettings.lastError
    });
  } catch (err) { /* no popup */ }
}

async function updateBadge() {
  if (currentSettings.autoRefreshEnabled && currentSettings.lastCount !== null && currentSettings.lastCount !== undefined && currentSettings.lastCount !== "error") {
    let count = currentSettings.lastCount;
    let badgeText;
    if (count >= 100_000) badgeText = "∞";
    else if (count >= 10_000) badgeText = Math.floor(count / 1000) + "k";
    else if (count >= 1000) badgeText = Math.floor(count / 1000) + "k";
    else badgeText = count.toString();
    await browser.browserAction.setBadgeText({ text: badgeText });
    await browser.browserAction.setBadgeBackgroundColor({ color: "#2c7da0" });
    await browser.browserAction.setTitle({ title: `Count: ${count}` });
  } else if (currentSettings.autoRefreshEnabled && currentSettings.lastError) {
    await browser.browserAction.setBadgeText({ text: "?" });
    await browser.browserAction.setBadgeBackgroundColor({ color: "#a00" });
    await browser.browserAction.setTitle({ title: `Error: ${currentSettings.lastError}` });
  } else {
    await browser.browserAction.setBadgeText({ text: "" });
    await browser.browserAction.setTitle({ title: "Custom Element Counter" });
  }
}

async function loadSettings() {
  const result = await browser.storage.local.get(["settings"]);
  if (result.settings) currentSettings = { ...currentSettings, ...result.settings };
  if (currentSettings.autoRefreshEnabled && currentSettings.selector && currentSettings.intervalMs > 0) startAutoRefresh();
  else await updateBadge();
}

async function saveSettings() {
  await browser.storage.local.set({ settings: currentSettings });
  await updateBadge();
}

async function getActiveTabId() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ? tabs[0].id : null;
}

// New helper: perform a count with arbitrary parameters (for "Count Now")
async function performCountWithParams(selector, mode, shadowDOM) {
  if (!selector || selector.trim() === "") return "No selector";
  const tabId = await getActiveTabId();
  if (!tabId) return "No active tab";
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      action: "getCount",
      selector: selector,
      mode: mode,
      shadowDOM: shadowDOM
    });
    if (response && response.count !== undefined && response.count !== "error") {
      return response.count;
    } else {
      return "Invalid response";
    }
  } catch (err) {
    return err.message;
  }
}

async function performCount() {
  if (!currentSettings.selector || currentSettings.selector.trim() === "") {
    currentSettings.lastCount = null;
    currentSettings.lastError = "No selector";
    await saveSettings();
    await sendCountToPopup();
    return null;
  }
  const tabId = await getActiveTabId();
  if (!tabId) {
    currentSettings.lastCount = null;
    currentSettings.lastError = "No active tab";
    await saveSettings();
    await sendCountToPopup();
    return null;
  }
  try {
    const response = await browser.tabs.sendMessage(tabId, {
      action: "getCount",
      selector: currentSettings.selector,
      mode: currentSettings.mode,
      shadowDOM: currentSettings.includeShadowDOM
    });
    if (response && response.count !== undefined && response.count !== "error") {
      currentSettings.lastCount = response.count;
      currentSettings.lastError = null;
    } else {
      currentSettings.lastCount = null;
      currentSettings.lastError = "Invalid response";
    }
  } catch (err) {
    console.error("Count error:", err);
    currentSettings.lastCount = null;
    currentSettings.lastError = err.message;
  }
  await saveSettings();
  await sendCountToPopup();
  return currentSettings.lastCount;
}

function startAutoRefresh() {
  if (countTimer) clearInterval(countTimer);
  if (!currentSettings.autoRefreshEnabled) return;
  if (currentSettings.intervalMs <= 0) return;
  performCount();
  countTimer = setInterval(() => performCount(), currentSettings.intervalMs);
}

function stopAutoRefresh() {
  if (countTimer) { clearInterval(countTimer); countTimer = null; }
  updateBadge();
  sendCountToPopup();
}

async function updateSettings(newSettings) {
  let restart = false;
  const relevant = ["selector", "mode", "includeShadowDOM", "intervalMs", "autoRefreshEnabled"];
  for (let key of relevant) {
    if (newSettings.hasOwnProperty(key) && currentSettings[key] !== newSettings[key]) restart = true;
  }
  currentSettings = { ...currentSettings, ...newSettings };
  await saveSettings();
  if (restart) {
    if (currentSettings.autoRefreshEnabled && currentSettings.selector && currentSettings.intervalMs > 0) {
      stopAutoRefresh();
      startAutoRefresh();
    } else {
      stopAutoRefresh();
    }
  } else {
    if (newSettings.manualCount) await performCount();
  }
  await updateBadge();
  await sendCountToPopup();
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getSettings") {
    sendResponse({ settings: currentSettings });
    return true;
  }
  if (message.action === "updateSettings") {
    updateSettings(message.settings).then(() => sendResponse({ success: true })).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.action === "forceCount") {
    performCount().then(count => sendResponse({ count: count })).catch(err => sendResponse({ error: err.message }));
    return true;
  }
  // New: force count with custom parameters (from "Count Now")
  if (message.action === "forceCountWithParams") {
    performCountWithParams(message.selector, message.mode, message.shadowDOM).then(result => {
      sendResponse({ count: result });
    }).catch(err => sendResponse({ error: err.message }));
    return true;
  }
});

loadSettings().then(() => updateBadge());