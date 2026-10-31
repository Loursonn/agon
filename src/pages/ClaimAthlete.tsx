import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { errorMessage } from "@/lib/errors";
import { LEGAL_ROUTES } from "@/lib/legal";
import { useClaimInfo } from "@/features/shared/hooks/useAthleteClaimLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

/**
 * Première connexion d'un athlète dont le coach a déjà préparé le compte.
 * Prénom, nom et code coach sont déjà connus : il ne choisit que son email et
 * son mot de passe. Le consentement RGPD est recueilli par ConsentGate à la
 * première connexion, comme pour toute inscription.
 */
export default function ClaimAthlete() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { data: info, isLoading } = useClaimInfo(token);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (password !== form.get("confirm")) {
      setError("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("claim-athlete", {
        body: { token, email, password },
      });
      if (fnError || data?.error) throw new Error(data?.error ?? "Activation impossible");
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw new Error(signInError.message);
      navigate("/");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">Agon</h1>
          <p className="mt-1 text-sm text-zinc-400">Ton coach t'a préparé ton espace</p>
        </div>

        <Card className="border-zinc-800 bg-zinc-900">
          {isLoading ? (
            <CardContent className="py-8 text-center text-sm text-zinc-400">Chargement…</CardContent>
          ) : !info ? (
            <>
              <CardHeader>
                <CardTitle className="text-white">Lien invalide</CardTitle>
                <CardDescription>
                  Ce lien est incorrect ou a déjà été utilisé. Si tu as déjà activé ton compte,{" "}
                  <Link to="/login" className="underline">connecte-toi</Link> ; sinon demande un nouveau lien à ton coach.
                </CardDescription>
              </CardHeader>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle className="text-white">Activer mon compte</CardTitle>
                <CardDescription>
                  Choisis ton email et ton mot de passe pour accéder à ton programme.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="firstName">Prénom</Label>
                      <Input id="firstName" value={info.first_name ?? ""} readOnly />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="lastName">Nom</Label>
                      <Input id="lastName" value={info.last_name ?? ""} readOnly />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="coachCode">Code coach</Label>
                    <Input id="coachCode" value={info.coach_code ?? ""} readOnly />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" name="email" type="email" required placeholder="athlete@example.com" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="password">Mot de passe</Label>
                    <PasswordInput variant="shadcn" id="password" name="password" required placeholder="••••••••" minLength={8} />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                    <PasswordInput variant="shadcn" id="confirm" name="confirm" required placeholder="••••••••" minLength={8} />
                  </div>
                  <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-400">
                    <input
                      type="checkbox"
                      checked={acceptTerms}
                      onChange={(e) => setAcceptTerms(e.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      J'ai lu et j'accepte les{" "}
                      <Link to={LEGAL_ROUTES.terms} target="_blank" className="underline">CGU</Link> et la{" "}
                      <Link to={LEGAL_ROUTES.privacy} target="_blank" className="underline">politique de confidentialité</Link>.
                    </span>
                  </label>
                  {error && <p className="text-sm text-red-400">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading || !acceptTerms}>
                    {loading ? "Activation…" : "Activer mon compte"}
                  </Button>
                </form>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
