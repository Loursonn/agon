import { describe, expect, it } from "vitest";
import { watchPushState, type WatchPushInput } from "@/lib/watchPush";

const conn = { status: "active", pushWorkouts: true, grantedScopes: ["ACTIVITY_EXPORT", "WORKOUT_IMPORT"] };
const base: WatchPushInput = { connection: conn, sessionStatus: "planned", date: "2026-11-20", today: "2026-11-14", sent: false };

describe("watchPushState", () => {
  it("séance prévue à venir : prête, ou à renvoyer si déjà envoyée", () => {
    expect(watchPushState(base)).toBe("ready");
    expect(watchPushState({ ...base, sent: true })).toBe("sent");
    expect(watchPushState({ ...base, date: "2026-11-14" })).toBe("ready");
  });

  it("pas de Garmin : rien", () => {
    expect(watchPushState({ ...base, connection: undefined })).toBe("hidden");
    expect(watchPushState({ ...base, connection: { ...conn, status: "revoked" } })).toBe("hidden");
  });

  it("faite, commencée ou passée : jamais de bouton, mention si déjà envoyée", () => {
    expect(watchPushState({ ...base, sessionStatus: "completed" })).toBe("hidden");
    expect(watchPushState({ ...base, sessionStatus: "in_progress", sent: true })).toBe("sent_only");
    expect(watchPushState({ ...base, date: "2026-11-13" })).toBe("hidden");
    expect(watchPushState({ ...base, date: null })).toBe("hidden");
  });

  it("envoi coupé, permission absente, reconnexion : renvoi vers Montres", () => {
    expect(watchPushState({ ...base, connection: { ...conn, pushWorkouts: false } })).toBe("off");
    expect(watchPushState({ ...base, connection: { ...conn, grantedScopes: ["ACTIVITY_EXPORT"] } })).toBe("no_permission");
    expect(watchPushState({ ...base, connection: { ...conn, status: "needs_reauth" } })).toBe("reauth");
  });

  it("permissions inconnues (liste vide) : on laisse essayer", () => {
    expect(watchPushState({ ...base, connection: { ...conn, grantedScopes: [] } })).toBe("ready");
  });
});
