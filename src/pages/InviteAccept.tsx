import { useState } from "react";
import { errorMessage } from "@/lib/errors";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function InviteAccept() {
  const { token } = useParams<{ token: string }>();
  const { registerAthlete } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;

    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas");
      setLoading(false);
      return;
    }

    try {
      await registerAthlete(
        form.get("email") as string,
        password,
        form.get("fullName") as string,
        token!
      );
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
          <p className="mt-1 text-sm text-zinc-400">Votre coach vous a invité</p>
        </div>

        <Card className="border-zinc-800 bg-zinc-900">
          <CardHeader>
            <CardTitle className="text-white">Créer votre compte athlète</CardTitle>
            <CardDescription>Remplissez vos informations pour rejoindre votre coach</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="fullName">Nom complet</Label>
                <Input id="fullName" name="fullName" required placeholder="Prénom Nom" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required placeholder="athlete@example.com" />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Mot de passe</Label>
                <PasswordInput variant="shadcn" id="password" name="password" required placeholder="••••••••" minLength={6} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="confirm">Confirmer le mot de passe</Label>
                <PasswordInput variant="shadcn" id="confirm" name="confirm" required placeholder="••••••••" minLength={6} />
              </div>
              {error && <p className="text-sm text-red-400">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Création..." : "Rejoindre mon coach"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
