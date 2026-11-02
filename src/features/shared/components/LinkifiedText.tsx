import { linkify } from "@/lib/linkify";

/** Texte dont les URL sont cliquables (nouvel onglet). */
export function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {linkify(text).map((p, i) =>
        p.type === "text" ? (
          <span key={i}>{p.text}</span>
        ) : (
          <a
            key={i}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="underline break-all"
            style={{ color: "inherit" }}
          >
            {p.text}
          </a>
        ),
      )}
    </>
  );
}
