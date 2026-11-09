import { useState } from 'react';
import { useAthleteContext } from '@/features/shared/context/AthleteContext';
import { useAthleteCurrentValues, useAthleteTestResults } from '@/features/shared/hooks/tests/useAthleteTests';
import { ListSkeleton, CardSkeleton } from '@/features/shared/components/skeletons';
import { EmptyState } from '@/features/shared/components/EmptyState';
import { FlaskConical, Trophy, Ruler, ChevronRight } from 'lucide-react';
import { MensurationsDrawer } from '@/features/athlete/components/MensurationsDrawer';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AthleteCurrentValue, AthleteTestResult } from '@/features/shared/types/tests';

const SECTION_TITLE = 'text-agon-xs font-bold uppercase tracking-wider text-agon-tx3';

// ── Valeur courante ───────────────────────────────────────────────────────────

function ValueChip({ cv }: { cv: AthleteCurrentValue }) {
  return (
    <div className="rounded-md border border-agon-brd bg-agon-s1 px-agon-md py-agon-md text-center">
      <div className="mb-agon-xs text-agon-xs font-semibold uppercase tracking-wide text-agon-tx3">{cv.label}</div>
      <div className="font-data text-agon-2xl font-extrabold leading-tight text-agon-accent">
        {cv.current_value % 1 === 0 ? cv.current_value : Number(cv.current_value).toFixed(1)}
      </div>
      <div className="mt-agon-2xs text-agon-xs text-agon-tx3">{cv.unit}</div>
      <div className="mt-agon-xs text-agon-xs text-agon-tx3">
        {format(new Date(cv.best_performed_at), 'd MMM yyyy', { locale: fr })}
      </div>
    </div>
  );
}

// ── Résultat (lecture seule) ──────────────────────────────────────────────────

function ResultRow({ result }: { result: AthleteTestResult }) {
  const values = result.athlete_test_values ?? [];
  return (
    <div className="rounded-lg border border-agon-brd bg-agon-s1 px-agon-lg py-agon-md">
      <div className={values.length ? 'mb-agon-md flex flex-wrap items-center gap-agon-sm' : 'flex flex-wrap items-center gap-agon-sm'}>
        <FlaskConical size={13} className="text-agon-accent" />
        <span className="text-agon-base font-bold text-agon-tx">{result.test_definitions?.name ?? 'Test'}</span>
        <span className="text-agon-xs text-agon-tx3">· {format(new Date(result.performed_at), 'd MMM yyyy', { locale: fr })}</span>
      </div>
      {values.length > 0 && (
        <div className="flex flex-wrap gap-agon-sm">
          {values.map(v => {
            const num = Number(v.value);
            return (
              <div key={v.id} className="rounded-md border border-agon-accent/15 bg-agon-accent/10 px-agon-md py-agon-xs">
                <span className="text-agon-xs text-agon-tx3">{v.test_variables?.label ?? '—'} </span>
                <span className="text-agon-sm font-bold text-agon-accent">
                  {num % 1 === 0 ? num : num.toFixed(1)} {v.test_variables?.unit ?? ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {result.notes && <p className="mt-agon-sm text-agon-xs italic leading-normal text-agon-tx3">"{result.notes}"</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** Tests de l'athlète : téléphone = une colonne ; PC = valeurs à gauche, historique à droite. */
export default function AthleteTestPage() {
  const { athleteId, viewOnly } = useAthleteContext();
  const [mensuOpen, setMensuOpen] = useState(false);

  const { data: currentValues = [], isLoading: loadingCurrent } = useAthleteCurrentValues(athleteId);
  const { data: results = [], isLoading: loadingResults } = useAthleteTestResults(athleteId);

  return (
    <div className="mx-auto w-full max-w-[480px] px-agon-lg pb-[60px] pt-5 font-ui text-agon-tx lg:max-w-none lg:px-agon-2xl lg:pt-agon-xl">
      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-agon-2xl">
        <div>
          {/* Test permanent : Mensurations / Photos */}
          <button
            type="button"
            onClick={() => setMensuOpen(true)}
            className="mb-7 flex w-full items-center gap-agon-md rounded-lg border border-agon-brd bg-agon-s1 px-agon-lg py-agon-md text-left"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-agon-succes-doux">
              <Ruler size={20} className="text-agon-succes" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-agon-base font-bold">MENSURATIONS / PHOTOS</div>
              <div className="mt-agon-2xs text-agon-xs text-agon-tx3">Saisir tes mensurations &amp; photos, ou consulter ton historique</div>
            </div>
            <ChevronRight size={18} className="shrink-0 text-agon-tx3" />
          </button>

          {/* Valeurs courantes */}
          <section className="mb-7 lg:mb-0">
            <div className="mb-agon-md flex items-center gap-[7px]">
              <Trophy size={14} className="text-agon-accent" />
              <h2 className={SECTION_TITLE}>Mes valeurs</h2>
            </div>
            {loadingCurrent ? (
              <div className="flex gap-agon-md">{[0, 1, 2].map(i => <CardSkeleton key={i} />)}</div>
            ) : currentValues.length === 0 ? (
              <div className="py-agon-md text-agon-sm text-agon-tx3">Aucune valeur enregistrée pour le moment.</div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-agon-md">
                {currentValues.map(cv => <ValueChip key={cv.variable_id} cv={cv} />)}
              </div>
            )}
          </section>
        </div>

        {/* Historique */}
        <section>
          <h2 className={SECTION_TITLE + ' mb-agon-md'}>Historique — {results.length}</h2>
          {loadingResults ? (
            <ListSkeleton rows={3} />
          ) : results.length === 0 ? (
            <EmptyState icon={FlaskConical} title="Aucun test enregistré" description="Ton coach ajoutera tes résultats après chaque test." />
          ) : (
            <div className="flex flex-col gap-agon-md">
              {results.map(r => <ResultRow key={r.id} result={r} />)}
            </div>
          )}
        </section>
      </div>

      {mensuOpen && <MensurationsDrawer athleteId={athleteId} viewOnly={viewOnly} onClose={() => setMensuOpen(false)} />}
    </div>
  );
}
