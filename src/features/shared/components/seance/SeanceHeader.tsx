import { ChevronLeft, Watch } from "lucide-react";
import { Link } from "react-router-dom";
import { C, alpha } from "@/lib/theme";
import { fmtHour, fmtStart, sportBadge, sportFamily } from "@/lib/seance";
import type { ActivityDetail } from "@/lib/activityDetail";
import { DISPLAY, KICKER, MONO, pillStyle } from "./seanceUi";

interface Props {
  detail: ActivityDetail;
  title: string;
  subtitle: string | null;
  back: { to: string; label: string; current: string };
  compact: boolean;
}

/** Attribution obligatoire (règle Garmin : « Garmin [appareil] ») : icône montre + marque + modèle. */
export function Attribution({ text, size = 11 }: { text: string; size?: number }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, ...MONO, fontSize: size, color: C.tx2, whiteSpace: "nowrap" }}>
      <Watch size={size + 2} strokeWidth={1.5} aria-hidden />
      {text}
    </span>
  );
}

export function SeanceHeader({ detail, title, subtitle, back, compact }: Props) {
  const fam = sportFamily(detail.activity.sport);
  const badgeColor = fam === "hyrox" ? C.o : fam === "run" ? C.b : C.pat;
  const realised = detail.link?.status === "confirmed";
  const meta = (
    <>
      <span>{fmtStart(detail.activity.startedAt)}</span>
      {!compact && <Dot />}
      {compact ? <div style={{ marginTop: 4 }}><Attribution text={detail.attribution} /></div> : <Attribution text={detail.attribution} />}
      {!compact && detail.activity.importedAt && (
        <>
          <Dot />
          <span>Synchronisée à {fmtHour(detail.activity.importedAt)}</span>
        </>
      )}
      {subtitle && (
        <>
          {!compact && <Dot />}
          <span style={compact ? { display: "block", marginTop: 4 } : undefined}>{subtitle}</span>
        </>
      )}
    </>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 10 : 14 }}>
      <nav style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: C.tx3 }}>
        <Link to={back.to} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: C.tx3, textDecoration: "none" }}>
          <ChevronLeft size={16} strokeWidth={1.5} />
          {back.label}
        </Link>
        {compact ? <span>· {back.current}</span> : (<><span>›</span><span style={{ color: C.tx2 }}>{back.current}</span></>)}
      </nav>

      <section
        style={{
          position: "relative", borderRadius: compact ? 0 : 16, padding: compact ? 0 : "20px 22px",
          background: compact ? "transparent" : `linear-gradient(160deg, ${alpha(badgeColor, 0.1)}, ${alpha(badgeColor, 0.01)})`,
          border: compact ? "none" : `1px solid ${alpha(badgeColor, 0.35)}`,
          boxShadow: compact ? "none" : `inset 3px 0 0 ${badgeColor}`,
          display: "flex", gap: 16, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 320px" }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            <span style={pillStyle(badgeColor, true)}>{sportBadge(detail.activity.sport)}</span>
            {realised && <span style={pillStyle(C.g, true)}>Réalisée</span>}
            {detail.link?.status === "auto" && <span style={pillStyle(C.ac)}>À confirmer</span>}
          </div>
          <h1 style={{ ...DISPLAY, margin: 0, fontSize: compact ? 20 : 30, lineHeight: 1.15, color: C.tx }}>{title}</h1>
          <div style={{ marginTop: 8, fontSize: 12.5, color: C.tx2, display: compact ? "block" : "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {meta}
          </div>
        </div>
        <ComingSoon compact={compact} />
      </section>
    </div>
  );
}

function Dot() {
  return <span style={{ color: C.tx3 }}>·</span>;
}

/** Emplacement réservé au futur comparatif prévu / réalisé. */
function ComingSoon({ compact }: { compact: boolean }) {
  return (
    <div
      style={{
        flex: compact ? "1 1 100%" : "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14,
        padding: "12px 14px", borderRadius: 12, border: `1px dashed ${C.brdL}`,
      }}
    >
      <div>
        <div style={KICKER}>Prévu / réalisé</div>
        <div style={{ fontSize: 12, color: C.tx2, marginTop: 3 }}>Comparatif avec la séance programmée</div>
      </div>
      <span style={pillStyle(C.ac)}>Bientôt</span>
    </div>
  );
}
