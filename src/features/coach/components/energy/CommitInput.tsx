/**
 * Champ texte validé à la sortie (ou Entrée) : la valeur n'est enregistrée que
 * si elle se lit. Sinon le champ garde le texte tapé et passe en rouge avec un
 * exemple, au lieu de revenir sans prévenir à l'ancienne valeur. Échap annule.
 *
 * Remplace les champs qui se reformataient à chaque frappe (taper « 4: »
 * devenait « 4:00 ») : on tape librement, on valide en sortant.
 */
import { useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface Props {
  /** Valeur affichée tant que le coach ne tape rien. Changer `key` pour la réinitialiser. */
  initial: string;
  parse: (s: string) => number | null;
  onCommit: (n: number) => void;
  label: string;
  /** Exemple de saisie montré quand le texte ne se lit pas (« 4'15 »). */
  example?: string;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
}

export function CommitInput({ initial, parse, onCommit, label, example, placeholder, className, style }: Props) {
  const [text, setText] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const commit = () => {
    if (text.trim() === initial.trim()) return setInvalid(false);
    const n = parse(text);
    if (n == null || !Number.isFinite(n) || n <= 0) return setInvalid(true);
    setInvalid(false);
    onCommit(n);
  };
  const hint = invalid ? `Saisie non reconnue${example ? `, exemple : ${example}` : ""}` : undefined;
  return (
    <input
      value={text}
      aria-label={label}
      aria-invalid={invalid || undefined}
      title={hint}
      placeholder={placeholder}
      onChange={(e) => { setText(e.target.value); if (invalid) setInvalid(false); }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setText(initial); setInvalid(false); }
      }}
      className={cn(className, invalid && "!border-agon-erreur")}
      style={style}
    />
  );
}
