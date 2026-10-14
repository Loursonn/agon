/**
 * PasswordInput — champ mot de passe avec bouton œil pour afficher / masquer.
 * `variant="shadcn"` réutilise <Input> (shadcn), sinon <input> natif stylé inline.
 */
import { useState } from "react";
import type { CSSProperties, InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  variant?: "native" | "shadcn";
  /** Couleur de l'icône (défaut : héritée, atténuée) */
  iconColor?: string;
}

export function PasswordInput({ variant = "native", iconColor, style, className, ...rest }: Props) {
  const [visible, setVisible] = useState(false);
  const type = visible ? "text" : "password";
  const inputStyle: CSSProperties = { ...style, paddingRight: 44 };

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {variant === "shadcn" ? (
        <Input {...rest} type={type} className={(className ?? "") + " pr-11"} style={style} />
      ) : (
        <input {...rest} type={type} className={className} style={inputStyle} />
      )}
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        aria-pressed={visible}
        style={{
          position: "absolute", top: 0, right: 0, bottom: 0, width: 44,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "transparent", border: "none", cursor: "pointer",
          color: iconColor ?? "currentColor", opacity: 0.7,
        }}
      >
        {visible ? <EyeOff size={17} /> : <Eye size={17} />}
      </button>
    </div>
  );
}
