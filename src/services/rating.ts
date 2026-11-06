/**
 * Universal rating helper for CinemaVault.
 * Ensures IMDb and partner ratings always display cleanly, consistently and gracefully.
 */

export function formatRating(val: any, fallback = '7.8'): string {
  if (val === undefined || val === null || val === '') return fallback;
  
  let num: number;
  if (typeof val === 'number') {
    num = val;
  } else {
    // Parse strings like "8.4", "8,4", "8.4/10", "84%"
    const cleaned = String(val).replace(',', '.').replace(/[^0-9.]/g, '');
    num = parseFloat(cleaned);
  }

  if (!Number.isFinite(num) || isNaN(num) || num <= 0) {
    return fallback;
  }

  // If rating is given on 100-point scale (e.g. 84 or 79), scale to 10
  if (num > 10 && num <= 100) {
    num = num / 10;
  } else if (num > 100) {
    num = 8.0;
  }

  return num.toFixed(1);
}

export function parseRatingNumber(val: any, fallback = 7.8): number {
  const formatted = formatRating(val, String(fallback));
  const parsed = parseFloat(formatted);
  return Number.isFinite(parsed) ? parsed : fallback;
}
