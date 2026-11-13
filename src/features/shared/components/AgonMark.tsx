/** Symbole Agon (monogramme or dans son cercle). Remplace les simples ronds des maquettes. */
export function AgonMark({ size = 24 }: { size?: number }) {
  return (
    <img
      src="/brand/agon-symbole-or.svg"
      alt=""
      aria-hidden
      width={size}
      height={size}
      style={{ width: size, height: size, flex: "none", display: "block" }}
    />
  );
}
