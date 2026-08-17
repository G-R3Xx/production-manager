(() => {
  'use strict';

  const DESKTOP_MIN = 1024;
  const MIN_PANE_HEIGHT = 420;
  const EDGE_GAP = 14;
  const DEFAULT_BOTTOM_RESERVE = 96;
  const OPTION_WATCH_MS = 2600;
  const SETTLE_MS = 750;
  const PAGE_JUMP_THRESHOLD = 100;

  let gallery = null;
  let summary = null;
  let productRoot = null;
  let observer = null;
  let resizeTimer = 0;
  let settleTimer = 0;
  let optionWatchUntil = 0;
  let preservedWindowY = null;
  let preservedWindowX = null;
  let preservedSummaryTop = 0;
  let preservedGalleryTop = 0;
  let restoring = false;

  const connected = (el) => el instanceof HTMLElement && el.isConnected;

  const visible = (element) => {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 80 && rect.height > 40;
  };

  const firstVisible = (selectors) => {
    for (const selector of selectors) {
      for (const candidate of document.querySelectorAll(selector)) {
        if (visible(candidate)) return candidate;
      }
    }
    return null;
  };

  const findGallery = () => firstVisible([
    'body.single-product .woocommerce div.product div.images',
    'body.single-product div.product div.images.woocommerce-product-gallery',
    'body.single-product .woocommerce-product-gallery',
    'body.single-product .et_pb_wc_images',
    'body.single-product [class*="te-v"][class*="gallery"]',
    'body.single-product [class*="te-"][class*="product-gallery"]'
  ]);

  const findSummary = () => firstVisible([
    'body.single-product .woocommerce div.product div.summary',
    'body.single-product div.product .summary.entry-summary',
    'body.single-product .entry-summary',
    'body.single-product .et_pb_wc_add_to_cart',
    'body.single-product [class*="te-v"][class*="configurator"]',
    'body.single-product [class*="te-"][class*="builder-wrap"]'
  ]);

  const commonAncestor = (a, b) => {
    const seen = new Set();
    for (let node = a; node && node !== document.body; node = node.parentElement) seen.add(node);
    for (let node = b; node && node !== document.body; node = node.parentElement) if (seen.has(node)) return node;
    return null;
  };

  const topReserve = () => {
    let reserve = 0;
    for (const element of document.querySelectorAll('body.single-product *')) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const style = window.getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const rect = element.getBoundingClientRect();
      if (rect.top <= 40 && rect.bottom > 0 && rect.width >= window.innerWidth * 0.55 && rect.height >= 24 && rect.height <= 180) {
        reserve = Math.max(reserve, Math.ceil(rect.bottom));
      }
    }
    return reserve;
  };

  const bottomReserve = () => {
    let reserve = DEFAULT_BOTTOM_RESERVE;
    for (const element of document.querySelectorAll('body.single-product *')) {
      if (!(element instanceof HTMLElement) || !visible(element)) continue;
      const style = window.getComputedStyle(element);
      if (style.position !== 'fixed' && style.position !== 'sticky') continue;
      const rect = element.getBoundingClientRect();
      const bottom = Number.parseFloat(style.bottom || '9999');
      const nearBottom = Math.abs(window.innerHeight - rect.bottom) <= 8 || bottom <= 8;
      if (nearBottom && rect.width >= window.innerWidth * 0.55 && rect.height >= 44 && rect.height <= 180) {
        reserve = Math.max(reserve, Math.ceil(rect.height) + 8);
      }
    }
    return reserve;
  };

  const optionWatchActive = () => window.innerWidth >= DESKTOP_MIN && preservedWindowY !== null && Date.now() <= optionWatchUntil;

  const clearPane = (pane, suffix) => {
    if (!connected(pane)) return;
    pane.classList.remove('te-independent-scroll-pane', `te-independent-scroll-pane--${suffix}`);
  };

  const clear = () => {
    clearPane(gallery, 'gallery');
    clearPane(summary, 'summary');
    document.body.classList.remove('te-independent-product-scroll');
    document.body.style.removeProperty('--te-product-pane-height');
    document.documentElement.classList.remove('te-product-option-settling');
    gallery = null;
    summary = null;
    productRoot = null;
  };

  const acquire = () => {
    // IMPORTANT: do not rediscover a still-connected summary just because an
    // option-image redraw temporarily changes its dimensions/visibility.
    // That was what could make the RHS vanish in v1.0.3.
    if (!connected(gallery)) gallery = findGallery();
    if (!connected(summary)) summary = findSummary();
    if (!gallery || !summary || gallery === summary) return false;
    productRoot = commonAncestor(gallery, summary) || gallery.closest('div.product') || summary.closest('div.product');
    return true;
  };

  const paneHeight = () => {
    const top = Math.max(
      topReserve(),
      Math.min(
        gallery ? Math.max(0, gallery.getBoundingClientRect().top) : window.innerHeight,
        summary ? Math.max(0, summary.getBoundingClientRect().top) : window.innerHeight
      )
    );
    return Math.max(MIN_PANE_HEIGHT, Math.floor(window.innerHeight - top - bottomReserve() - EDGE_GAP));
  };

  const apply = () => {
    if (!document.body.classList.contains('single-product') || window.innerWidth < DESKTOP_MIN) {
      clear();
      return;
    }
    if (!acquire()) return;

    gallery.classList.add('te-independent-scroll-pane', 'te-independent-scroll-pane--gallery');
    summary.classList.add('te-independent-scroll-pane', 'te-independent-scroll-pane--summary');
    document.body.classList.add('te-independent-product-scroll');
    document.body.dataset.teSplitScroll = '1.0.4';
    document.body.style.setProperty('--te-product-pane-height', `${paneHeight()}px`);

    if (optionWatchActive()) {
      summary.scrollTop = Math.min(preservedSummaryTop, Math.max(0, summary.scrollHeight - summary.clientHeight));
      gallery.scrollTop = Math.min(preservedGalleryTop, Math.max(0, gallery.scrollHeight - gallery.clientHeight));
    }
  };

  const scheduleApply = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(apply, 90);
  };

  const restoreWindow = (force = false) => {
    if (!optionWatchActive() || restoring) return;
    if (!force && Math.abs(window.scrollY - preservedWindowY) < PAGE_JUMP_THRESHOLD) return;
    restoring = true;
    window.scrollTo({ top: preservedWindowY, left: preservedWindowX ?? window.scrollX, behavior: 'auto' });
    window.requestAnimationFrame(() => { restoring = false; });
  };

  const restorePanes = () => {
    if (!optionWatchActive()) return;
    if (connected(summary)) summary.scrollTop = Math.min(preservedSummaryTop, Math.max(0, summary.scrollHeight - summary.clientHeight));
    if (connected(gallery)) gallery.scrollTop = Math.min(preservedGalleryTop, Math.max(0, gallery.scrollHeight - gallery.clientHeight));
  };

  const restoreBurst = () => {
    const run = () => { restoreWindow(true); restorePanes(); };
    run();
    window.requestAnimationFrame(run);
    window.setTimeout(run, 40);
    window.setTimeout(run, 120);
    window.setTimeout(run, 260);
    window.setTimeout(run, 520);
  };

  const finishSoon = () => {
    window.clearTimeout(settleTimer);
    optionWatchUntil = Math.max(optionWatchUntil, Date.now() + SETTLE_MS);
    settleTimer = window.setTimeout(() => {
      restoreWindow(true);
      restorePanes();
      optionWatchUntil = 0;
      document.documentElement.classList.remove('te-product-option-settling');
    }, SETTLE_MS + 60);
  };

  const beginOptionInteraction = (target) => {
    if (window.innerWidth < DESKTOP_MIN || !connected(summary) || !(target instanceof Node) || !summary.contains(target)) return;
    preservedWindowY = window.scrollY;
    preservedWindowX = window.scrollX;
    preservedSummaryTop = summary.scrollTop;
    preservedGalleryTop = connected(gallery) ? gallery.scrollTop : 0;
    optionWatchUntil = Date.now() + OPTION_WATCH_MS;
    document.documentElement.classList.add('te-product-option-settling');
  };

  const installScrollIntoViewGuard = () => {
    const original = Element.prototype.scrollIntoView;
    if (typeof original !== 'function' || original.__teSplitScroll104) return;
    const guarded = function (...args) {
      if (optionWatchActive() && productRoot && this instanceof Node && productRoot.contains(this)) {
        restoreWindow(true);
        return;
      }
      return original.apply(this, args);
    };
    guarded.__teSplitScroll104 = true;
    Element.prototype.scrollIntoView = guarded;
  };

  const start = () => {
    apply();
    installScrollIntoViewGuard();

    window.addEventListener('resize', scheduleApply, { passive: true });
    window.addEventListener('orientationchange', scheduleApply, { passive: true });

    document.addEventListener('pointerdown', (event) => beginOptionInteraction(event.target), true);
    document.addEventListener('click', (event) => beginOptionInteraction(event.target), true);
    document.addEventListener('change', (event) => beginOptionInteraction(event.target), true);

    window.addEventListener('scroll', () => {
      if (optionWatchActive() && !restoring && Math.abs(window.scrollY - preservedWindowY) >= PAGE_JUMP_THRESHOLD) {
        window.requestAnimationFrame(() => restoreWindow(true));
      }
    }, { passive: true });

    observer = new MutationObserver((mutations) => {
      if (!connected(gallery) || !connected(summary)) scheduleApply();
      if (!optionWatchActive()) return;

      const galleryTouched = mutations.some((mutation) => {
        if (!gallery) return false;
        const target = mutation.target;
        if (target === gallery || (target instanceof Node && gallery.contains(target))) return true;
        for (const node of mutation.addedNodes) if (node === gallery || (node instanceof Node && gallery.contains(node))) return true;
        return false;
      });

      restoreBurst();
      if (galleryTouched || !connected(gallery)) finishSoon();
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'class', 'style']
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
