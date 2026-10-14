import { Profile } from "@/hooks/useAuth";

const C = {
  bg: "#0E0C0A", s1: "#1E1A16", s2: "#27221D",
  brd: "rgba(255,255,255,0.06)", brdL: "rgba(255,255,255,0.1)",
  tx: "#F2F2F4", tx2: "#9194A0", tx3: "#555866",
  ac: "#FFC933", acS: "rgba(123,111,255,0.12)",
  g: "#66F03C",
};

interface Props {
  profile: Profile;
  onClose: () => void;
}

function Row({ label, value, unit }: { label: string; value: string | number | null | undefined; unit?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid " + C.brd }}>
      <div style={{ fontSize: 13, color: C.tx3 }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: value ? C.tx : C.tx3 }}>
        {value ? `${value}${unit ? " " + unit : ""}` : "—"}
      </div>
    </div>
  );
}

export default function ProfileView({ profile, onClose }: Props) {
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ") || profile.full_name;
  const initials = fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ width: "100%", maxWidth: 480, background: C.s1, borderRadius: "6px 6px 0 0", padding: "20px 20px 40px", maxHeight: "85vh", overflowY: "auto" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.tx }}>Mon profil</div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 18, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            ×
          </button>
        </div>

        {/* Avatar + nom */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: C.acS, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: C.ac, marginBottom: 10 }}>
            {initials}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>{fullName}</div>
          <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>Athlète</div>
        </div>

        {/* Données */}
        <div style={{ background: C.s2, borderRadius: 6, padding: "0 16px", border: "1px solid " + C.brd }}>
          <Row label="Prénom" value={profile.first_name} />
          <Row label="Nom" value={profile.last_name} />
          <Row label="Âge" value={profile.age} unit="ans" />
          <Row label="Taille" value={profile.height_cm} unit="cm" />
          <Row label="Genre" value={profile.gender === "male" ? "Homme" : profile.gender === "female" ? "Femme" : null} />
          {profile.weight_kg && <Row label="Poids (référence)" value={profile.weight_kg} unit="kg" />}
          {profile.body_fat_pct && <Row label="Masse grasse" value={profile.body_fat_pct} unit="%" />}
          <Row
            label="Métabolisme de base"
            value={profile.base_metabolism ? profile.base_metabolism.toLocaleString("fr-FR") : null}
            unit={profile.base_metabolism ? "kcal/j" : undefined}
          />
        </div>

        {!profile.first_name && !profile.age && !profile.height_cm && (
          <div style={{ marginTop: 16, padding: "12px", borderRadius: 4, background: C.acS, border: "1px solid " + C.ac + "30", fontSize: 13, color: C.tx2, textAlign: "center" }}>
            Ton coach n'a pas encore rempli ton profil.
          </div>
        )}

        <button
          onClick={onClose}
          style={{ width: "100%", marginTop: 20, padding: "12px 0", borderRadius: 4, border: "1px solid " + C.brdL, background: "transparent", color: C.tx3, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
        >
          Fermer
        </button>
      </div>
    </div>
  );
}
