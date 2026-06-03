(() => {
  // getComputedStyleで直書き指定として検出される場合（稀）
  const UI_FONTS = ['Yu Gothic UI', 'Meiryo UI'];
  // getComputedStyleで解決されずそのまま返されるUIフォント起因の指定
  const TRIGGER_FONTS = ['system-ui', '-apple-system', 'BlinkMacSystemFont'];
  const STORAGE_KEY_ENABLED = 'fidim_enabled';
  const STORAGE_KEY_FONT = 'fidim_font';
  const DEFAULT_FONT = 'sans-serif';

  let enabled = true;
  let replacementFont = DEFAULT_FONT;

  // ストレージから設定を読み込む
  chrome.storage.sync.get(
    { [STORAGE_KEY_ENABLED]: true, [STORAGE_KEY_FONT]: DEFAULT_FONT },
    (result) => {
      enabled = result[STORAGE_KEY_ENABLED];
      replacementFont = result[STORAGE_KEY_FONT] || DEFAULT_FONT;
      if (enabled) {
        processAll();
        observe();
      }
    }
  );

  // 要素のfont-familyをチェックして必要なら上書き
  function processElement(el) {
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    const computed = getComputedStyle(el).fontFamily;
    if (containsUIFont(computed)) {
      el.style.setProperty('font-family', replacementFont, 'important');
    }
  }

  // UIフォントが含まれているか判定
  function containsUIFont(fontFamily) {
    const lower = fontFamily.toLowerCase();
    return [...UI_FONTS, ...TRIGGER_FONTS].some(f => lower.includes(f.toLowerCase()));
  }

  // ページ全体を処理
  function processAll() {
    document.querySelectorAll('*').forEach(processElement);
  }

  // 動的コンテンツに対応
  function observe() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          processElement(node);
          node.querySelectorAll('*').forEach(processElement);
        }
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }

  // popupからの有効・無効切替を受け取る
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FIDIM_TOGGLE') {
      enabled = message.enabled;
      if (enabled) {
        processAll();
        observe();
      } else {
        location.reload();
      }
    }
  });
})();
