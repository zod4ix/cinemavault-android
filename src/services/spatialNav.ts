/**
 * Smart 2D Geometric Spatial Navigation Engine for Android TV D-Pad Remotes,
 * Air Mice, and Keyboards.
 * Uses preventScroll + container-isolated scrolling so the viewport NEVER shifts sideways!
 */

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [role="button"]:not([disabled]), [tabindex="0"]:not([disabled]), input:not([disabled]), select:not([disabled])';

function isVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return rect.width > 4 && rect.height > 4;
}

/**
 * Safely scroll an element into view inside its horizontal carousel or vertical scroll container
 * WITHOUT ever triggering horizontal scroll on window / documentElement / body.
 */
export function scrollElementIntoViewSafe(el: HTMLElement) {
  if (!el) return;

  // 1. Horizontal scroll: find nearest horizontal scroll container (.overflow-x-auto)
  let parent = el.parentElement;
  while (parent && parent !== document.body && parent !== document.documentElement) {
    const style = window.getComputedStyle(parent);
    if (
      (style.overflowX === 'auto' || style.overflowX === 'scroll') &&
      parent.scrollWidth > parent.clientWidth + 4
    ) {
      const parentRect = parent.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const offsetLeft = elRect.left - parentRect.left + parent.scrollLeft;
      const targetScrollLeft = offsetLeft - parent.clientWidth / 2 + elRect.width / 2;
      parent.scrollTo({
        left: Math.max(0, targetScrollLeft),
        behavior: 'smooth',
      });
      break;
    }
    parent = parent.parentElement;
  }

  // 2. Vertical scroll: check if inside a vertical modal scroll container or main window
  const elRect = el.getBoundingClientRect();
  const margin = 90;
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
    if (elRect.top < cRect.top + 40) {
      vertContainer.scrollBy({ top: elRect.top - cRect.top - 40, behavior: 'smooth' });
    } else if (elRect.bottom > cRect.bottom - 40) {
      vertContainer.scrollBy({ top: elRect.bottom - cRect.bottom + 40, behavior: 'smooth' });
    }
  } else {
    if (elRect.top < margin) {
      window.scrollTo({ top: Math.max(0, window.scrollY + elRect.top - margin), left: 0, behavior: 'smooth' });
    } else if (elRect.bottom > window.innerHeight - margin) {
      window.scrollTo({
        top: window.scrollY + (elRect.bottom - (window.innerHeight - margin)),
        left: 0,
        behavior: 'smooth',
      });
    }
  }
}

export function initSpatialNavigation(): () => void {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (
      e.key !== 'ArrowUp' &&
      e.key !== 'ArrowDown' &&
      e.key !== 'ArrowLeft' &&
      e.key !== 'ArrowRight'
    ) {
      return;
    }

    // Do not hijack arrow keys inside text inputs, textareas, or selects
    const active = document.activeElement as HTMLElement | null;
    if (active) {
      const tag = active.tagName.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') return;
        if (tag === 'select') return;
      }
    }

    // Determine scope: if a modal is open (.fixed.inset-0.z-50), restrict focus inside the top-most modal!
    const modals = Array.from(document.querySelectorAll<HTMLElement>('.fixed.inset-0.z-50'));
    const topModal = modals.length > 0 ? modals[modals.length - 1] : null;

    // If VideoPlayer is open in native mode and no overlay menu is open, let VideoPlayer handle arrow seek/volume
    if (topModal && topModal.querySelector('video') && !topModal.querySelector('.z-40')) {
      return;
    }

    const scopeRoot: ParentNode = topModal || document;
    const candidates = Array.from(scopeRoot.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      isVisible
    );

    if (candidates.length === 0) return;

    // If nothing is currently focused inside scope, focus the first candidate
    if (!active || !scopeRoot.contains(active) || active === document.body) {
      e.preventDefault();
      candidates[0].focus({ preventScroll: true });
      return;
    }

    const curRect = active.getBoundingClientRect();
    const curX = curRect.left + curRect.width / 2;
    const curY = curRect.top + curRect.height / 2;

    let bestCandidate: HTMLElement | null = null;
    let bestScore = Infinity;

    for (const el of candidates) {
      if (el === active) continue;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;

      const dx = cx - curX;
      const dy = cy - curY;

      let primary = 0;
      let secondary = 0;

      if (e.key === 'ArrowRight') {
        if (dx <= 4) continue;
        primary = dx;
        secondary = Math.abs(dy);
      } else if (e.key === 'ArrowLeft') {
        if (dx >= -4) continue;
        primary = -dx;
        secondary = Math.abs(dy);
      } else if (e.key === 'ArrowDown') {
        if (dy <= 4) continue;
        primary = dy;
        secondary = Math.abs(dx);
      } else if (e.key === 'ArrowUp') {
        if (dy >= -4) continue;
        primary = -dy;
        secondary = Math.abs(dx);
      }

      // For horizontal arrows, strongly prefer items in the same row (small dy)
      const weightSecondary = e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? 3.5 : 1.35;
      if (
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        secondary > Math.max(curRect.height, r.height) * 1.15
      ) {
        continue;
      }

      const score = primary + secondary * weightSecondary;
      if (score < bestScore) {
        bestScore = score;
        bestCandidate = el;
      }
    }

    if (bestCandidate) {
      e.preventDefault();
      bestCandidate.focus({ preventScroll: true });
      scrollElementIntoViewSafe(bestCandidate);
    }
  };

  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}
