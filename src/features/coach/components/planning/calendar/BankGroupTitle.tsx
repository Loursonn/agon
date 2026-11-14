import { C } from "@/lib/theme";

export function BankGroupTitle({ label, color, count }: { label: string; color: string; count?: number }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 800, color,
      textTransform: "uppercase", letterSpacing: "0.06em",
      display: "flex", alignItems: "center", gap: 5,
      margin: "4px 0 2px",
    }}>
      <span style={{ width: 10, height: 2, borderRadius: 1, background: color, flexShrink: 0 }} />
      {label}
      {count != null && <span style={{ fontWeight: 500, opacity: 0.6 }}>{count}</span>}
      <span style={{ flex: 1, height: 1, background: C.brd }} />
    </div>
  );
}
