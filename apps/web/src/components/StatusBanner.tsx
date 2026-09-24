import { dateRange, type SearchDetail } from "@skai/core";

export function StatusBanner({ detail }: { detail: SearchDetail }) {
  const { status, error, stats, request } = detail.search;
  const warnings = stats?.warnings ?? [];
  const lines: { tone: "bad" | "warn"; text: string }[] = [];
  if (status === "blocked" || status === "failed") lines.push({ tone: "bad", text: error ?? "The scan failed." });
  if (status === "cancelled") lines.push({ tone: "warn", text: "Scan cancelled." });
  if (status === "partial" && stats) lines.push({ tone: "warn", text: `Missing dates: ${stats.datesMissing.join(", ")}` });
  if ((status === "blocked" || status === "cancelled") && stats && stats.datesOk > 0) {
    const total = dateRange(request.dateFrom, request.dateTo).length;
    const reason = status === "blocked" ? "Google blocked the scan" : "you cancelled";
    lines.push({ tone: "warn", text: `Kept the ${stats.datesOk} of ${total} dates scanned before ${reason}.` });
  }
  for (const warning of warnings) lines.push({ tone: "warn", text: warning });
  if (lines.length === 0) return null;
  return (
    <div role="status">
      {lines.map((line) => (
        <div key={line.text} className={`banner ${line.tone}`}>
          {line.text}
        </div>
      ))}
    </div>
  );
}
