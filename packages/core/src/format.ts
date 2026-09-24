export function formatDuration(min: number): string {
  const hours = Math.floor(min / 60);
  const minutes = min % 60;
  if (hours === 0) return `${minutes}m`;
  return minutes === 0 ? `${hours}h` : `${hours}h${String(minutes).padStart(2, "0")}`;
}

export function formatPrice(eur: number): string {
  return `€${eur.toLocaleString("en-US")}`;
}
