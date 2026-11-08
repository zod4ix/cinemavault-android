/**
 * Smart 2D Geometric Spatial Navigation & Universal Mouse / Air Mouse Engine
 * for Android TV D-Pad Remotes, Air Mice, USB/Bluetooth Mice, and Touchscreens.
 * Uses preventScroll + container-isolated scrolling so the viewport NEVER shifts sideways!
 */

declare global {
  interface Window {
    __cinemaHandleDpad?: (key: string) => boolean;
    __cinemaHandleDpadEnter?: () => boolean;
    __cinemaOnMouseHover?: (normX: number, normY: number) => void;
    __cinemaEnsureClickAt?: (normX: number, normY: number) => void;
    __cinemaOnMouseWheel?: (normX: number, normY: number, vScroll: number, hScroll: number) => void;
    __cinemaCustomDpadHandler?: ((key: string) => boolean) | null;
    __cinemaCustomDpadEnterHandler?: (() => boolean) | null;
  }
}

export const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [role="button"]:not([disabled]), [tabindex="0"]:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled])';

export function isElementVisible(el: HTMLElement): boolean {
  if (!el || !el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (
    style.display === 'none' ||
    style.visibility === 'hidden' ||
    style.pointerEvents === 'none' ||
    parseFloat(style.opacity || '1') < 0.05
  ) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 4 && rect.height > 4;
}

/**
 * Checks if an element inside a horizontal scroll container (.overflow-x-auto)
 * is currently visible within that container's horizontal viewport.
 */
function isHorizontallyInContainerView(el: HTMLElement): boolean {
  const elRect = el.getBoundingClientRect();
  let parent = el.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      parent.scrollWidth > parent.clientWidth + 8
    ) {
      const pRect = parent.getBoundingClientRect();
      return elRect.right > pRect.left + 6 && elRect.left < pRect.right - 6;
    }
    parent = parent.parentElement;
  }
  return elRect.right > 0 && elRect.left < window.innerWidth;
}

function getHorizontalScrollParent(el: HTMLElement): HTMLElement | null {
  let parent = el.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      parent.scrollWidth > parent.clientWidth + 4
    ) {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

function getNavRowGroup(el: HTMLElement): HTMLElement | null {
  return el.closest<HTMLElement>('[data-nav-row]') || getHorizontalScrollParent(el);
}

/**
 * Safely scroll an element into view inside its horizontal carousel or vertical scroll container
 * WITHOUT ever triggering horizontal scroll on window / documentElement / body.
 */
export function scrollElementIntoViewSafe(el: HTMLElement) {
  if (!el) return;

  // 1. Horizontal scroll: find nearest horizontal scroll container (.overflow-x-auto)
  const horizParent = getHorizontalScrollParent(el);
  if (horizParent) {
    const parentRect = horizParent.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const offsetLeft = elRect.left - parentRect.left + horizParent.scrollLeft;
    const targetScrollLeft = offsetLeft - horizParent.clientWidth / 2 + elRect.width / 2;
    horizParent.scrollTo({
      left: Math.max(0, targetScrollLeft),
      behavior: 'smooth',
    });
  }

  // 2. Vertical scroll: check if inside a vertical modal scroll container or main window
  const elRect = el.getBoundingClientRect();
  const margin = 96;
  let vertContainer: HTMLElement | null = el.parentElement;
  while (
    vertContainer &&
    vertContainer !== document.body &&
    vertContainer !== document.documentElement
  ) {
    const style = window.getComputedStyle(vertContainer);
    if (
      (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
      vertContainer.scrollHeight > vertContainer.clientHeight + 4
    ) {
      break;
    }
    vertContainer = vertContainer.parentElement;
  }

  if (
    vertContainer &&
    vertContainer !== document.body &&
    vertContainer !== document.documentElement
  ) {
    const cRect = vertContainer.getBoundingClientRect();
    if (elRect.top < cRect.top + 44) {
      vertContainer.scrollBy({ top: elRect.top - cRect.top - 44, behavior: 'smooth' });
    } else if (elRect.bottom > cRect.bottom - 44) {
      vertContainer.scrollBy({ top: elRect.bottom - cRect.bottom + 44, behavior: 'smooth' });
    }
  } else {
    if (elRect.top < margin) {
      window.scrollTo({
        top: Math.max(0, window.scrollY + elRect.top - margin),
        left: 0,
        behavior: 'smooth',
      });
    } else if (elRect.bottom > window.innerHeight - margin) {
      window.scrollTo({
        top: window.scrollY + (elRect.bottom - (window.innerHeight - margin)),
        left: 0,
        behavior: 'smooth',
      });
    }
  }
}

function getActiveScopeRoot(): ParentNode {
  const modalSelectors = Array.from(
    document.querySelectorAll<HTMLElement>('[data-modal-scope="true"], .fixed.inset-0.z-50')
  ).filter(isElementVisible);

  if (modalSelectors.length > 0) {
    return modalSelectors[modalSelectors.length - 1];
  }
  return document;
}

export function initSpatialNavigation(): () => void {
  let lastDpadTime = 0;
  let lastNativeClickTime = 0;
  let lastClickedElement: HTMLElement | null = null;

  // Capture-phase click listener to track native clicks and block accidental hardware double-bounces (<160ms)
  const handleGlobalClickCapture = (e: MouseEvent) => {
    const now = Date.now();
    const target = e.target as HTMLElement | null;
    const interactive = target?.closest<HTMLElement>(FOCUSABLE_SELECTOR) || target;

    if (
      interactive &&
      interactive === lastClickedElement &&
      now - lastNativeClickTime < 160 &&
      interactive.tagName.toLowerCase() !== 'input'
    ) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    lastNativeClickTime = now;
    lastClickedElement = interactive || null;
  };

  const navigateSpatial = (key: string): boolean => {
    if (
      key !== 'ArrowUp' &&
      key !== 'ArrowDown' &&
      key !== 'ArrowLeft' &&
      key !== 'ArrowRight'
    ) {
      return false;
    }

    // Allow custom D-Pad handler (e.g., Virtual Cursor inside VideoPlayer) to intercept
    if (window.__cinemaCustomDpadHandler && window.__cinemaCustomDpadHandler(key)) {
      return true;
    }

    const now = Date.now();
    if (now - lastDpadTime < 32) {
      return true;
    }
    lastDpadTime = now;

    const scopeRoot = getActiveScopeRoot();
    const candidates = Array.from(
      scopeRoot.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
    ).filter(isElementVisible);

    if (candidates.length === 0) return false;

    const active = document.activeElement as HTMLElement | null;

    // Handle text inputs only when non-empty and caret is inside text bounds
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      const inp = active as HTMLInputElement | HTMLTextAreaElement;
      const val = inp.value || '';
      if (!inp.readOnly && val.length > 0) {
        if (key === 'ArrowLeft' && (inp.selectionStart ?? 0) > 0) {
          return false;
        }
        if (key === 'ArrowRight' && (inp.selectionEnd ?? 0) < val.length) {
          return false;
        }
      }
    }

    // If nothing is focused inside current scope (or an iframe / body has focus), focus first visible candidate
    if (
      !active ||
      active === document.body ||
      active.tagName === 'IFRAME' ||
      !scopeRoot.contains(active) ||
      !isElementVisible(active)
    ) {
      const visibleFirst = candidates.find(isHorizontallyInContainerView) || candidates[0];
      visibleFirst.focus({ preventScroll: true });
      scrollElementIntoViewSafe(visibleFirst);
      return true;
    }

    const curRect = active.getBoundingClientRect();
    const curX = curRect.left + curRect.width / 2;
    const curY = curRect.top + curRect.height / 2;
    const curRowGroup = getNavRowGroup(active);

    // ──────── HORIZONTAL NAVIGATION (ArrowLeft / ArrowRight) ────────
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const isRight = key === 'ArrowRight';

      // Pass 1: Look for candidates in the EXACT SAME visual row or same [data-nav-row] / carousel container
      let bestSameRow: HTMLElement | null = null;
      let bestSameRowScore = Infinity;

      for (const el of candidates) {
        if (el === active) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - curX;
        const dy = Math.abs(cy - curY);

        if (isRight && dx <= 3) continue;
        if (!isRight && dx >= -3) continue;

        const elRowGroup = getNavRowGroup(el);
        const sameGroup = Boolean(curRowGroup && elRowGroup && curRowGroup === elRowGroup);
        const verticalOverlap =
          Math.min(curRect.bottom, r.bottom) - Math.max(curRect.top, r.top);
        const minHeight = Math.min(curRect.height, r.height);
        const isSameVisualRow =
          sameGroup || verticalOverlap > Math.max(4, minHeight * 0.25) || dy <= minHeight * 0.55;

        if (!isSameVisualRow) continue;

        const distPrimary = Math.abs(dx);
        const score = distPrimary + dy * 1.5 - (sameGroup ? 25 : 0);
        if (score < bestSameRowScore) {
          bestSameRowScore = score;
          bestSameRow = el;
        }
      }

      if (bestSameRow) {
        bestSameRow.focus({ preventScroll: true });
        scrollElementIntoViewSafe(bestSameRow);
        return true;
      }

      // Pass 2: Fallback for wrapped grids if no candidate in strict same row
      let bestFallback: HTMLElement | null = null;
      let bestFallbackScore = Infinity;

      for (const el of candidates) {
        if (el === active) continue;
        if (!isHorizontallyInContainerView(el)) continue;
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = cx - curX;
        const dy = Math.abs(cy - curY);

        if (isRight && dx <= 4) continue;
        if (!isRight && dx >= -4) continue;
        if (dy > Math.max(curRect.height, r.height) * 0.9) continue;

        const score = Math.abs(dx) + dy * 4.0;
        if (score < bestFallbackScore) {
          bestFallbackScore = score;
          bestFallback = el;
        }
      }

      if (bestFallback) {
        bestFallback.focus({ preventScroll: true });
        scrollElementIntoViewSafe(bestFallback);
        return true;
      }

      return true;
    }

    // ──────── VERTICAL NAVIGATION (ArrowUp / ArrowDown) ────────
    const isDown = key === 'ArrowDown';

    interface VertCandidate {
      el: HTMLElement;
      r: DOMRect;
      cx: number;
      cy: number;
      vGap: number;
      inHorizView: boolean;
    }

    const rawVertCandidates: VertCandidate[] = [];

    for (const el of candidates) {
      if (el === active) continue;
      // Do not jump to another item inside the exact same horizontal single-row strip
      if (curRowGroup && curRowGroup === getNavRowGroup(el)) {
        const rCheck = el.getBoundingClientRect();
        const overlapY =
          Math.min(curRect.bottom, rCheck.bottom) - Math.max(curRect.top, rCheck.top);
        if (overlapY > 4) continue;
      }

      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dy = cy - curY;

      // Must not be in the same visual horizontal line
      const verticalOverlap =
        Math.min(curRect.bottom, r.bottom) - Math.max(curRect.top, r.top);
      const minH = Math.min(curRect.height, r.height);
      if (verticalOverlap > minH * 0.45) continue;

      if (isDown && dy <= 4) continue;
      if (!isDown && dy >= -4) continue;

      const vGap = isDown
        ? Math.max(0, r.top - curRect.bottom)
        : Math.max(0, curRect.top - r.bottom);

      rawVertCandidates.push({
        el,
        r,
        cx,
        cy,
        vGap,
        inHorizView: isHorizontallyInContainerView(el),
      });
    }

    if (rawVertCandidates.length === 0) return true;

    // Prefer candidates that are currently visible inside their horizontal carousels
    const visibleVert = rawVertCandidates.filter((c) => c.inHorizView);
    const pool = visibleVert.length > 0 ? visibleVert : rawVertCandidates;

    // Nearest Row Band algorithm: find minimum vGap so we NEVER skip an entire row!
    let minVGap = Infinity;
    for (const c of pool) {
      if (c.vGap < minVGap) minVGap = c.vGap;
    }

    const rowBandTolerance = Math.max(46, curRect.height * 0.9);
    let bestVert: HTMLElement | null = null;
    let bestVertScore = Infinity;

    for (const c of pool) {
      const bandPenalty =
        c.vGap <= minVGap + rowBandTolerance ? 0 : (c.vGap - minVGap) * 6.5;

      const horizOverlap =
        Math.min(curRect.right, c.r.right) - Math.max(curRect.left, c.r.left);
      const edgeDistX =
        horizOverlap > 0
          ? 0
          : Math.min(
              Math.abs(c.r.left - curRect.right),
              Math.abs(c.r.right - curRect.left)
            );
      const centerDistX = Math.abs(c.cx - curX);

      const score = bandPenalty + c.vGap * 1.6 + edgeDistX * 1.1 + centerDistX * 0.35;
      if (score < bestVertScore) {
        bestVertScore = score;
        bestVert = c.el;
      }
    }

    if (bestVert) {
      bestVert.focus({ preventScroll: true });
      scrollElementIntoViewSafe(bestVert);
      return true;
    }

    return true;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (
      e.key === 'ArrowUp' ||
      e.key === 'ArrowDown' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight'
    ) {
      const handled = navigateSpatial(e.key);
      if (handled) {
        e.preventDefault();
      }
    }
  };

  // Expose D-Pad handlers for Android MainActivity bridge
  window.__cinemaHandleDpad = (key: string) => {
    return navigateSpatial(key);
  };

  window.__cinemaHandleDpadEnter = () => {
    if (window.__cinemaCustomDpadEnterHandler && window.__cinemaCustomDpadEnterHandler()) {
      return true;
    }

    const scopeRoot = getActiveScopeRoot();
    const active = document.activeElement as HTMLElement | null;

    if (
      !active ||
      active === document.body ||
      active.tagName === 'IFRAME' ||
      !scopeRoot.contains(active)
    ) {
      const candidates = Array.from(
        scopeRoot.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter(isElementVisible);
      if (candidates.length > 0) {
        candidates[0].focus({ preventScroll: true });
        candidates[0].click();
        return true;
      }
      return false;
    }

    if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') {
      (active as HTMLInputElement).readOnly = false;
      active.focus();
      return true;
    }

    active.click();
    return true;
  };

  // Expose Mouse / Air Mouse Hover Handler
  window.__cinemaOnMouseHover = (normX: number, normY: number) => {
    const clientX = Math.round(normX * window.innerWidth);
    const clientY = Math.round(normY * window.innerHeight);

    // Wake up any auto-hiding player controls
    window.dispatchEvent(
      new MouseEvent('mousemove', { clientX, clientY, bubbles: true })
    );

    const active = document.activeElement as HTMLElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
      return;
    }

    const elAtPoint = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!elAtPoint) return;

    const focusable = elAtPoint.closest<HTMLElement>(FOCUSABLE_SELECTOR);
    if (focusable && isElementVisible(focusable) && focusable !== active) {
      if (focusable.tagName !== 'INPUT' && focusable.tagName !== 'TEXTAREA') {
        focusable.focus({ preventScroll: true });
      }
    }
  };

  // Expose Guaranteed Click Fallback for Mouse / Air Mouse / Remote Mouse Mode
  window.__cinemaEnsureClickAt = (normX: number, normY: number) => {
    if (Date.now() - lastNativeClickTime < 135) {
      return;
    }

    const clientX = Math.round(normX * window.innerWidth);
    const clientY = Math.round(normY * window.innerHeight);
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!target || target.tagName === 'IFRAME') return;

    const interactive =
      target.closest<HTMLElement>(FOCUSABLE_SELECTOR) || target;

    if (interactive.tagName === 'INPUT' || interactive.tagName === 'TEXTAREA') {
      (interactive as HTMLInputElement).readOnly = false;
      interactive.focus();
      interactive.click();
      return;
    }

    if (interactive.tagName === 'SELECT') {
      interactive.focus();
      interactive.click();
      return;
    }

    interactive.focus({ preventScroll: true });
    interactive.click();
  };

  // Expose Mouse Wheel Handler for horizontal carousels & vertical containers
  window.__cinemaOnMouseWheel = (
    normX: number,
    normY: number,
    vScroll: number,
    hScroll: number
  ) => {
    const clientX = Math.round(normX * window.innerWidth);
    const clientY = Math.round(normY * window.innerHeight);
    const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
    if (!target) return;

    const horizParent = getHorizontalScrollParent(target);
    if (horizParent && Math.abs(hScroll) > 0.05) {
      horizParent.scrollBy({ left: hScroll * 120, behavior: 'smooth' });
      return;
    }

    let vertContainer: HTMLElement | null = target;
    while (
      vertContainer &&
      vertContainer !== document.body &&
      vertContainer !== document.documentElement
    ) {
      const style = window.getComputedStyle(vertContainer);
      if (
        (style.overflowY === 'auto' || style.overflowY === 'scroll') &&
        vertContainer.scrollHeight > vertContainer.clientHeight + 4
      ) {
        vertContainer.scrollBy({ top: -vScroll * 140, behavior: 'smooth' });
        return;
      }
      vertContainer = vertContainer.parentElement;
    }

    window.scrollBy({ top: -vScroll * 160, left: 0, behavior: 'smooth' });
  };

  // Standard DOM pointermove also highlights focusable elements under a desktop/USB mouse
  let lastDomMove = 0;
  const handlePointerMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const now = Date.now();
    if (now - lastDomMove < 40) return;
    lastDomMove = now;

    const active = document.activeElement as HTMLElement | null;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;

    const target = e.target as HTMLElement | null;
    const focusable = target?.closest<HTMLElement>(FOCUSABLE_SELECTOR);
    if (
      focusable &&
      focusable !== active &&
      focusable.tagName !== 'INPUT' &&
      focusable.tagName !== 'TEXTAREA' &&
      isElementVisible(focusable)
    ) {
      focusable.focus({ preventScroll: true });
    }
  };

  window.addEventListener('click', handleGlobalClickCapture, true);
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('pointermove', handlePointerMove, { passive: true });

  return () => {
    window.removeEventListener('click', handleGlobalClickCapture, true);
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('pointermove', handlePointerMove);
    delete window.__cinemaHandleDpad;
    delete window.__cinemaHandleDpadEnter;
    delete window.__cinemaOnMouseHover;
    delete window.__cinemaEnsureClickAt;
    delete window.__cinemaOnMouseWheel;
  };
}
