const toggle = document.getElementById('toggle');
const labelText = document.getElementById('toggle-label-text');
const optionsBtn = document.getElementById('options-btn');

const STORAGE_KEY_ENABLED = 'fidim_enabled';

// 現在の状態を反映
chrome.storage.sync.get({ [STORAGE_KEY_ENABLED]: true }, (result) => {
  toggle.checked = result[STORAGE_KEY_ENABLED];
  updateLabel(toggle.checked);
});

// トグル操作
toggle.addEventListener('change', () => {
  const enabled = toggle.checked;
  updateLabel(enabled);
  chrome.storage.sync.set({ [STORAGE_KEY_ENABLED]: enabled });

  // アクティブタブのcontent.jsに通知
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.runtime.sendMessage({ type: 'FIDIM_TOGGLE', enabled });
    }
  });
});

function updateLabel(enabled) {
  labelText.textContent = enabled ? '有効' : '無効';
}

// Settings画面を開く
optionsBtn.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
