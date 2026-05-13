// popup.js

let currentSettings = {};
let saveTimer = null;

function updateXPathWarning() {
  const mode = document.getElementById("mode").value;
  const shadowDOM = document.getElementById("shadowDOMCheckbox").checked;
  const warningDiv = document.getElementById("xpathWarning");
  if (mode === "xpath" && shadowDOM) {
    warningDiv.style.display = "block";
  } else {
    warningDiv.style.display = "none";
  }
}

// Save current UI values to background storage (debounced)
async function saveCurrentUI() {
  const selector = document.getElementById("selector").value.trim();
  const mode = document.getElementById("mode").value;
  const includeShadowDOM = document.getElementById("shadowDOMCheckbox").checked;
  let intervalMs = parseInt(document.getElementById("interval").value, 10);
  if (isNaN(intervalMs)) intervalMs = 0;
  if (intervalMs < 0) intervalMs = 0;

  // Do not save if auto-refresh is active (inputs would be disabled, but just in case)
  if (currentSettings.autoRefreshEnabled) return;

  const newSettings = {
    selector: selector,
    mode: mode,
    includeShadowDOM: includeShadowDOM,
    intervalMs: intervalMs,
    autoRefreshEnabled: false   // never start auto-refresh just by saving
  };
  await browser.runtime.sendMessage({ action: "updateSettings", settings: newSettings });
  // Update local copy without triggering UI refresh loop
  currentSettings = { ...currentSettings, ...newSettings };
}

// Debounced save (avoids excessive storage writes while typing)
function debouncedSaveUI() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCurrentUI();
  }, 500);
}

function setInputsEnabled(enabled) {
  const inputs = [
    document.getElementById("selector"),
    document.getElementById("mode"),
    document.getElementById("shadowDOMCheckbox"),
    document.getElementById("interval")
  ];
  inputs.forEach(input => {
    if (input) input.disabled = !enabled;
  });
}

async function refreshUI() {
  const response = await browser.runtime.sendMessage({ action: "getSettings" });
  if (response && response.settings) {
    currentSettings = response.settings;
    // Only update UI if the field isn't currently focused (to avoid interrupting typing)
    const selectorField = document.getElementById("selector");
    if (document.activeElement !== selectorField) {
      selectorField.value = currentSettings.selector || "";
    }
    document.getElementById("mode").value = currentSettings.mode || "css";
    document.getElementById("shadowDOMCheckbox").checked = currentSettings.includeShadowDOM || false;
    document.getElementById("interval").value = currentSettings.intervalMs || 2000;

    if (currentSettings.lastCount !== null && currentSettings.lastCount !== undefined) {
      document.getElementById("result").innerText = `Count: ${currentSettings.lastCount}`;
    } else if (currentSettings.lastError) {
      document.getElementById("result").innerText = `Count: error (${currentSettings.lastError})`;
    } else {
      document.getElementById("result").innerText = "Count: —";
    }

    const autoStatusSpan = document.getElementById("autoStatus");
    const isAuto = currentSettings.autoRefreshEnabled && currentSettings.intervalMs > 0 && currentSettings.selector;
    if (isAuto) {
      autoStatusSpan.textContent = "(auto updating)";
      autoStatusSpan.style.color = "#2c7da0";
    } else {
      autoStatusSpan.textContent = "";
    }
    document.getElementById("statusMsg").innerText = currentSettings.autoRefreshEnabled ? "Auto-refresh active" : "Auto-refresh off";

    setInputsEnabled(!currentSettings.autoRefreshEnabled);
    updateXPathWarning();
  }
}

async function countNow() {
  const selector = document.getElementById("selector").value.trim();
  const mode = document.getElementById("mode").value;
  const includeShadowDOM = document.getElementById("shadowDOMCheckbox").checked;

  if (!selector) {
    document.getElementById("result").innerText = "Enter a selector/XPath";
    return;
  }

  // Also save current UI settings (so they persist for next popup open)
  await saveCurrentUI();

  const response = await browser.runtime.sendMessage({
    action: "forceCountWithParams",
    selector: selector,
    mode: mode,
    shadowDOM: includeShadowDOM
  });

  if (response && response.count !== undefined) {
    document.getElementById("result").innerText = `Count: ${response.count}`;
  } else if (response && response.error) {
    document.getElementById("result").innerText = `Count: error (${response.error})`;
  }
}

async function applySettings() {
  const selector = document.getElementById("selector").value.trim();
  const mode = document.getElementById("mode").value;
  const includeShadowDOM = document.getElementById("shadowDOMCheckbox").checked;
  let intervalMs = parseInt(document.getElementById("interval").value, 10);
  if (isNaN(intervalMs)) intervalMs = 0;
  if (intervalMs < 0) intervalMs = 0;

  const newSettings = {
    selector: selector,
    mode: mode,
    includeShadowDOM: includeShadowDOM,
    intervalMs: intervalMs,
    autoRefreshEnabled: (selector !== "" && intervalMs > 0)
  };

  await browser.runtime.sendMessage({ action: "updateSettings", settings: newSettings });
  await refreshUI();
}

async function stopAutoRefresh() {
  await browser.runtime.sendMessage({ action: "updateSettings", settings: { autoRefreshEnabled: false } });
  await refreshUI();
}

// Presets (unchanged)
async function savePreset(name, selector, mode) {
  if (!name.trim()) return alert("Enter a preset name");
  const result = await browser.storage.local.get("presets");
  let presets = result.presets || [];
  presets = presets.filter(p => p.name !== name);
  presets.push({ name: name.trim(), selector, mode });
  if (presets.length > 5) presets.shift();
  await browser.storage.local.set({ presets });
  loadPresetsDropdown();
}

async function loadPresetsDropdown() {
  const result = await browser.storage.local.get("presets");
  const presets = result.presets || [];
  const presetSelect = document.getElementById("presetList");
  presetSelect.innerHTML = '<option value="">-- Load preset --</option>';
  presets.forEach((preset, idx) => {
    const opt = document.createElement("option");
    opt.value = idx;
    opt.textContent = `${preset.name} (${preset.mode})`;
    presetSelect.appendChild(opt);
  });
}

async function loadPreset(idx) {
  const result = await browser.storage.local.get("presets");
  const presets = result.presets || [];
  if (presets[idx]) {
    document.getElementById("selector").value = presets[idx].selector;
    document.getElementById("mode").value = presets[idx].mode;
    await applySettings();
  }
}

async function deletePreset(idx) {
  const result = await browser.storage.local.get("presets");
  let presets = result.presets || [];
  if (presets[idx]) {
    presets.splice(idx, 1);
    await browser.storage.local.set({ presets });
    loadPresetsDropdown();
  }
}

// Listen for background count updates
browser.runtime.onMessage.addListener((message) => {
  if (message.action === "countUpdate") {
    if (message.count !== null && message.count !== undefined) {
      document.getElementById("result").innerText = `Count: ${message.count}`;
    } else if (message.error) {
      document.getElementById("result").innerText = `Count: error (${message.error})`;
    } else {
      document.getElementById("result").innerText = "Count: —";
    }
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  await refreshUI();
  await loadPresetsDropdown();

  // Attach event listeners to save UI changes automatically (debounced)
  const selectorInput = document.getElementById("selector");
  const modeSelect = document.getElementById("mode");
  const shadowCheckbox = document.getElementById("shadowDOMCheckbox");
  const intervalInput = document.getElementById("interval");

  selectorInput.addEventListener("input", debouncedSaveUI);
  modeSelect.addEventListener("change", () => {
    saveCurrentUI();
    updateXPathWarning();
  });
  shadowCheckbox.addEventListener("change", () => {
    saveCurrentUI();
    updateXPathWarning();
  });
  intervalInput.addEventListener("change", () => saveCurrentUI());

  document.getElementById("applyBtn").addEventListener("click", applySettings);
  document.getElementById("stopBtn").addEventListener("click", stopAutoRefresh);
  document.getElementById("countNowBtn").addEventListener("click", countNow);
  document.getElementById("savePresetBtn").addEventListener("click", async () => {
    const name = document.getElementById("presetName").value;
    const sel = document.getElementById("selector").value.trim();
    const mode = document.getElementById("mode").value;
    if (!sel) return alert("Selector is empty");
    await savePreset(name, sel, mode);
    document.getElementById("presetName").value = "";
  });
  document.getElementById("loadPresetBtn").addEventListener("click", async () => {
    const idx = document.getElementById("presetList").value;
    if (idx === "") return;
    await loadPreset(parseInt(idx));
  });
  document.getElementById("deletePresetBtn").addEventListener("click", async () => {
    const idx = document.getElementById("presetList").value;
    if (idx === "") return;
    if (confirm("Delete this preset?")) {
      await deletePreset(parseInt(idx));
    }
  });
});