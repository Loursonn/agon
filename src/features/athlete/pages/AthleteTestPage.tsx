import { useMemo, useState } from 'react';
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { headerGlow } from "@/features/athlete/components/headerGlow";
import { useAthleteContext } from '@/features/shared/context/AthleteContext';
import { useAthleteTestResults } from '@/features/shared/hooks/tests/useAthleteTests';
import { ListSkeleton, CardSkeleton } from '@/features/shared/components/skeletons';
import { EmptyState } from '@/features/shared/components/EmptyState';
import { FlaskConical } from 'lucide-react';
import { MensurationsDrawer } from '@/features/athlete/components/MensurationsDrawer';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AthleteTestResult } from '@/features/shared/types/tests';
import { C } from '@/lib/theme';
import { DISPLAY, MONO } from '@/features/shared/components/seance/seanceUi';
import { TEST_GROUP_COLOR, TEST_GROUP_LABEL, buildTestValueCards, groupTestCards, testGroupOf } from '@/lib/athleteTestValues';
import { TestGroupIcon, RULER_PATH } from '@/features/athlete/components/tests/TestGroupIcon';
import type { ReactNode } from 'react';
import { TestValueTile } from '@/features/athlete/components/tests/TestValueTile';
import { TestDetailView } from '@/features/athlete/components/tests/TestDetailView';

/** Titre numéroté de la planche : « 01 — Mes valeurs » + filet. */
function SectionTitle({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, height: 20, display: 'flex', alignItems: 'center', ...MONO, fontWeight: 400, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.tx2, whiteSpace: 'nowrap' }}>
        <span style={{ color: C.ac }}>{n} —</span>&nbsp;{children}
      </h2>
      <div style={{ height: 1, background: C.brd }} />
    </div>
  );
}

// ── Résultat (lecture seule) ──────────────────────────────────────────────────

function ResultRow({ result, last }: { result: AthleteTestResult; last: boolean }) {
  const values = result.athlete_test_values ?? [];
  const group = testGroupOf(result.test_definitions);
  const color = TEST_GROUP_COLOR[group];
  const name = result.test_definitions?.name ?? 'Test';
  return (
    <div style={{ display: 'flex', gap: 12 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flex: 'none' }}>
        <TestGroupIcon group={group} color={color} testName={name} size={32} />
        {!last && <span style={{ flex: 1, width: 2, background: color + '59', marginTop: 4 }} />}
      </div>
      <div style={{ flex: 1, minWidth: 0, paddingBottom: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32 }}>
          <span style={{ fontSize: 15, fontWeight: 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          <span style={{ flex: 1 }} />
          <span style={{ ...MONO, fontSize: 11, color: C.tx3, whiteSpace: 'nowrap' }}>{format(new Date(result.performed_at), 'd MMM yyyy', { locale: fr })}</span>
        </div>
        {values.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {values.map(v => {
              const num = Number(v.value);
              return (
                <span key={v.id} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6, height: 28, padding: '0 10px', boxSizing: 'border-box', borderRadius: 8, background: color + '24', border: `1px solid ${color}66`, whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 11, color: C.tx2 }}>{v.test_variables?.label ?? '—'}</span>
                  <span style={{ ...MONO, fontSize: 12, color, lineHeight: '28px' }}>
                    {Number.isFinite(num) ? (Math.round(num * 10) / 10).toLocaleString('fr-FR') : '—'} {v.test_variables?.unit ?? ''}
                  </span>
                </span>
              );
            })}
          </div>
        )}
        {result.notes && <p style={{ margin: 0, fontSize: 12, color: C.tx2, fontStyle: 'italic', lineHeight: 1.5 }}>« {result.notes} »</p>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** Tests de l'athlète : téléphone = une colonne ; PC = valeurs à gauche, historique à droite. */
export default function AthleteTestPage() {
  const { athleteId, viewOnly } = useAthleteContext();
  const [mensuOpen, setMensuOpen] = useState(false);

  const { data: results = [], isLoading: loadingResults } = useAthleteTestResults(athleteId);
  const groups = useMemo(() => groupTestCards(buildTestValueCards(results)), [results]);
  const [openVar, setOpenVar] = useState<string | null>(null);
  const openCard = openVar ? groups.flatMap((g) => g.cards).find((c) => c.variableId === openVar) ?? null : null;

  if (openCard) {
    return (
      <div className="mx-auto w-full max-w-[480px] px-agon-lg pb-[60px] pt-5 font-ui text-agon-tx lg:max-w-[760px] lg:pt-agon-xl">
        <TestDetailView card={openCard} color={TEST_GROUP_COLOR[openCard.group]} onBack={() => setOpenVar(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[480px] font-ui text-agon-tx lg:max-w-none">
      <AthletePageHeader title="Tests" background={headerGlow("#F060C0", "#33B5FF")} />
      <div className="px-5 pb-[60px] pt-6 lg:px-agon-2xl lg:pt-agon-xl">
      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-agon-2xl">
        <div>
          {/* Test permanent : Mensurations / Photos */}
          <button
            type="button"
            onClick={() => setMensuOpen(true)}
            className="mb-8"
            style={{ width: '100%', textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', color: C.tx, background: `linear-gradient(160deg, ${C.g}29, ${C.g}0F), ${C.s1}`, border: `1px solid ${C.g}73`, borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14 }}
          >
            <span aria-hidden style={{ width: 40, height: 40, flex: 'none', borderRadius: 10, background: C.g, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0E0C0A" strokeWidth="1.8" strokeLinecap="square">{RULER_PATH}</svg>
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ ...DISPLAY, display: 'block', fontSize: 12, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Mensurations / photos</span>
              <span style={{ display: 'block', fontSize: 12, color: C.tx2, marginTop: 3, lineHeight: 1.45 }}>Saisir tes mensurations &amp; photos, ou consulter ton historique</span>
            </span>
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth="1.5" strokeLinecap="square" style={{ flex: 'none' }}><path d="M9 5L16 12L9 19" /></svg>
          </button>

          {/* Valeurs courantes */}
          <section className="mb-8 lg:mb-0">
            <SectionTitle n="01">Mes valeurs</SectionTitle>
            <p style={{ margin: '10px 0 14px', fontSize: 12, color: C.tx3 }}>Rangées par dominante. Touche une valeur pour voir tous tes tests et leur évolution.</p>
            {loadingResults ? (
              <div className="flex gap-agon-md">{[0, 1, 2].map(i => <CardSkeleton key={i} />)}</div>
            ) : groups.length === 0 ? (
              <div className="py-agon-md text-agon-sm text-agon-tx3">Aucune valeur enregistrée pour le moment.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {groups.map(g => (
                  <div key={g.group} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <span aria-hidden style={{ width: 4, height: 16, borderRadius: 2, background: TEST_GROUP_COLOR[g.group] }} />
                      <span style={{ ...DISPLAY, fontSize: 13, letterSpacing: '0.06em', color: C.tx }}>{TEST_GROUP_LABEL[g.group]}</span>
                      <span style={{ ...MONO, fontSize: 11, color: C.tx3 }}>{g.cards.length} test{g.cards.length > 1 ? 's' : ''}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 lg:grid-cols-[repeat(auto-fill,minmax(150px,1fr))]">
                      {g.cards.map(c => (
                        <TestValueTile key={c.variableId} card={c} color={TEST_GROUP_COLOR[g.group]} onOpen={() => setOpenVar(c.variableId)} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Historique */}
        <section>
          <div style={{ marginBottom: 14 }}><SectionTitle n="02">Historique — {results.length}</SectionTitle></div>
          {loadingResults ? (
            <ListSkeleton rows={3} />
          ) : results.length === 0 ? (
            <EmptyState icon={FlaskConical} title="Aucun test enregistré" description="Ton coach ajoutera tes résultats après chaque test." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {results.map((r, i) => <ResultRow key={r.id} result={r} last={i === results.length - 1} />)}
            </div>
          )}
        </section>
      </div>
      </div>

      {mensuOpen && <MensurationsDrawer athleteId={athleteId} viewOnly={viewOnly} onClose={() => setMensuOpen(false)} />}
    </div>
  );
}
