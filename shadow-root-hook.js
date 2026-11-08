// ページ側（MAIN world）で動くスクリプト。
// 要素がページに追加されたあとで Shadow root が付いても content.js が気づけるよう、
// attachShadow() が呼ばれるたびに、その要素からイベントを送って知らせる。
// 閉じた Shadow DOM でも通知できるよう、イベントは Shadow DOM の境界を越えて（composed）届ける
(() => {
  const SHADOW_ROOT_ATTACHED_EVENT = 'fidim:shadow-root-attached';
  const originalAttachShadow = Element.prototype.attachShadow;

  Element.prototype.attachShadow = function (...args) {
    const shadowRoot = originalAttachShadow.apply(this, args);
    this.dispatchEvent(new CustomEvent(SHADOW_ROOT_ATTACHED_EVENT, { bubbles: true, composed: true }));
    return shadowRoot;
  };
})();
