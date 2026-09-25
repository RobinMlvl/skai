export function formatDuration(min: number): string {
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, "0")}`;
}

export function formatPrice(eur: number): string {
  return `€${eur.toLocaleString("en-US")}`;
}

/** Text folded for comparisons: diacritics removed, lower case ("Zürich" → "zurich"). */
export function foldText(text: string): string {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}
