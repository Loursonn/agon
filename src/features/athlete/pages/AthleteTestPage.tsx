import { useState } from 'react';
import { useAthleteContext } from '@/features/shared/context/AthleteContext';
import { useAthleteCurrentValues, useAthleteTestResults } from '@/features/shared/hooks/tests/useAthleteTests';
import { C } from '@/lib/theme';
import { ListSkeleton, CardSkeleton } from '@/features/shared/components/skeletons';
import { EmptyState } from '@/features/shared/components/EmptyState';
import { FlaskConical, Trophy, Ruler, ChevronRight } from 'lucide-react';
import { MensurationsDrawer } from '@/features/athlete/components/MensurationsDrawer';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { AthleteCurrentValue, AthleteTestResult } from '@/features/shared/types/tests';

// ── Valeur courante ───────────────────────────────────────────────────────────

function ValueChip({ cv }: { cv: AthleteCurrentValue }) {
  return (
    <div style={{
      background: C.s1, borderRadius: 4, border: '1px solid ' + C.brd,
      padding: '10px 14px', minWidth: 90, flexShrink: 0, textAlign: 'center',
    }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: C.tx3, textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 4 }}>
        {cv.label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.ac, lineHeight: 1.1 }}>
        {cv.current_value % 1 === 0 ? cv.current_value : Number(cv.current_value).toFixed(1)}
      </div>
      <div style={{ fontSize: 11, color: C.tx3, marginTop: 1 }}>{cv.unit}</div>
      <div style={{ fontSize: 10, color: C.tx3, marginTop: 4 }}>
        {format(new Date(cv.best_performed_at), 'd MMM yyyy', { locale: fr })}
      </div>
    </div>
  );
}

// ── Résultat (lecture seule) ──────────────────────────────────────────────────

function ResultRow({ result }: { result: AthleteTestResult }) {
  const values = result.athlete_test_values ?? [];
  return (
    <div style={{
      background: C.s1, borderRadius: 6, border: '1px solid ' + C.brd, padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: values.length ? 10 : 0 }}>
        <FlaskConical size={13} color={C.ac} />
        <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>
          {result.test_definitions?.name ?? 'Test'}
        </span>
        <span style={{ fontSize: 11, color: C.tx3 }}>
          · {format(new Date(result.performed_at), 'd MMM yyyy', { locale: fr })}
        </span>
      </div>
      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {values.map(v => {
            const num = Number(v.value);
            return (
              <div key={v.id} style={{
                padding: '4px 10px', borderRadius: 7,
                background: 'rgba(255,201,51,0.08)', border: '1px solid rgba(255,201,51,0.15)',
              }}>
                <span style={{ fontSize: 11, color: C.tx3 }}>{v.test_variables?.label ?? '—'} </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.ac }}>
                  {num % 1 === 0 ? num : num.toFixed(1)} {v.test_variables?.unit ?? ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
      {result.notes && (
        <p style={{ fontSize: 11, color: C.tx3, marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
          "{result.notes}"
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AthleteTestPage() {
  const { athleteId, viewOnly } = useAthleteContext();
  const [mensuOpen, setMensuOpen] = useState(false);

  const { data: currentValues = [], isLoading: loadingCurrent } = useAthleteCurrentValues(athleteId);
  const { data: results = [], isLoading: loadingResults } = useAthleteTestResults(athleteId);

  return (
    <div style={{ padding: '20px 16px 60px', maxWidth: 480, margin: '0 auto' }}>

      {/* Test permanent : Mensurations / Photos */}
      <button
        onClick={() => setMensuOpen(true)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 12,
          background: C.s1, borderRadius: 6, border: '1px solid ' + C.brd,
          padding: '14px 16px', cursor: 'pointer', fontFamily: 'inherit',
          marginBottom: 28, textAlign: 'left',
        }}
      >
        <div style={{ width: 40, height: 40, borderRadius: 4, flexShrink: 0, background: C.gS, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ruler size={20} color={C.g} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.tx }}>MENSURATIONS / PHOTOS</div>
          <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
            Saisir tes mensurations &amp; photos, ou consulter ton historique
          </div>
        </div>
        <ChevronRight size={18} color={C.tx3} />
      </button>

      {/* Valeurs courantes */}
      <section style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 12 }}>
          <Trophy size={14} color={C.ac} />
          <span style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: 'uppercase', letterSpacing: '0.6px' }}>
            Mes valeurs
          </span>
        </div>
        {loadingCurrent ? (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto' }}>
            {[0, 1, 2].map(i => <CardSkeleton key={i} />)}
          </div>
        ) : currentValues.length === 0 ? (
          <div style={{ fontSize: 12, color: C.tx3, padding: '12px 0' }}>
            Aucune valeur enregistrée pour le moment.
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {currentValues.map(cv => <ValueChip key={cv.variable_id} cv={cv} />)}
          </div>
        )}
      </section>

      {/* Historique */}
      <section>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.tx3, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12 }}>
          Historique — {results.length}
        </div>
        {loadingResults ? (
          <ListSkeleton rows={3} />
        ) : results.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="Aucun test enregistré"
            description="Ton coach ajoutera tes résultats après chaque test."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {results.map(r => <ResultRow key={r.id} result={r} />)}
          </div>
        )}
      </section>

      {mensuOpen && (
        <MensurationsDrawer
          athleteId={athleteId}
          viewOnly={viewOnly}
          onClose={() => setMensuOpen(false)}
        />
      )}
    </div>
  );
}
