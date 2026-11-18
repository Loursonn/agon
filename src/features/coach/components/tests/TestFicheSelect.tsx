import { FileText } from 'lucide-react';
import { C } from '@/lib/theme';
import { useAuth } from '@/hooks/useAuth';
import { useDocsBank } from '@/features/shared/hooks/fiches/useDocs';
import { useCoachTestFiches, useSetCoachTestFiche } from '@/features/shared/hooks/tests/useTestFiches';

/**
 * Fiche rattachée à un test de la banque (ou à la biométrie) : choisie parmi
 * les fiches « Test » du coach. Donnée à l'athlète dès que le test est planifié.
 */
export function TestFicheSelect({ testKey }: { testKey: string }) {
  const { user } = useAuth();
  const coachId = user?.id;
  const { data: families = [] } = useDocsBank(coachId);
  const { data: fiches = {} } = useCoachTestFiches(coachId);
  const setFiche = useSetCoachTestFiche(coachId);

  const current = fiches[testKey] ?? '';
  const options = families
    .map((f) => f.origin)
    .filter((d) => d.category === 'test' && (!d.archived_at || d.id === current));

  return (
    <label
      onClick={(e) => e.stopPropagation()}
      style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 12, color: C.tx2 }}
    >
      <FileText size={14} color={C.tx3} />
      <span style={{ whiteSpace: 'nowrap' }}>Fiche du test</span>
      <select
        value={current}
        disabled={setFiche.isPending}
        onChange={(e) => setFiche.mutate({ testKey, docId: e.target.value || null })}
        style={{
          flex: 1, minWidth: 0, padding: '6px 8px', borderRadius: 8, fontSize: 12,
          background: C.s2, color: C.tx, border: '1px solid ' + C.brdL,
        }}
      >
        <option value="">{options.length ? 'Aucune' : 'Aucune fiche « Test » dans ta banque'}</option>
        {options.map((d) => (
          <option key={d.id} value={d.id}>{d.title}</option>
        ))}
      </select>
    </label>
  );
}
