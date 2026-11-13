// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { MyStaffAthlete } from "../../hooks/useMyStaffLinks";
import { STAFF_DOMAINS, type StaffPermissions } from "../../lib/staffPermissions";

/** Accueil staff rendu sur données simulées (pas de compte staff de démo). */
let links: { data: MyStaffAthlete[]; isLoading: boolean } = { data: [], isLoading: false };

vi.mock("../../hooks/useMyStaffLinks", () => ({ useMyStaffLinks: () => links }));
vi.mock("@/hooks/useIsDesktop", () => ({ useIsDesktop: () => true }));
vi.mock("@/features/shared/hooks/useMedicalEntries", () => ({
  useActiveInjuries: (id: string | undefined) => ({
    injuries: id === "lea" ? [{ id: "i1", zone: "Genou droit", title: "Tendinopathie", notes: null, date: "2026-11-10" }] : [],
    isLoading: false,
  }),
}));
vi.mock("@/features/shared/hooks/useWellness", () => ({ useWellnessHistory: (id: string | undefined) => ({ data: id ? {} : undefined }) }));
vi.mock("../../lib/wellnessWatch", () => ({
  wellnessDrop: () => ({ item: "sleep", label: "Sommeil", value: 2, day: "2026-11-12" }),
}));

const { default: StaffHomePage } = await import("../StaffHomePage");

const perms = (over: Partial<StaffPermissions>): StaffPermissions =>
  ({ ...Object.fromEntries(STAFF_DOMAINS.map((d) => [d, "none"])), ...over }) as StaffPermissions;

const athlete = (over: Partial<MyStaffAthlete>): MyStaffAthlete => ({
  linkId: "l-" + (over.athleteId ?? "x"), athleteId: "x", athleteName: "X", athleteFirstName: null,
  coachId: "c", coachName: "Agon Démo", profession: "kine", permissions: perms({}),
  canEditCoachContent: false, sharingConsent: true, createdAt: "2026-11-01T00:00:00Z", ...over,
});

const renderPage = () => render(<MemoryRouter><StaffHomePage /></MemoryRouter>);

describe("StaffHomePage", () => {
  it("liste les athlètes, droits, accord en attente et À surveiller", () => {
    links = {
      isLoading: false,
      data: [
        athlete({ athleteId: "lea", athleteName: "Léa Démo", permissions: perms({ medical: "write", wellness: "read", seances: "read" }) }),
        athlete({ athleteId: "tom", athleteName: "Tom Démo", sharingConsent: false }),
      ],
    };
    renderPage();
    expect(screen.getByText("Mes athlètes")).toBeTruthy();
    expect(screen.getByText("2 athlètes · 1 coach")).toBeTruthy();
    expect(screen.getAllByText(/Coach principal : Agon Démo · en tant que kiné/)).toHaveLength(2);
    expect(screen.getByText("Écriture")).toBeTruthy();
    expect(screen.getByText("Lecture")).toBeTruthy();
    expect(screen.getByText(/En attente de l’accord de l’athlète/)).toBeTruthy();
    expect(screen.getByText("1 blessure en cours")).toBeTruthy();
    expect(screen.getByText("Léa Démo · Genou droit")).toBeTruthy();
    expect(screen.getByText("Léa Démo · wellness en baisse")).toBeTruthy();
    // Sans accord : ni blessure ni wellness de Tom.
    expect(screen.queryByText(/Tom Démo · /)).toBeNull();
  });

  it("sans athlète : message d'attente d'invitation", () => {
    links = { isLoading: false, data: [] };
    renderPage();
    expect(screen.getByText(/Aucun athlète pour l’instant/)).toBeTruthy();
  });
});
