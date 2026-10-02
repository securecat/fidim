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

  // 組み込みグループは完全一致で判定するため、ウェイト違いなどで別のファミリー名になっているもの
  // （WindowsのYu Gothic Mediumや、macOSの游ゴシック体、Adobe Fontsのyu-gothic-pr6nなど）も漏れなく列挙しておく
  const BUILTIN_GROUP_FONTS = {
    'system-ui': [
      'Yu Gothic UI', '游ゴシック UI',
      'Yu Gothic UI Semibold', 'Yu Gothic UI Semilight', 'Yu Gothic UI Light',
      'Meiryo UI',
      'system-ui', '-apple-system', 'BlinkMacSystemFont',
    ],
    'yu-gothic': [
      'Yu Gothic', '游ゴシック',
      'Yu Gothic Medium', '游ゴシック Medium',
      'Yu Gothic Light', '游ゴシック Light',
      'YuGothic', '游ゴシック体',
      'yu-gothic-pr6n',
    ],
    'ms-pgothic': ['MS PGothic', 'ＭＳ Ｐゴシック'],
    'meiryo': ['Meiryo', 'メイリオ'],
    'yu-mincho': [
      'Yu Mincho', '游明朝',
      'Yu Mincho Demibold', '游明朝 Demibold',
      'Yu Mincho Light', '游明朝 Light',
      'YuMincho', '游明朝体',
      'YuMincho +36p Kana', '游明朝体+36ポかな',
      'yu-mincho-pr6n', 'yu-mincho-36p-kana',
    ],
  };

  // injectFontFaceOverrides() でArialへ差し替えている名前。日本語の字形を持たないので、
  // 実際に表示されるフォントを判定するときは読み飛ばして後続のフォントを見る
  const FONT_FACE_ALIASES = ['Anthropic Sans'];

  // 総称ファミリー（引用符なしで書かれたもの）は、必ずブラウザ既定の何らかのフォントに解決される。
  // ui-sans-serif などChromeが対応していない（読み飛ばす）ものは含めず、描画比較で判定する
  const GENERIC_FAMILIES = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];

  // 日本語の本文がどのフォントで表示されるかを判定するための見本文字
  const PROBE_TEXT = 'あ永';
  const PROBE_FONT_SIZE = 32;

  // @font-face の unicode-range がこれらと重なれば、日本語の字形を含むとみなす（かな・CJK統合漢字）
  const JAPANESE_RANGES = [[0x3040, 0x30FF], [0x4E00, 0x9FFF]];
  const FULL_RANGE_END = 0x10FFFF;
  const PROBE_FALLBACKS = ['serif', 'sans-serif', 'monospace'];

  let enabled = true;
  let replacementFont = DEFAULT_FONT;
  let replaceMode = 'selective';
  let targetFonts = [];
  let customTargetFonts = [];

  let probeContext = null;
  const installedFontCache = new Map();
  const replaceDecisionCache = new Map();
  let fontFaceStates = new Map();
  let fontFaceCount = -1;
  let watchingFontLoading = false;
  let reprocessTimer = null;

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
        targetFonts = Object.entries(builtinGroups)
          .filter(([, on]) => on)
          .flatMap(([id]) => BUILTIN_GROUP_FONTS[id] || [])
          .map(normalizeFamilyName);
        customTargetFonts = customFonts
          .filter(cf => cf.enabled)
          .map(cf => normalizeFamilyName(cf.name));
      }

      if (enabled && !excluded.includes(location.hostname)) {
        injectFontFaceOverrides();
        processAll();
        observe();
        watchFontLoading();
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

  function normalizeFamilyName(name) {
    return name.trim().replace(/^(['"])(.*)\1$/, '$2').trim().toLowerCase();
  }

  // font-family の値を、元の表記（引用符の有無を含む）を保ったまま1件ずつに分割する
  function parseFontFamilyList(value) {
    const families = [];
    let current = '';
    let quote = null;
    for (const char of value) {
      if (quote) {
        if (char === quote) quote = null;
        current += char;
      } else if (char === '"' || char === "'") {
        quote = char;
        current += char;
      } else if (char === ',') {
        families.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    families.push(current.trim());
    return families
      .filter(raw => raw !== '')
      .map(raw => ({
        raw,
        name: normalizeFamilyName(raw),
        quoted: /^['"]/.test(raw),
      }));
  }

  function parseUnicodeRange(unicodeRange) {
    return unicodeRange.split(',').flatMap((part) => {
      const match = part.trim().match(/^U\+([0-9A-F?]+)(?:-([0-9A-F]+))?$/i);
      if (!match) return [];
      const [, start, end] = match;
      const low = parseInt(start.replace(/\?/g, '0'), 16);
      const high = end ? parseInt(end, 16) : parseInt(start.replace(/\?/g, 'F'), 16);
      return [[low, high]];
    });
  }

  // 優先度の高い順。同じファミリー名に複数の定義があるときは、最も優先度の高い状態を採用する
  //   'japanese' … unicode-range が日本語の範囲と重なる。読み込み前でも最終的にはそれで表示される
  //   'probe'    … unicode-range を省略した（全範囲の）定義で、読み込み済み。描画比較で確かめる
  //   'pending'  … unicode-range を省略した定義で、読み込み前。それで表示される見込みとして扱う
  //   'skip'     … 日本語を含む定義が無い、またはすべて読み込みに失敗した
  const FONT_FACE_STATE_PRIORITY = ['japanese', 'probe', 'pending', 'skip'];

  function getFontFaceState(face) {
    if (face.status === 'error') return 'skip';
    const ranges = parseUnicodeRange(face.unicodeRange);
    // local("Arial") だけのフォールバック用定義などは全範囲扱いになり、範囲からは判断できない
    if (ranges.some(([low, high]) => low === 0 && high >= FULL_RANGE_END)) {
      return face.status === 'loaded' ? 'probe' : 'pending';
    }
    // Adobe Fontsのように、ページで使う文字だけを列挙した定義もあるため、範囲の重なりで判断する
    const overlapsJapanese = ranges.some(([low, high]) =>
      JAPANESE_RANGES.some(([jaLow, jaHigh]) => low <= jaHigh && jaLow <= high));
    return overlapsJapanese ? 'japanese' : 'skip';
  }

  // ページが @font-face で定義したフォントの状態を、ファミリー名ごとにまとめる。
  // 全範囲の定義は読み込み後に描画比較で確かめ直す（watchFontLoading() を参照）
  function getFontFaceStates() {
    if (document.fonts.size !== fontFaceCount) {
      fontFaceCount = document.fonts.size;
      fontFaceStates = new Map();
      document.fonts.forEach((face) => {
        const name = normalizeFamilyName(face.family);
        const state = getFontFaceState(face);
        const current = fontFaceStates.get(name);
        if (!current || FONT_FACE_STATE_PRIORITY.indexOf(state) < FONT_FACE_STATE_PRIORITY.indexOf(current)) {
          fontFaceStates.set(name, state);
        }
      });
      replaceDecisionCache.clear();
    }
    return fontFaceStates;
  }

  function clearFontCaches() {
    fontFaceCount = -1;
    installedFontCache.clear();
    replaceDecisionCache.clear();
  }

  // Webフォントの読み込みが終わる（または失敗する）と、実際に表示されるフォントが変わりうるので判定し直す
  function watchFontLoading() {
    if (watchingFontLoading) return;
    watchingFontLoading = true;
    const reprocess = () => {
      clearTimeout(reprocessTimer);
      reprocessTimer = setTimeout(() => {
        if (!enabled) return;
        clearFontCaches();
        processAll();
      }, 100);
    };
    document.fonts.addEventListener('loadingdone', reprocess);
    document.fonts.addEventListener('loadingerror', reprocess);
  }

  function renderProbe(fontFamily) {
    if (!probeContext) {
      const canvas = document.createElement('canvas');
      canvas.width = PROBE_FONT_SIZE * (PROBE_TEXT.length + 1);
      canvas.height = PROBE_FONT_SIZE * 1.5;
      probeContext = canvas.getContext('2d', { willReadFrequently: true });
      probeContext.textBaseline = 'top';
    }
    const { width, height } = probeContext.canvas;
    probeContext.clearRect(0, 0, width, height);
    probeContext.font = `${PROBE_FONT_SIZE}px ${fontFamily}`;
    probeContext.fillText(PROBE_TEXT, 0, 0);
    return probeContext.getImageData(0, 0, width, height).data;
  }

  // 日本語の字形を持つフォントとしてインストールされているかを調べる。
  // フォールバック先だけを変えて描画し、結果がすべて一致すれば、そのフォント自身で描画されている。
  // 日本語の字形を持たないフォント（ArialやSegoe UIなど）は、日本語部分がフォールバック先で
  // 描画されるので「無い」と判定され、後続のフォントへ判定が進む
  function isInstalledWithJapanese(family) {
    if (installedFontCache.has(family.raw)) return installedFontCache.get(family.raw);
    const [first, ...rest] = PROBE_FALLBACKS.map(fallback => renderProbe(`${family.raw}, ${fallback}`));
    const installed = rest.every(pixels => pixels.every((value, i) => value === first[i]));
    installedFontCache.set(family.raw, installed);
    return installed;
  }

  // 組み込みグループは完全一致、カスタムフォントはユーザーが書いた名前を含むものすべてを対象とする
  function isTargetFont(name) {
    return targetFonts.includes(name) || customTargetFonts.some(custom => name.includes(custom));
  }

  // font-family のうち、日本語の本文が実際に表示されるフォントを先頭から探し、それが置換対象かを返す
  function resolveReplaceDecision(computedFontFamily) {
    const aliases = FONT_FACE_ALIASES.map(normalizeFamilyName);
    const fontFaces = getFontFaceStates();
    for (const family of parseFontFamilyList(computedFontFamily)) {
      if (!family.quoted && GENERIC_FAMILIES.includes(family.name)) {
        return isTargetFont(family.name);
      }
      if (aliases.includes(family.name)) continue;
      const fontFaceState = fontFaces.get(family.name);
      if (fontFaceState === 'skip') continue;
      const rendered = fontFaceState === 'japanese' || fontFaceState === 'pending'
        || isInstalledWithJapanese(family);
      if (rendered) return isTargetFont(family.name);
    }
    return false;
  }

  function shouldReplaceFont(computedFontFamily) {
    if (replaceMode === 'all') return true;
    if (targetFonts.length === 0 && customTargetFonts.length === 0) return false;
    getFontFaceStates();
    if (!replaceDecisionCache.has(computedFontFamily)) {
      replaceDecisionCache.set(computedFontFamily, resolveReplaceDecision(computedFontFamily));
    }
    return replaceDecisionCache.get(computedFontFamily);
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
        watchFontLoading();
      } else if (window.top === window) {
        // トップフレームのreloadで配下のiframeもまとめて再構築されるため、
        // iframe側は個別にreloadしない（多重リロードを防ぐ）
        location.reload();
      }
    }
  });
})();
