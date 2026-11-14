/** Titre de groupe de la banque du mois (Biométrie) : trait, libellé, compteur, filet. */
export function BankGroupTitle({ label, count }: { label: string; count?: number }) {
  return (
    <div className="mb-0.5 mt-1 flex items-center gap-[5px] text-[9px] font-extrabold uppercase tracking-[0.06em] text-agon-succes">
      <span className="h-0.5 w-2.5 flex-shrink-0 rounded-[1px] bg-agon-succes" />
      {label}
      {count != null && <span className="font-medium opacity-60">{count}</span>}
      <span className="h-px flex-1 bg-agon-brd" />
    </div>
  );
}
