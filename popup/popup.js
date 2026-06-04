const toggle = document.getElementById('toggle');
const labelText = document.getElementById('toggle-label-text');
const optionsBtn = document.getElementById('options-btn');
const excludeBtn = document.getElementById('exclude-btn');

const STORAGE_KEY_ENABLED = 'fidim_enabled';
const STORAGE_KEY_EXCLUDED = 'fidim_excluded_hosts';

let currentTabId = null;
let currentHost = null;

// 現在のタブ情報を取得して除外ボタンを初期化
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const tab = tabs[0];
  currentTabId = tab?.id ?? null;

  const url = tab?.url ?? '';
  if (!/^https?:/.test(url)) {
    excludeBtn.hidden = true;
    return;
  }

  currentHost = new URL(url).hostname;

  chrome.storage.sync.get({ [STORAGE_KEY_EXCLUDED]: [] }, (result) => {
    updateExcludeBtn(result[STORAGE_KEY_EXCLUDED].includes(currentHost));
  });
});

// グローバル有効・無効状態を反映
chrome.storage.sync.get({ [STORAGE_KEY_ENABLED]: true }, (result) => {
  toggle.checked = result[STORAGE_KEY_ENABLED];
  updateLabel(toggle.checked);
});

// グローバルトグル操作
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  updateLabel(enabled);
  chrome.storage.sync.set({ [STORAGE_KEY_ENABLED]: enabled });

  if (currentTabId !== null) {
    chrome.tabs.sendMessage(currentTabId, { type: 'FIDIM_TOGGLE', enabled });
  }
});

// 除外トグル操作
excludeBtn.addEventListener('click', () => {
  chrome.storage.sync.get({ [STORAGE_KEY_EXCLUDED]: [] }, (result) => {
    const excluded = result[STORAGE_KEY_EXCLUDED];
    const isExcluded = excluded.includes(currentHost);
    const newExcluded = isExcluded
      ? excluded.filter(h => h !== currentHost)
      : [...excluded, currentHost];

    chrome.storage.sync.set({ [STORAGE_KEY_EXCLUDED]: newExcluded }, () => {
      updateExcludeBtn(!isExcluded);
      if (currentTabId !== null) {
        chrome.tabs.reload(currentTabId);
      }
    });
  });
});

function updateLabel(enabled) {
  labelText.textContent = enabled ? '有効' : '無効';
}

function updateExcludeBtn(isExcluded) {
  excludeBtn.textContent = isExcluded ? '除外を解除' : 'このサイトを除外';
  excludeBtn.classList.toggle('is-excluded', isExcluded);
}

// 設定画面を開く
optionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
