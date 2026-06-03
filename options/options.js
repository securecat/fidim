const fontInput = document.getElementById('font-input');
const saveBtn = document.getElementById('save-btn');
const resetBtn = document.getElementById('reset-btn');
const status = document.getElementById('status');

const STORAGE_KEY_FONT = 'fidim_font';
const DEFAULT_FONT = 'sans-serif';

// 保存済みの値を読み込む
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
