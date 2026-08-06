(() => {
  const STORAGE_KEY_ENABLED = 'fidim_enabled';
  const STORAGE_KEY_FONT = 'fidim_font';
  const STORAGE_KEY_EXCLUDED = 'fidim_excluded_hosts';
  const STORAGE_KEY_REPLACE_MODE = 'fidim_replace_mode';
  const STORAGE_KEY_BUILTIN_GROUPS = 'fidim_builtin_groups';
  const STORAGE_KEY_CUSTOM_FONTS = 'fidim_custom_fonts';

  const DEFAULT_FONT = 'sans-serif';
  const MIN_FONT_WEIGHT = 400;
  const DEFAULT_BUILTIN_GROUPS = {
    'system-ui': true,
    'yu-gothic': true,
    'ms-pgothic': true,
    'meiryo': true,
    'yu-mincho': false,
  };

  const BUILTIN_GROUP_FONTS = {
    'system-ui': ['Yu Gothic UI', '游ゴシック UI', 'Meiryo UI', 'system-ui', '-apple-system', 'BlinkMacSystemFont'],
    'yu-gothic': ['Yu Gothic', '游ゴシック'],
    'ms-pgothic': ['MS PGothic', 'ＭＳ Ｐゴシック'],
    'meiryo': ['Meiryo', 'メイリオ'],
    'yu-mincho': ['Yu Mincho', '游明朝', 'YuMincho'],
  };

  let enabled = true;
  let replacementFont = DEFAULT_FONT;
  let replaceMode = 'selective';
  let targetFonts = [];

  chrome.storage.sync.get(
    {
      [STORAGE_KEY_ENABLED]: true,
      [STORAGE_KEY_FONT]: DEFAULT_FONT,
      [STORAGE_KEY_EXCLUDED]: [],
      [STORAGE_KEY_REPLACE_MODE]: 'selective',
      [STORAGE_KEY_BUILTIN_GROUPS]: DEFAULT_BUILTIN_GROUPS,
      [STORAGE_KEY_CUSTOM_FONTS]: [],
    },
    (result) => {
      enabled = result[STORAGE_KEY_ENABLED];
      replacementFont = result[STORAGE_KEY_FONT] || DEFAULT_FONT;
      replaceMode = result[STORAGE_KEY_REPLACE_MODE];
      const excluded = result[STORAGE_KEY_EXCLUDED] || [];

      if (replaceMode === 'selective') {
        const builtinGroups = result[STORAGE_KEY_BUILTIN_GROUPS] || DEFAULT_BUILTIN_GROUPS;
        const customFonts = result[STORAGE_KEY_CUSTOM_FONTS] || [];
        targetFonts = [
          ...Object.entries(builtinGroups)
            .filter(([, on]) => on)
            .flatMap(([id]) => BUILTIN_GROUP_FONTS[id] || []),
          ...customFonts.filter(cf => cf.enabled).map(cf => cf.name),
        ];
      }

      if (enabled && !excluded.includes(location.hostname)) {
        injectFontFaceOverrides();
        processAll();
        observe();
      }
    }
  );

  function injectFontFaceOverrides() {
    const style = document.createElement('style');
    style.textContent = `
      @font-face {
        font-family: 'Anthropic Sans';
        src: local('Arial');
      }
    `;
    document.head.appendChild(style);
  }

  function shouldReplaceFont(computedFontFamily) {
    if (replaceMode === 'all') return true;
    if (targetFonts.length === 0) return false;
    const family = computedFontFamily.toLowerCase();
    return targetFonts.some(f => family.includes(f.toLowerCase()));
  }

  // ヒラギノ角ゴなど一部のフォントを前提に本文へ細いウェイトを指定しているサイトでは、
  // 代替フォントで表示された途端に読めなくなるため、normalより細い指定は打ち消す
  function shouldNormalizeWeight(computedFontWeight) {
    const weight = parseFloat(computedFontWeight);
    return Number.isFinite(weight) && weight < MIN_FONT_WEIGHT;
  }

  function processElement(el) {
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    const computed = getComputedStyle(el);
    if (shouldReplaceFont(computed.fontFamily)) {
      el.style.setProperty('font-family', replacementFont, 'important');
    }
    if (shouldNormalizeWeight(computed.fontWeight)) {
      el.style.setProperty('font-weight', 'normal', 'important');
    }
  }

  function processAll() {
    document.querySelectorAll('*').forEach(processElement);
  }

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
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

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
