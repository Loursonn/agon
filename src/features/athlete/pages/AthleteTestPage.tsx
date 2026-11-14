import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AthletePageHeader } from "@/features/athlete/components/AthletePageHeader";
import { useAthleteContext } from '@/features/shared/context/AthleteContext';
import { useAthleteTestResults } from '@/features/shared/hooks/tests/useAthleteTests';
import { ListSkeleton, CardSkeleton } from '@/features/shared/components/skeletons';
import { EmptyState } from '@/features/shared/components/EmptyState';
import { FlaskConical } from 'lucide-react';
import { MensurationsDrawer } from '@/features/athlete/components/MensurationsDrawer';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AthleteTestResult } from '@/features/shared/types/tests';
import { C } from "@/lib/theme";
import { TEST_GROUP_COLOR, TEST_GROUP_LABEL, buildTestValueCards, groupTestCards, testGroupOf } from '@/lib/athleteTestValues';
import { TestGroupIcon } from "@/features/athlete/components/tests/TestGroupIcon";
import { RULER_PATH } from "@/features/athlete/components/tests/testGroupPaths";
import type { ReactNode } from 'react';
import { TestValueTile } from '@/features/athlete/components/tests/TestValueTile';
import { TestDetailView } from '@/features/athlete/components/tests/TestDetailView';
import { useIsDesktop } from '@/hooks/useIsDesktop';

/** Titre numéroté de la planche : « 01 — Mes valeurs » + filet. */
function SectionTitle({ n, children }: { n: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <h2 className="agon-mono m-0 flex h-5 items-center whitespace-nowrap text-[11px] font-normal uppercase tracking-[0.12em] text-agon-tx2">
        <span className="text-agon-accent">{n} —</span>&nbsp;{children}
      </h2>
      <div className="h-px bg-agon-brd" />
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
    <div className="flex gap-3">
      <div className="flex w-8 flex-none flex-col items-center">
        <TestGroupIcon group={group} color={color} testName={name} size={32} />
        {!last && <span className="mt-1 w-0.5 flex-1" style={{ background: color + '59' }} />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 pb-[18px]">
        <div className="flex min-h-8 items-center gap-2.5">
          <span className="min-w-0 truncate text-[15px] font-medium">{name}</span>
          <span className="flex-1" />
          <span className="agon-mono whitespace-nowrap text-[11px] text-agon-tx3">{format(new Date(result.performed_at), 'd MMM yyyy', { locale: fr })}</span>
        </div>
        {values.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {values.map(v => {
              const num = Number(v.value);
              return (
                <span key={v.id} className="box-border inline-flex h-7 items-baseline gap-1.5 whitespace-nowrap rounded-[8px] px-2.5" style={{ background: color + '24', border: `1px solid ${color}66` }}>
                  <span className="text-[11px] text-agon-tx2">{v.test_variables?.label ?? '—'}</span>
                  <span className="agon-mono text-[12px] leading-[28px]" style={{ color }}>
                    {Number.isFinite(num) ? (Math.round(num * 10) / 10).toLocaleString('fr-FR') : '—'} {v.test_variables?.unit ?? ''}
                  </span>
                </span>
              );
            })}
          </div>
        )}
        {result.notes && <p className="m-0 text-[12px] italic leading-normal text-agon-tx2">« {result.notes} »</p>}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** Tests de l'athlète : téléphone = une colonne ; PC = valeurs à gauche, historique à droite. */
export default function AthleteTestPage() {
  const { athleteId, viewOnly } = useAthleteContext();
  const isDesktop = useIsDesktop();
  const [mensuOpen, setMensuOpen] = useState(false);

  const { data: results = [], isLoading: loadingResults } = useAthleteTestResults(athleteId);
  const groups = useMemo(() => groupTestCards(buildTestValueCards(results)), [results]);
  // « Voir le détail du test » après une saisie : /athlete/test?valeur=<variable>.
  const [params, setParams] = useSearchParams();
  const [openVar, setOpenVarState] = useState<string | null>(() => params.get('valeur'));
  const setOpenVar = (id: string | null) => {
    setOpenVarState(id);
    if (!id && params.has('valeur')) { params.delete('valeur'); setParams(params, { replace: true }); }
  };
  const openCard = openVar ? groups.flatMap((g) => g.cards).find((c) => c.variableId === openVar) ?? null : null;
  // Ordinateur (planche AthOrdiBTests) : liste à gauche, détail à droite, toujours un test ouvert.
  const deskCard = isDesktop ? openCard ?? groups[0]?.cards[0] ?? null : null;

  if (openCard && !isDesktop) {
    return (
      <div className="mx-auto w-full max-w-[480px] px-agon-lg pb-[60px] pt-5 font-ui text-agon-tx lg:max-w-[760px] lg:pt-agon-xl">
        <TestDetailView card={openCard} color={TEST_GROUP_COLOR[openCard.group]} onBack={() => setOpenVar(null)} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[480px] font-ui text-agon-tx lg:max-w-none">
      <AthletePageHeader title="Tests" />
      <div className="px-5 pb-[60px] pt-6 lg:px-agon-2xl lg:pt-agon-xl">
      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-agon-2xl">
        <div>
          {/* Test permanent : Mensurations / Photos */}
          <button
            type="button"
            onClick={() => setMensuOpen(true)}
            className="mb-8 flex w-full cursor-pointer items-center gap-3.5 rounded-[14px] px-4 py-3.5 text-left font-[inherit] text-agon-tx"
            style={{ background: `linear-gradient(160deg, ${C.g}29, ${C.g}0F), ${C.s1}`, border: `1px solid ${C.g}73` }}
          >
            <span aria-hidden className="flex size-10 flex-none items-center justify-center rounded-[10px] bg-agon-succes">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="1.8" strokeLinecap="square">{RULER_PATH}</svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="agon-display block whitespace-nowrap text-[12px] tracking-[0.06em]">Mensurations / photos</span>
              <span className="mt-[3px] block text-[12px] leading-[1.45] text-agon-tx2">Saisir tes mensurations &amp; photos, ou consulter ton historique</span>
            </span>
            <svg aria-hidden width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={C.tx3} strokeWidth="1.5" strokeLinecap="square" className="flex-none"><path d="M9 5L16 12L9 19" /></svg>
          </button>

          {/* Valeurs courantes */}
          <section className="mb-8 lg:mb-0">
            <SectionTitle n="01">Mes valeurs</SectionTitle>
            <p className="mb-3.5 mt-2.5 text-[12px] text-agon-tx3">{isDesktop ? 'Rangées par dominante. Clique une valeur pour voir son évolution.' : 'Rangées par dominante. Touche une valeur pour voir tous tes tests et leur évolution.'}</p>
            {loadingResults ? (
              <div className="flex gap-agon-md">{[0, 1, 2].map(i => <CardSkeleton key={i} />)}</div>
            ) : groups.length === 0 ? (
              <div className="py-agon-md text-agon-sm text-agon-tx3">Aucune valeur enregistrée pour le moment.</div>
            ) : (
              <div className="flex flex-col gap-5">
                {groups.map(g => (
                  <div key={g.group} className="flex flex-col gap-2.5">
                    <div className="flex items-center gap-[9px]">
                      <span aria-hidden className="h-4 w-1 rounded-[2px]" style={{ background: TEST_GROUP_COLOR[g.group] }} />
                      <span className="agon-display text-[13px] tracking-[0.06em] text-agon-tx">{TEST_GROUP_LABEL[g.group]}</span>
                      <span className="agon-mono text-[11px] text-agon-tx3">{g.cards.length} test{g.cards.length > 1 ? 's' : ''}</span>
                    </div>
                    {isDesktop ? (
                      <div className="flex flex-col gap-1.5">
                        {g.cards.map(c => (
                          <TestValueTile key={c.variableId} variant="row" selected={deskCard?.variableId === c.variableId} card={c} color={TEST_GROUP_COLOR[g.group]} onOpen={() => setOpenVar(c.variableId)} />
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        {g.cards.map(c => (
                          <TestValueTile key={c.variableId} card={c} color={TEST_GROUP_COLOR[g.group]} onOpen={() => setOpenVar(c.variableId)} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {deskCard && (
          <div className="sticky top-6">
            <TestDetailView key={deskCard.variableId} card={deskCard} color={TEST_GROUP_COLOR[deskCard.group]} />
          </div>
        )}

        {/* Historique (ordinateur : sous les deux colonnes) */}
        <section className={deskCard ? 'lg:col-span-2 lg:mt-agon-xl' : undefined}>
          <div className="mb-3.5"><SectionTitle n="02">Historique — {results.length}</SectionTitle></div>
          {loadingResults ? (
            <ListSkeleton rows={3} />
          ) : results.length === 0 ? (
            <EmptyState icon={FlaskConical} title="Aucun test enregistré" description="Ton coach ajoutera tes résultats après chaque test." />
          ) : (
            <div className="flex flex-col">
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
