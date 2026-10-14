import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Users, ShieldCheck, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { C } from '@/lib/theme';
import { EmptyState } from '@/features/shared/components/EmptyState';
import { ListSkeleton } from '@/features/shared/components/skeletons';
import { useCoachesList, useToggleCertifiedCoach } from '@/features/shared/hooks/useCoachesList';
import type { CoachRow } from '@/features/shared/hooks/useCoachesList';

// ── Badges ────────────────────────────────────────────────────────────────────

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
      background: color + '18', color, textTransform: 'uppercase', letterSpacing: '0.4px',
    }}>
      {label}
    </span>
  );
}

// ── Ligne coach ───────────────────────────────────────────────────────────────

function CoachRow({
  coach, isSelf, isAdmin, onToggle, toggling,
}: {
  coach: CoachRow;
  isSelf: boolean;
  isAdmin: boolean;
  onToggle: (targetId: string, certified: boolean) => void;
  toggling: boolean;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 18px', background: C.s1, borderRadius: 6,
      border: '1px solid ' + C.brd,
      opacity: toggling ? 0.6 : 1,
      transition: 'opacity 150ms ease-out',
    }}>
      {/* Avatar */}
      <div style={{
        width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
        background: isSelf ? 'rgba(255,201,51,0.15)' : 'rgba(231,211,168,0.15)',
        border: '1px solid ' + (isSelf ? C.ac + '40' : 'rgba(231,211,168,0.25)'),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 14, fontWeight: 700,
        color: isSelf ? C.ac : C.tx3,
      }}>
        {coach.full_name.charAt(0).toUpperCase()}
      </div>

      {/* Infos */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.tx }}>
            {coach.full_name}
          </span>
          {isSelf && <Badge label="Vous" color={C.ac} />}
          {coach.is_admin && <Badge label="Admin" color="#F5A623" />}
          {coach.is_certified_coach && <Badge label="Certifié" color={C.g} />}
        </div>
        <div style={{ fontSize: 11, color: C.tx3, marginTop: 2 }}>
          {coach.coach_code ?? '—'} · {coach.athlete_count} athlète{coach.athlete_count > 1 ? 's' : ''}
          {' · '}inscrit le {format(new Date(coach.created_at), 'd MMM yyyy', { locale: fr })}
        </div>
      </div>

      {/* Toggle certification — admin seulement, pas sur soi-même, pas révoquer admin */}
      {isAdmin && !isSelf && (
        coach.is_certified_coach ? (
          <button
            onClick={() => onToggle(coach.id, false)}
            disabled={toggling}
            title="Retirer la certification"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 4,
              border: '1px solid rgba(239,75,75,0.3)',
              background: 'rgba(239,75,75,0.08)',
              color: '#FF5A33', fontSize: 11, fontWeight: 600,
              cursor: toggling ? 'default' : 'pointer', fontFamily: 'inherit',
              transition: 'background 150ms ease-out',
              flexShrink: 0,
            }}
            onMouseEnter={e => { if (!toggling) (e.currentTarget as HTMLElement).style.background = 'rgba(239,75,75,0.16)'; }}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(239,75,75,0.08)'}
          >
            <ShieldOff size={13} />
            Retirer
          </button>
        ) : (
          <button
            onClick={() => onToggle(coach.id, true)}
            disabled={toggling}
            title="Certifier ce coach"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 4,
              border: '1px solid ' + C.g + '40',
              background: 'rgba(34,201,147,0.08)',
              color: C.g, fontSize: 11, fontWeight: 600,
              cursor: toggling ? 'default' : 'pointer', fontFamily: 'inherit',
              transition: 'background 150ms ease-out',
              flexShrink: 0,
            }}
            onMouseEnter={e => { if (!toggling) (e.currentTarget as HTMLElement).style.background = 'rgba(34,201,147,0.16)'; }}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'rgba(34,201,147,0.08)'}
          >
            <ShieldCheck size={13} />
            Certifier
          </button>
        )
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function CoachesListPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: coaches = [], isLoading } = useCoachesList();
  const toggleMut = useToggleCertifiedCoach();

  // Guard : accès réservé aux coachs certifiés
  useEffect(() => {
    if (profile && !profile.is_certified_coach) {
      toast.error('Accès réservé aux coachs certifiés');
      navigate('/coach', { replace: true });
    }
  }, [profile, navigate]);

  if (!profile?.is_certified_coach) return null;

  const isSelf = (id: string) => id === profile.id;
  const certified = coaches.filter(c => c.is_certified_coach);
  const nonCertified = coaches.filter(c => !c.is_certified_coach);

  function handleToggle(targetId: string, certified: boolean) {
    toggleMut.mutate({ targetId, certified });
  }

  return (
    <div style={{ padding: '24px', maxWidth: 720, margin: '0 auto' }}>

      {/* En-tête */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.tx }}>Coachs</div>
        <div style={{ fontSize: 12, color: C.tx3, marginTop: 2 }}>
          {coaches.length} coach{coaches.length > 1 ? 's' : ''} ·{' '}
          {certified.length} certifié{certified.length > 1 ? 's' : ''}
        </div>
      </div>

      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : coaches.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Aucun autre coach"
          description="Vous êtes le seul coach enregistré pour l'instant."
        />
      ) : (
        <>
          {/* Certifiés */}
          {certified.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div style={{
                fontSize: 10, fontWeight: 700, color: C.tx3,
                textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12,
              }}>
                Certifiés — {certified.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {certified.map(c => (
                  <CoachRow
                    key={c.id} coach={c}
                    isSelf={isSelf(c.id)}
                    isAdmin={profile.is_admin}
                    onToggle={handleToggle}
                    toggling={toggleMut.isPending && toggleMut.variables?.targetId === c.id}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Non certifiés */}
          {nonCertified.length > 0 && profile.is_admin && (
            <section>
              <div style={{
                fontSize: 10, fontWeight: 700, color: C.tx3,
                textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 12,
              }}>
                Non certifiés — {nonCertified.length}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {nonCertified.map(c => (
                  <CoachRow
                    key={c.id} coach={c}
                    isSelf={isSelf(c.id)}
                    isAdmin={profile.is_admin}
                    onToggle={handleToggle}
                    toggling={toggleMut.isPending && toggleMut.variables?.targetId === c.id}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
