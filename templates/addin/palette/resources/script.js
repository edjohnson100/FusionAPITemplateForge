// ==========================================================================
// Palette front-end. Python-owned state only -- no localStorage anywhere in
// this file. All durable state (form values, active config, theme choice,
// imported themes) is pushed from Python via 'set_state'/'theme_imported'
// messages and round-tripped back to Python on every user edit. See
// CLAUDE.md for the full bridge contract.
// ==========================================================================

const state = {
  forms: {},          // tab -> form dict
  configs: {},         // tab -> {configs: [names], activeConfig: name|null}
  importedThemes: {},  // themeId -> varsDict
};

const MM_FIELDS = {}; // TODO: list fields per tab that need unit conversion for display, if any.

const validateDebounceTimers = {};

// --------------------------------------------------------------------------
// Bridge: HTML -> Python. window.adsk is not guaranteed to exist the instant
// this script runs (the Fusion webview bridge attaches asynchronously) -- a
// single unconditional send can silently no-op forever if fired too early.
// This exact bug has shipped in this fleet before; always retry.
// --------------------------------------------------------------------------
function sendToFusion(action, data) {
  const payload = JSON.stringify(Object.assign({ action: action }, data || {}));
  if (window.adsk && window.adsk.fusionSendData) {
    window.adsk.fusionSendData('message', payload);
  } else {
    setTimeout(() => sendToFusion(action, data), 100);
  }
}

function requestInitData(attempt = 0) {
  if (window.adsk && window.adsk.fusionSendData) {
    sendToFusion('get_defaults', {});
  } else if (attempt < 100) {
    setTimeout(() => requestInitData(attempt + 1), 100);
  }
}

// --------------------------------------------------------------------------
// Bridge: Python -> HTML
// --------------------------------------------------------------------------
window.fusionJavaScriptHandler = {
  handle: function (action, dataStr) {
    try {
      const data = typeof dataStr === 'string' ? JSON.parse(dataStr) : dataStr;
      switch (action) {
        case 'set_state': onSetState(data); break;
        case 'config_list': onConfigList(data); break;
        case 'validation_result': onValidationResult(data); break;
        case 'preview_status': onPreviewStatus(data); break;
        case 'notification': showNotification(data); break;
        case 'theme_imported': onThemeImported(data); break;
        case 'init_data': onInitData(data); break;
      }
    } catch (e) {
      console.error(e);
    }
    return 'OK';
  },
};

function onInitData(data) {
  const versionTag = document.getElementById('versionTag');
  const footerVersion = document.getElementById('footerVersion');
  const version = data.version ? `v${data.version}` : '';
  if (versionTag) versionTag.textContent = version;
  if (footerVersion) footerVersion.textContent = version;
}

function onSetState(data) {
  const tab = data.tab;
  if (tab === 'theme') {
    if (data.importedThemes) mergeImportedThemes(data.importedThemes);
    state.forms.theme = data.form;
    writeFormToDom('theme', data.form);
    applyTheme(data.form.name);
    applyFontOverrides(data.form.fontFamily, data.form.fontSize);
    return;
  }
  state.forms[tab] = data.form;
  writeFormToDom(tab, data.form);
  renderConfigStatus(tab);
}

function onConfigList(data) {
  state.configs[data.tab] = { configs: data.configs, activeConfig: data.activeConfig };
  renderConfigStatus(data.tab);
}

function onValidationResult(data) {
  document.querySelectorAll(`#tab-${data.tab} .field-error`).forEach(el => (el.textContent = ''));
  Object.entries(data.fieldErrors || {}).forEach(([field, message]) => {
    const el = document.querySelector(`#tab-${data.tab} [data-error-for="${field}"]`);
    if (el) el.textContent = message;
  });
}

function onPreviewStatus(data) {
  const btn = document.querySelector(`.clear-preview-button[data-tab="${data.tab}"]`);
  if (btn) btn.disabled = !data.active;
}

// --------------------------------------------------------------------------
// Generic form <-> DOM helpers. Every field uses id="{tab}.{fieldName}".
// --------------------------------------------------------------------------
function writeFormToDom(tab, form) {
  Object.entries(form || {}).forEach(([field, value]) => {
    const el = document.getElementById(`${tab}.${field}`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value;
    else el.value = value;
  });
}

function readFormFromDom(tab) {
  const form = {};
  document.querySelectorAll(`[id^="${tab}."]`).forEach(el => {
    const field = el.id.slice(tab.length + 1);
    if (el.type === 'checkbox') form[field] = el.checked;
    else if (el.type === 'number') form[field] = el.value === '' ? null : parseFloat(el.value);
    else form[field] = el.value;
  });
  return form;
}

function requestValidation(tab) {
  clearTimeout(validateDebounceTimers[tab]);
  validateDebounceTimers[tab] = setTimeout(() => {
    sendToFusion('validate', { tab: tab, form: readFormFromDom(tab) });
  }, 200);
}

// --------------------------------------------------------------------------
// Tabs
// --------------------------------------------------------------------------
function switchTab(tabId) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
  document.getElementById(`tab-${tabId}`).classList.add('active');
  document.querySelector(`.tab-button[data-tab="${tabId}"]`).classList.add('active');
}

// --------------------------------------------------------------------------
// Notifications (top bar + a per-tab bar if present)
// --------------------------------------------------------------------------
function showNotification(data) {
  const targets = [document.getElementById('notification')];
  const active = document.querySelector('.tab-panel.active');
  if (active) {
    const local = document.getElementById(`${active.id.replace('tab-', '')}-notification`);
    if (local) targets.push(local);
  }
  targets.forEach(el => {
    if (!el) return;
    el.textContent = data.message;
    el.className = `notification ${data.type || 'info'}`;
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.add('hidden'), 4000);
  });
}

// --------------------------------------------------------------------------
// Config manager (Load/Delete/Save As/Update Current/Factory Reset)
// --------------------------------------------------------------------------
function renderConfigStatus(tab) {
  const el = document.getElementById(`${tab}-config-active`);
  const updateBtn = document.getElementById(`${tab}-config-update`);
  const info = state.configs[tab];
  const active = info ? info.activeConfig : null;
  if (el) el.innerHTML = `Active config: <strong>${active || '(none, using defaults)'}</strong>`;
  if (updateBtn) updateBtn.disabled = !active;
}

async function handleConfigAction(action, tab) {
  const info = state.configs[tab] || { configs: [] };
  if (action === 'save_as') {
    const name = await showPromptModal('Save As', 'Config name', '');
    if (name) sendToFusion('save_config_as', { tab: tab, form: readFormFromDom(tab), name: name });
  } else if (action === 'update_current') {
    sendToFusion('update_current_config', { tab: tab, form: readFormFromDom(tab) });
  } else if (action === 'load') {
    const name = await showPickerModal('Load Config', info.configs);
    if (name) sendToFusion('load_config', { tab: tab, name: name });
  } else if (action === 'delete') {
    const name = await showPickerModal('Delete Config', info.configs);
    if (name) {
      const ok = await showConfirmModal('Delete Config', `Permanently delete "${name}"?`);
      if (ok) sendToFusion('delete_config', { tab: tab, name: name });
    }
  }
}

// --------------------------------------------------------------------------
// Preview / Generate / Clear Preview / Factory Reset button dispatch
// --------------------------------------------------------------------------
document.addEventListener('click', (e) => {
  const configBtn = e.target.closest('button[data-config-action]');
  if (configBtn) {
    handleConfigAction(configBtn.dataset.configAction, configBtn.dataset.tab);
    return;
  }

  const actionBtn = e.target.closest('button[data-action]');
  if (!actionBtn) return;
  const action = actionBtn.dataset.action;
  const tab = actionBtn.dataset.tab;

  if (action === 'factory_reset') {
    showConfirmModal('Factory Reset', 'Reset this tab back to its built-in defaults?').then(ok => {
      if (ok) sendToFusion('factory_reset', { tab: tab });
    });
    return;
  }

  if (action === 'update_preview' || action === 'generate' || action === 'clear_preview') {
    sendToFusion(action, { tab: tab, form: readFormFromDom(tab) });
  }
});

document.addEventListener('input', (e) => {
  const tab = e.target.id.includes('.') ? e.target.id.split('.')[0] : null;
  if (tab && tab !== 'theme' && DEFAULTS_TABS.has(tab)) requestValidation(tab);
});

const DEFAULTS_TABS = new Set(['main']);

// ==========================================================================
// Theme system
// ==========================================================================
const THEME_VAR_NAMES = [
  '--bg-body', '--text-main', '--text-sub', '--border-color',
  '--row-bg', '--row-border', '--row-hover',
  '--input-bg', '--input-border', '--input-text', '--input-placeholder', '--toggle-bg',
  '--header-hover', '--tab-bg', '--tab-active-bg', '--tab-text', '--tab-active-text',
  '--btn-primary', '--btn-primary-hover', '--btn-success', '--btn-success-hover',
  '--btn-secondary', '--btn-secondary-hover', '--btn-secondary-text',
  '--status-success-bg', '--status-success-text',
  '--status-error-bg', '--status-error-text',
  '--status-info-bg', '--status-info-text',
];
const BUILT_IN_THEMES = new Set(['System', 'Light', 'Dark', 'Midnight', 'Sandstone']);

function applyTheme(name) {
  const themeSelect = document.getElementById('theme.name');
  if (themeSelect && themeSelect.value !== name) themeSelect.value = name;

  if (name === 'System') {
    const dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.setAttribute('data-theme', 'Dark');
    else document.documentElement.removeAttribute('data-theme');
  } else if (name === 'Light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', name);
  }
  updateThemeRemoveButtonState();
}

function applyFontOverrides(fontFamily, fontSize) {
  let styleTag = document.getElementById('font-overrides');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'font-overrides';
    document.head.appendChild(styleTag);
  }
  const rules = [];
  if (fontFamily) rules.push(`--font-family: ${fontFamily};`);
  if (fontSize) rules.push(`--font-size-base: ${fontSize}px;`);
  styleTag.textContent = `:root { ${rules.join(' ')} }`;
}

function injectCustomTheme(themeId, vars) {
  let styleTag = document.getElementById('dynamic-theme-overrides');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'dynamic-theme-overrides';
    document.head.appendChild(styleTag);
  }
  let out = '';
  Object.entries(state.importedThemes).forEach(([id, themeVars]) => {
    out += `:root[data-theme="${id}"] {\n`;
    THEME_VAR_NAMES.forEach(v => {
      if (themeVars[v]) out += `  ${v}: ${themeVars[v]};\n`;
    });
    out += `}\n`;
  });
  styleTag.textContent = out;
}

function mergeImportedThemes(importedThemes) {
  state.importedThemes = importedThemes || {};
  updateThemeDropdown();
  injectCustomTheme();
  updateThemeRemoveButtonState();
}

function updateThemeDropdown() {
  const select = document.getElementById('theme.name');
  if (!select) return;
  const current = select.value;
  Array.from(select.options).forEach(o => {
    if (!BUILT_IN_THEMES.has(o.value)) select.removeChild(o);
  });
  Object.keys(state.importedThemes).forEach(id => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    select.appendChild(opt);
  });
  if ([...select.options].some(o => o.value === current)) select.value = current;
}

function updateThemeRemoveButtonState() {
  const btn = document.getElementById('theme-remove');
  if (!btn) return;
  const select = document.getElementById('theme.name');
  const id = select ? select.value : null;
  const removable = !!id && !BUILT_IN_THEMES.has(id) && id in state.importedThemes;
  btn.disabled = !removable;
}

function generateFullCSS() {
  let out = '';
  out += `:root {\n`;
  THEME_VAR_NAMES.forEach(v => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(v).trim();
    if (value) out += `  ${v}: ${value};\n`;
  });
  out += `}\n\n`;
  Object.entries(state.importedThemes).forEach(([id, vars]) => {
    out += `[data-theme="${id}"] {\n`;
    THEME_VAR_NAMES.forEach(v => {
      if (vars[v]) out += `  ${v}: ${vars[v]};\n`;
    });
    out += `}\n\n`;
  });
  return out;
}

function parseStyleCSS(cssText) {
  const themeRegex = /(?:(:root)|\[data-theme=["']?([^"'\]]+)["']?\])\s*\{([^}]+)\}/g;
  const parsedThemes = {};
  let match;
  while ((match = themeRegex.exec(cssText)) !== null) {
    const id = match[1] ? 'Light' : match[2];
    const content = match[3];
    const vars = {};
    const varRegex = /(--[\w-]+)\s*:\s*([^;]+?)(?=\s*;|\s*$)/g;
    let vMatch;
    while ((vMatch = varRegex.exec(content)) !== null) {
      vars[vMatch[1].trim()] = vMatch[2].trim();
    }
    parsedThemes[id] = vars;
  }
  return parsedThemes;
}

function onThemeImported(data) {
  if (data.file_type === 'css') {
    const parsed = parseStyleCSS(data.content);
    Object.entries(parsed).forEach(([id, vars]) => {
      if (id === 'Light') return; // :root itself, not an importable custom theme
      state.importedThemes[id] = vars;
      sendToFusion('save_imported_theme', { id: id, vars: vars });
    });
    updateThemeDropdown();
    injectCustomTheme();
    showNotification({ type: 'success', message: 'CSS theme(s) imported' });
  } else {
    try {
      const themeData = JSON.parse(data.content);
      if (themeData.vars && themeData.id) {
        state.importedThemes[themeData.id] = themeData.vars;
        sendToFusion('save_imported_theme', { id: themeData.id, vars: themeData.vars });
        updateThemeDropdown();
        injectCustomTheme();
        const select = document.getElementById('theme.name');
        if (select) select.value = themeData.id;
        applyTheme(themeData.id);
        if (themeData.fontFamily || themeData.fontSize) {
          const form = { name: themeData.id, fontFamily: themeData.fontFamily, fontSize: themeData.fontSize };
          writeFormToDom('theme', form);
          applyFontOverrides(form.fontFamily, form.fontSize);
          sendToFusion('update_theme', { form: form });
        }
        showNotification({ type: 'success', message: `Theme "${themeData.id}" imported` });
      }
    } catch (e) {
      showNotification({ type: 'error', message: 'Invalid theme.json file' });
    }
  }
}

document.getElementById('theme.name')?.addEventListener('change', (e) => {
  applyTheme(e.target.value);
  sendToFusion('update_theme', { form: Object.assign(readFormFromDom('theme'), { name: e.target.value }) });
});

document.getElementById('theme.fontFamily')?.addEventListener('change', () => {
  const form = readFormFromDom('theme');
  applyFontOverrides(form.fontFamily, form.fontSize);
  sendToFusion('update_theme', { form: form });
});
document.getElementById('theme.fontSize')?.addEventListener('change', () => {
  const form = readFormFromDom('theme');
  applyFontOverrides(form.fontFamily, form.fontSize);
  sendToFusion('update_theme', { form: form });
});

document.getElementById('theme-import-json')?.addEventListener('click', () => sendToFusion('import_theme', { file_type: 'json' }));
document.getElementById('theme-export-json')?.addEventListener('click', () => {
  const select = document.getElementById('theme.name');
  const id = select ? select.value : null;
  if (!id || BUILT_IN_THEMES.has(id)) {
    showNotification({ type: 'error', message: 'Select a custom (imported) theme to export as JSON' });
    return;
  }
  const form = readFormFromDom('theme');
  sendToFusion('export_theme', {
    file_type: 'json', id: id, vars: state.importedThemes[id],
    fontFamily: form.fontFamily, fontSize: form.fontSize, default_name: `${id}.theme.json`,
  });
});
document.getElementById('theme-import-css')?.addEventListener('click', () => sendToFusion('import_theme', { file_type: 'css' }));
document.getElementById('theme-export-css')?.addEventListener('click', () => {
  sendToFusion('export_theme', { file_type: 'css', content: generateFullCSS(), default_name: 'style.css' });
});
document.getElementById('theme-remove')?.addEventListener('click', async () => {
  const select = document.getElementById('theme.name');
  const id = select ? select.value : null;
  if (!id || BUILT_IN_THEMES.has(id) || !(id in state.importedThemes)) return;
  const ok = await showConfirmModal('Remove Theme', `Permanently remove the "${id}" theme? Re-import its .theme.json to bring it back.`);
  if (!ok) return;
  delete state.importedThemes[id];
  sendToFusion('remove_imported_theme', { id: id });
  updateThemeDropdown();
  injectCustomTheme();
  select.value = 'System';
  applyTheme('System');
  sendToFusion('update_theme', { form: Object.assign(readFormFromDom('theme'), { name: 'System' }) });
});
document.getElementById('theme-factory-reset')?.addEventListener('click', async () => {
  const ok = await showConfirmModal('Factory Reset Themes', 'Permanently delete all imported themes and font overrides?');
  if (!ok) return;
  state.importedThemes = {};
  sendToFusion('reset_imported_themes', {});
  updateThemeDropdown();
  injectCustomTheme();
  const styleTag = document.getElementById('font-overrides');
  if (styleTag) styleTag.remove();
  applyTheme('System');
  const select = document.getElementById('theme.name');
  if (select) select.value = 'System';
  sendToFusion('update_theme', { form: Object.assign({}, DEFAULT_THEME_FORM) });
});

const DEFAULT_THEME_FORM = {
  name: 'System',
  fontFamily: '-apple-system, "Segoe UI", Helvetica, Arial, sans-serif',
  fontSize: 12,
};

// ==========================================================================
// Modal (Promise-based confirm/prompt/picker; no native confirm()/prompt())
// ==========================================================================
let _modalResolve = null;
let _modalTriggerEl = null;

function _openModal(title, bodyHtml, { showCancel = true, focusSelector = null } = {}) {
  if (_modalResolve) {
    console.error('_openModal called while a modal is already open');
    return Promise.resolve(null);
  }
  _modalTriggerEl = document.activeElement;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = bodyHtml;
  document.getElementById('modal-btn-cancel').classList.toggle('hidden', !showCancel);
  document.getElementById('modal-overlay').classList.remove('hidden');
  const modal = document.querySelector('.modal');
  modal.focus();
  const focusEl = focusSelector && document.querySelector(focusSelector);
  if (focusEl) focusEl.focus();
  return new Promise(resolve => { _modalResolve = resolve; });
}

function _closeModal(result) {
  document.getElementById('modal-overlay').classList.add('hidden');
  if (_modalResolve) {
    const resolve = _modalResolve;
    _modalResolve = null;
    resolve(result);
  }
  if (_modalTriggerEl) {
    _modalTriggerEl.focus();
    _modalTriggerEl = null;
  }
}

function showConfirmModal(title, message) {
  return _openModal(title, `<p>${message}</p>`);
}

function showPromptModal(title, label, defaultValue = '') {
  const html = `<label>${label}<input type="text" id="modal-input" value="${defaultValue}"></label>`;
  return _openModal(title, html, { focusSelector: '#modal-input' }).then(ok => {
    if (!ok) return null;
    const input = document.getElementById('modal-input');
    return input ? input.value : null;
  });
}

function showPickerModal(title, options) {
  if (!options || options.length === 0) {
    return _openModal(title, '<p>No saved configs yet.</p>', { showCancel: false }).then(() => null);
  }
  const opts = options.map(o => `<option value="${o}">${o}</option>`).join('');
  const html = `<label>Config<select id="modal-select">${opts}</select></label>`;
  return _openModal(title, html, { focusSelector: '#modal-select' }).then(ok => {
    if (!ok) return null;
    const select = document.getElementById('modal-select');
    return select ? select.value : null;
  });
}

document.getElementById('modal-btn-confirm')?.addEventListener('click', () => _closeModal(true));
document.getElementById('modal-btn-cancel')?.addEventListener('click', () => _closeModal(false));
document.getElementById('modal-overlay')?.addEventListener('click', (e) => {
  if (e.target.id === 'modal-overlay') _closeModal(false);
});
document.addEventListener('keydown', (e) => {
  if (!_modalResolve) return;
  if (e.key === 'Escape') { e.preventDefault(); _closeModal(false); }
  else if (e.key === 'Enter' && e.target.tagName !== 'SELECT') { e.preventDefault(); _closeModal(true); }
  else if (e.key === 'Tab') {
    const focusables = document.querySelectorAll('.modal button, .modal input, .modal select');
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});

// ==========================================================================
// Startup
// ==========================================================================
document.querySelectorAll('.tab-button').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

if (window.matchMedia) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const select = document.getElementById('theme.name');
    if (select && select.value === 'System') applyTheme('System');
  });
}

requestInitData();
