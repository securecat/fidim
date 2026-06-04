const fontInput = document.getElementById('font-input');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const status = document.getElementById('status');
const excludeInput = document.getElementById('exclude-input');
const excludeAddBtn = document.getElementById('exclude-add-btn');
const excludeList = document.getElementById('exclude-list');
const excludeEmpty = document.getElementById('exclude-empty');

const STORAGE_KEY_FONT = 'fidim_font';
const STORAGE_KEY_EXCLUDED = 'fidim_excluded_hosts';
const DEFAULT_FONT = 'sans-serif';

// 保存済みのフォント設定を読み込む
chrome.storage.sync.get({ [STORAGE_KEY_FONT]: DEFAULT_FONT }, (result) => {
  fontInput.value = result[STORAGE_KEY_FONT];
});

// 保存
saveBtn.addEventListener('click', () => {
  const value = fontInput.value.trim() || DEFAULT_FONT;
  fontInput.value = value;
  chrome.storage.sync.set({ [STORAGE_KEY_FONT]: value }, () => {
    showStatus('保存しました', 'saved');
  });
});

// リセット
resetBtn.addEventListener('click', () => {
  fontInput.value = DEFAULT_FONT;
  chrome.storage.sync.set({ [STORAGE_KEY_FONT]: DEFAULT_FONT }, () => {
    showStatus('デフォルトに戻しました', 'saved');
  });
});

// Enterキーでも保存
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

// 除外リストを読み込んで描画
chrome.storage.sync.get({ [STORAGE_KEY_EXCLUDED]: [] }, (result) => {
  renderExcludeList(result[STORAGE_KEY_EXCLUDED]);
});

// ドメインを追加
excludeAddBtn.addEventListener('click', () => {
  addExcludeHost();
});

excludeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addExcludeHost();
});

function addExcludeHost() {
  const raw = excludeInput.value.trim();
  if (!raw) return;

  // URL形式で入力された場合もホスト名だけ取り出す
  let host;
  try {
    host = raw.includes('://') ? new URL(raw).hostname : new URL(`https://${raw}`).hostname;
  } catch {
    host = raw;
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
      removeBtn.className = 'exclude-item-remove';
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
