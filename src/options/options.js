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
  'ms-ui-gothic': true,
  'yu-mincho': false,
};
const BUILTIN_GROUP_IDS = ['system-ui', 'yu-gothic', 'ms-pgothic', 'meiryo', 'ms-ui-gothic', 'yu-mincho'];

// --- 置換対象フォント ---

chrome.storage.sync.get(
  { [STORAGE_KEY_REPLACE_MODE]: 'selective', [STORAGE_KEY_BUILTIN_GROUPS]: DEFAULT_BUILTIN_GROUPS },
  (result) => {
    const mode = result[STORAGE_KEY_REPLACE_MODE];
    document.querySelector(`input[name="replace-mode"][value="${mode}"]`).checked = true;

    const groups = { ...DEFAULT_BUILTIN_GROUPS, ...result[STORAGE_KEY_BUILTIN_GROUPS] };
    for (const id of BUILTIN_GROUP_IDS) {
      const el = document.getElementById(`group-${id}`);
      if (el) el.checked = groups[id];
    }
  }
);

// 置換対象フォントの設定は操作した時点で保存されるため、保存したことを操作した項目のラジオボタンの横に表示する
const modeStatuses = {
  all: document.getElementById('mode-all-status'),
  selective: document.getElementById('mode-selective-status'),
};

function showModeSaved(mode) {
  for (const [key, el] of Object.entries(modeStatuses)) {
    el.textContent = key === mode ? '保存しました' : '';
  }
}

function clearModeStatus() {
  for (const el of Object.values(modeStatuses)) {
    el.textContent = '';
  }
}

document.querySelectorAll('input[name="replace-mode"]').forEach(radio => {
  radio.addEventListener('change', () => {
    const mode = document.querySelector('input[name="replace-mode"]:checked').value;
    chrome.storage.sync.set({ [STORAGE_KEY_REPLACE_MODE]: mode }, () => showModeSaved(mode));
  });
});

BUILTIN_GROUP_IDS.forEach(id => {
  const el = document.getElementById(`group-${id}`);
  el.addEventListener('change', () => {
    selectSelectiveMode();
    chrome.storage.sync.get({ [STORAGE_KEY_BUILTIN_GROUPS]: DEFAULT_BUILTIN_GROUPS }, (result) => {
      const groups = { ...DEFAULT_BUILTIN_GROUPS, ...result[STORAGE_KEY_BUILTIN_GROUPS], [id]: el.checked };
      chrome.storage.sync.set({ [STORAGE_KEY_BUILTIN_GROUPS]: groups }, () => showModeSaved('selective'));
    });
  });
});

// 「個別に選択」の中の選択肢を操作したら、親の「個別に選択」に切り替える
function selectSelectiveMode() {
  const selectiveRadio = document.getElementById('mode-selective');
  if (selectiveRadio.checked) return;
  selectiveRadio.checked = true;
  chrome.storage.sync.set({ [STORAGE_KEY_REPLACE_MODE]: 'selective' });
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
customFontInput.addEventListener('input', clearModeStatus);

function parseFontNames(raw) {
  return raw
    .split(',')
    .map(s => s.trim().replace(/^['"]|['"]$/g, '').trim())
    .filter(Boolean);
}

function addCustomFont() {
  const names = parseFontNames(customFontInput.value);
  if (names.length === 0) return;
  selectSelectiveMode();
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
      showModeSaved('selective');
    });
  });
}

function removeCustomFont(name) {
  selectSelectiveMode();
  chrome.storage.sync.get({ [STORAGE_KEY_CUSTOM_FONTS]: [] }, (result) => {
    const newFonts = result[STORAGE_KEY_CUSTOM_FONTS].filter(f => f.name !== name);
    chrome.storage.sync.set({ [STORAGE_KEY_CUSTOM_FONTS]: newFonts }, () => {
      renderCustomFontList(newFonts);
      showModeSaved('selective');
    });
  });
}

function toggleCustomFont(name, enabled) {
  chrome.storage.sync.get({ [STORAGE_KEY_CUSTOM_FONTS]: [] }, (result) => {
    const newFonts = result[STORAGE_KEY_CUSTOM_FONTS].map(f =>
      f.name === name ? { ...f, enabled } : f
    );
    chrome.storage.sync.set({ [STORAGE_KEY_CUSTOM_FONTS]: newFonts }, () => showModeSaved('selective'));
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
    checkbox.addEventListener('change', () => {
      selectSelectiveMode();
      toggleCustomFont(name, checkbox.checked);
    });

    const span = document.createElement('span');
    span.textContent = name;

    label.append(checkbox, span);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn-reset';
    removeBtn.textContent = '削除';
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

// メッセージは時間では消さない。利用者の注視が別へ移ったとき（ほかのフォームコントロールを操作したとき、
// 設定画面からフォーカスが外れたとき）にだけ消す
// 置換対象フォントのメッセージは、操作したコントロールにフォーカスが移った時点でいったん消え、保存が終わると改めて表示される
fontInput.addEventListener('input', clearStatus);
document.addEventListener('focusin', (e) => {
  if (!e.target.matches('input, select, textarea, button')) return;
  clearModeStatus();
  if (e.target !== saveBtn && e.target !== resetBtn) clearStatus();
});
window.addEventListener('blur', () => {
  clearStatus();
  clearModeStatus();
});

function showStatus(message, type) {
  status.textContent = message;
  status.className = `status ${type}`;
}

function clearStatus() {
  status.textContent = '';
  status.className = 'status';
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
