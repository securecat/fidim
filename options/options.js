const STORAGE_KEY_FONT = 'fidim_font';
const STORAGE_KEY_EXCLUDED = 'fidim_excluded_hosts';
const STORAGE_KEY_REPLACE_MODE = 'fidim_replace_mode';
const STORAGE_KEY_BUILTIN_GROUPS = 'fidim_builtin_groups';
const STORAGE_KEY_CUSTOM_FONTS = 'fidim_custom_fonts';
const DEFAULT_FONT = 'sans-serif';
const DEFAULT_BUILTIN_GROUPS = {
  'system-ui': true,
  'yu-gothic': true,
  'ms-pgothic': true,
  'meiryo': true,
  'yu-mincho': false,
};
const BUILTIN_GROUP_IDS = ['system-ui', 'yu-gothic', 'ms-pgothic', 'meiryo', 'yu-mincho'];

// --- 置換対象フォント ---

const selectiveOptions = document.getElementById('selective-options');
let currentMode = 'selective';

chrome.storage.sync.get(
  { [STORAGE_KEY_REPLACE_MODE]: 'selective', [STORAGE_KEY_BUILTIN_GROUPS]: DEFAULT_BUILTIN_GROUPS },
  (result) => {
    const mode = result[STORAGE_KEY_REPLACE_MODE];
    document.querySelector(`input[name="replace-mode"][value="${mode}"]`).checked = true;
    updateSelectiveState(mode);

    const groups = { ...DEFAULT_BUILTIN_GROUPS, ...result[STORAGE_KEY_BUILTIN_GROUPS] };
    for (const id of BUILTIN_GROUP_IDS) {
      const el = document.getElementById(`group-${id}`);
      if (el) el.checked = groups[id];
    }
  }
);

document.querySelectorAll('input[name="replace-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const mode = document.querySelector('input[name="replace-mode"]:checked').value;
    chrome.storage.sync.set({ [STORAGE_KEY_REPLACE_MODE]: mode });
    updateSelectiveState(mode);
  });
});

BUILTIN_GROUP_IDS.forEach(id => {
  const el = document.getElementById(`group-${id}`);
  el.addEventListener('change', () => {
    chrome.storage.sync.get({ [STORAGE_KEY_BUILTIN_GROUPS]: DEFAULT_BUILTIN_GROUPS }, (result) => {
      const groups = { ...DEFAULT_BUILTIN_GROUPS, ...result[STORAGE_KEY_BUILTIN_GROUPS], [id]: el.checked };
      chrome.storage.sync.set({ [STORAGE_KEY_BUILTIN_GROUPS]: groups });
    });
  });
});

function updateSelectiveState(mode) {
  currentMode = mode;
  const isSelective = mode === 'selective';
  selectiveOptions.querySelectorAll('input, button').forEach(el => {
    el.disabled = !isSelective;
  });
}

// カスタムフォント

const customFontInput = document.getElementById('custom-font-input');
const customFontAddBtn = document.getElementById('custom-font-add-btn');
const customFontList = document.getElementById('custom-font-list');

chrome.storage.sync.get({ [STORAGE_KEY_CUSTOM_FONTS]: [] }, (result) => {
  renderCustomFontList(result[STORAGE_KEY_CUSTOM_FONTS]);
});

customFontAddBtn.addEventListener('click', addCustomFont);
customFontInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addCustomFont();
});

function parseFontNames(raw) {
  return raw
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);
}

function addCustomFont() {
  const names = parseFontNames(customFontInput.value);
  if (names.length === 0) return;
  chrome.storage.sync.get({ [STORAGE_KEY_CUSTOM_FONTS]: [] }, (result) => {
    const fonts = result[STORAGE_KEY_CUSTOM_FONTS];
    const existingNames = new Set(fonts.map(f => f.name));
    const newEntries = [];
    for (const name of names) {
      if (existingNames.has(name)) continue;
      existingNames.add(name);
      newEntries.push(name);
    }
    if (newEntries.length === 0) {
      customFontInput.value = '';
      return;
    }
    const newFonts = [...fonts, ...newEntries.map(name => ({ name, enabled: true }))];
    chrome.storage.sync.set({ [STORAGE_KEY_CUSTOM_FONTS]: newFonts }, () => {
      customFontInput.value = '';
      renderCustomFontList(newFonts);
    });
  });
}

function removeCustomFont(name) {
  chrome.storage.sync.get({ [STORAGE_KEY_CUSTOM_FONTS]: [] }, (result) => {
    const newFonts = result[STORAGE_KEY_CUSTOM_FONTS].filter(f => f.name !== name);
    chrome.storage.sync.set({ [STORAGE_KEY_CUSTOM_FONTS]: newFonts }, () => {
      renderCustomFontList(newFonts);
    });
  });
}

function toggleCustomFont(name, enabled) {
  chrome.storage.sync.get({ [STORAGE_KEY_CUSTOM_FONTS]: [] }, (result) => {
    const newFonts = result[STORAGE_KEY_CUSTOM_FONTS].map(f =>
      f.name === name ? { ...f, enabled } : f
    );
    chrome.storage.sync.set({ [STORAGE_KEY_CUSTOM_FONTS]: newFonts });
  });
}

function renderCustomFontList(fonts) {
  customFontList.innerHTML = '';
  if (fonts.length === 0) {
    customFontList.hidden = true;
    return;
  }
  fonts.forEach(({ name, enabled }) => {
    const li = document.createElement('li');
    li.className = 'custom-font-item';

    const label = document.createElement('label');
    label.className = 'custom-font-item-label';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = enabled;
    checkbox.disabled = currentMode !== 'selective';
    checkbox.addEventListener('change', () => toggleCustomFont(name, checkbox.checked));

    const span = document.createElement('span');
    span.textContent = name;

    label.append(checkbox, span);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-reset';
    removeBtn.textContent = '削除';
    removeBtn.disabled = currentMode !== 'selective';
    removeBtn.setAttribute('aria-label', `${name} を置換対象から削除`);
    removeBtn.addEventListener('click', () => removeCustomFont(name));

    li.append(label, removeBtn);
    customFontList.appendChild(li);
  });

  customFontList.hidden = false;
  customFontList.ariaBusy = 'false';
}

// --- 置き換えフォント ---

const fontInput = document.getElementById('font-input');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const status = document.getElementById('status');

chrome.storage.sync.get({ [STORAGE_KEY_FONT]: DEFAULT_FONT }, (result) => {
  fontInput.value = result[STORAGE_KEY_FONT];
});

saveBtn.addEventListener('click', () => {
  const value = fontInput.value.trim() || DEFAULT_FONT;
  fontInput.value = value;
  chrome.storage.sync.set({ [STORAGE_KEY_FONT]: value }, () => {
    showStatus('保存しました', 'saved');
  });
});

resetBtn.addEventListener('click', () => {
  fontInput.value = DEFAULT_FONT;
  chrome.storage.sync.set({ [STORAGE_KEY_FONT]: DEFAULT_FONT }, () => {
    showStatus('デフォルトに戻しました', 'saved');
  });
});

fontInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') saveBtn.click();
});

function showStatus(message, type) {
  status.textContent = message;
  status.className = `status ${type}`;
  setTimeout(() => {
    status.textContent = '';
    status.className = 'status';
  }, 2000);
}

// --- 除外リスト ---

const excludeInput = document.getElementById('exclude-input');
const excludeAddBtn = document.getElementById('exclude-add-btn');
const excludeList = document.getElementById('exclude-list');
const excludeEmpty = document.getElementById('exclude-empty');
const excludeStatus = document.getElementById('exclude-status');

chrome.storage.sync.get({ [STORAGE_KEY_EXCLUDED]: [] }, (result) => {
  renderExcludeList(result[STORAGE_KEY_EXCLUDED]);
});

excludeAddBtn.addEventListener('click', () => {
  addExcludeHost();
});

excludeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addExcludeHost();
});

excludeInput.addEventListener('input', () => {
  showExcludeStatus('', '');
});

function isValidHostname(hostname) {
  if (!hostname || hostname.length > 253) return false;
  if (hostname.includes('..')) return false;
  if (!hostname.includes('.')) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9.\-]*[a-zA-Z0-9]$/.test(hostname);
}

function showExcludeStatus(message, type) {
  if (!message) {
    excludeStatus.hidden = true;
    excludeStatus.textContent = '';
    excludeStatus.className = 'exclude-status';
    return;
  }
  excludeStatus.hidden = false;
  excludeStatus.textContent = message;
  excludeStatus.className = type ? `exclude-status ${type}` : 'exclude-status';
}

function addExcludeHost() {
  const raw = excludeInput.value.trim();
  if (!raw) return;

  let host;
  try {
    host = raw.includes('://') ? new URL(raw).hostname : new URL(`https://${raw}`).hostname;
  } catch {
    host = raw;
  }

  if (!isValidHostname(host)) {
    showExcludeStatus('有効なドメイン名を入力してください（例：example.com）', 'error');
    return;
  }

  chrome.storage.sync.get({ [STORAGE_KEY_EXCLUDED]: [] }, (result) => {
    const excluded = result[STORAGE_KEY_EXCLUDED];
    if (excluded.includes(host)) {
      excludeInput.value = '';
      return;
    }
    const newExcluded = [...excluded, host];
    chrome.storage.sync.set({ [STORAGE_KEY_EXCLUDED]: newExcluded }, () => {
      excludeInput.value = '';
      showExcludeStatus('', '');
      renderExcludeList(newExcluded);
    });
  });
}

function removeExcludeHost(host) {
  chrome.storage.sync.get({ [STORAGE_KEY_EXCLUDED]: [] }, (result) => {
    const newExcluded = result[STORAGE_KEY_EXCLUDED].filter(h => h !== host);
    chrome.storage.sync.set({ [STORAGE_KEY_EXCLUDED]: newExcluded }, () => {
      renderExcludeList(newExcluded);
    });
  });
}

function renderExcludeList(hosts) {
  excludeList.innerHTML = '';

  if (hosts.length === 0) {
    excludeList.hidden = true;
    excludeEmpty.hidden = false;
  } else {
    hosts.forEach(host => {
      const li = document.createElement('li');
      li.className = 'exclude-item';

      const span = document.createElement('span');
      span.textContent = host;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-reset';
      removeBtn.textContent = '削除';
      removeBtn.setAttribute('aria-label', `${host} を除外リストから削除`);
      removeBtn.addEventListener('click', () => removeExcludeHost(host));

      li.append(span, removeBtn);
      excludeList.appendChild(li);
    });

    excludeList.hidden = false;
    excludeList.ariaBusy = 'false';
    excludeEmpty.hidden = true;
  }
}
