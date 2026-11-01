import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AI_CONSENT_SINCE, CORE_CONSENT_SINCE, LEGAL_VERSION } from "@/lib/legal";
import { AI_ASSISTANT_SINCE } from "@shared/coachApiOps.ts";
import { hasDecidedSince, type ConsentState } from "@/features/shared/hooks/useConsent";

// Pas de réseau : l'auth et la lecture des accords sont remplacées par des
// valeurs fixes ; les fonctions pures (hasDecided, hasValidCoreConsent…) restent les vraies.
const auth = { profile: { role: "athlete" } as { role: string }, logout: vi.fn() };
let consents: ConsentState[] = [];
const mutation = { mutateAsync: vi.fn(), isPending: false };

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => auth }));
vi.mock("@/features/shared/hooks/useConsent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/features/shared/hooks/useConsent")>()),
  useConsents: () => ({ data: consents, isLoading: false, isError: false, error: null, refetch: vi.fn() }),
  useSetConsent: () => mutation,
}));

import ConsentGate from "../ConsentGate";

const decision = (purpose: ConsentState["purpose"], granted: boolean, docVersion: string): ConsentState => ({
  purpose,
  granted,
  docVersion,
  decidedAt: "2026-10-31T10:00:00Z",
});
const core = decision("health_data", true, CORE_CONSENT_SINCE);
const staff = decision("staff_sharing", false, LEGAL_VERSION);

function renderGate() {
  return render(
    <MemoryRouter>
      <ConsentGate>
        <div>APP</div>
      </ConsentGate>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.profile = { role: "athlete" };
  mutation.mutateAsync.mockReset();
});

describe("ConsentGate · accord IA", () => {
  it("athlète qui n'a jamais répondu : écran IA, l'app est masquée", () => {
    consents = [core, staff];
    renderGate();
    expect(screen.getByText("L'IA dans ton suivi")).toBeInTheDocument();
    expect(screen.queryByText("APP")).not.toBeInTheDocument();
    expect(screen.getByText("ACCORD FACULTATIF")).toBeInTheDocument();
  });

  it("athlète qui a répondu sous l'ancien texte (Gemini seul) : écran IA, présenté comme une mise à jour", () => {
    consents = [core, staff, decision("ai_programming", true, "2026-10-27")];
    renderGate();
    expect(screen.getByText("L'IA dans ton suivi")).toBeInTheDocument();
    expect(screen.getByText("TEXTE MIS À JOUR")).toBeInTheDocument();
    expect(screen.queryByText("APP")).not.toBeInTheDocument();
  });

  it("athlète qui a répondu sous le texte du 30/10 : pas d'écran, oui comme non", () => {
    for (const granted of [true, false]) {
      consents = [core, staff, decision("ai_programming", granted, AI_CONSENT_SINCE)];
      const { unmount } = renderGate();
      expect(screen.getByText("APP")).toBeInTheDocument();
      expect(screen.queryByText("L'IA dans ton suivi")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("coach_athlete est concerné, coach et staff ne le sont pas", () => {
    consents = [core, staff];
    auth.profile = { role: "coach_athlete" };
    const a = renderGate();
    expect(screen.getByText("L'IA dans ton suivi")).toBeInTheDocument();
    a.unmount();

    for (const role of ["coach", "staff"]) {
      auth.profile = { role };
      const { unmount } = renderGate();
      expect(screen.getByText("APP")).toBeInTheDocument();
      unmount();
    }
  });

  it("le texte affiché est CONSENT_COPY.ai_programming, sans reformulation", async () => {
    consents = [core, staff];
    renderGate();
    const { CONSENT_COPY } = await import("@/features/shared/hooks/useConsent");
    expect(screen.getByText(CONSENT_COPY.ai_programming.label)).toBeInTheDocument();
    expect(screen.getByText(CONSENT_COPY.ai_programming.detail)).toBeInTheDocument();
  });

  it("Oui et Non ont le même style, et chacun enregistre la réponse", () => {
    consents = [core, staff];
    renderGate();
    const refuse = screen.getByRole("button", { name: "Je refuse" });
    const accept = screen.getByRole("button", { name: "J'accepte" });
    expect(refuse.getAttribute("style")).toBe(accept.getAttribute("style"));

    fireEvent.click(refuse);
    expect(mutation.mutateAsync).toHaveBeenLastCalledWith([{ purpose: "ai_programming", granted: false }]);
    fireEvent.click(accept);
    expect(mutation.mutateAsync).toHaveBeenLastCalledWith([{ purpose: "ai_programming", granted: true }]);
  });

  it("un refus enregistré n'empêche pas d'entrer dans l'app", () => {
    // État relu après un clic sur « Je refuse » : un INSERT sous LEGAL_VERSION.
    consents = [core, staff, decision("ai_programming", false, LEGAL_VERSION)];
    renderGate();
    expect(screen.getByText("APP")).toBeInTheDocument();
  });

  it("IA et staff manquants : l'IA d'abord, puis le staff", () => {
    consents = [core];
    const a = renderGate();
    expect(screen.getByText("L'IA dans ton suivi")).toBeInTheDocument();
    a.unmount();

    consents = [core, decision("ai_programming", false, LEGAL_VERSION)];
    renderGate();
    expect(screen.getByText("Ton staff dans Agon")).toBeInTheDocument();
  });
});

describe("version minimale de l'accord IA", () => {
  it("est la même côté app et côté API coach, et le texte en vigueur l'atteint", () => {
    expect(AI_CONSENT_SINCE).toBe(AI_ASSISTANT_SINCE);
    // Sinon une réponse enregistrée aujourd'hui serait déjà trop ancienne et
    // l'écran reviendrait à chaque connexion.
    expect(LEGAL_VERSION >= AI_CONSENT_SINCE).toBe(true);
  });

  it("hasDecidedSince ignore les réponses antérieures", () => {
    const list = [decision("ai_programming", true, "2026-10-27")];
    expect(hasDecidedSince(list, "ai_programming", AI_CONSENT_SINCE)).toBe(false);
    expect(hasDecidedSince([decision("ai_programming", false, "2026-10-30")], "ai_programming", AI_CONSENT_SINCE)).toBe(true);
    expect(hasDecidedSince(undefined, "ai_programming", AI_CONSENT_SINCE)).toBe(false);
  });
});
