-- Ajouter rpe_score directement dans workout_logs (plus simple que table séparée)
alter table workout_logs
  add column if not exists rpe_score smallint check (rpe_score between 1 and 10);

-- Migrer les données existantes de workout_rpe si la table existe
do $$
begin
  if exists (select 1 from information_schema.tables where table_name = 'workout_rpe') then
    update workout_logs wl
    set rpe_score = wr.rpe_score
    from workout_rpe wr
    where wr.workout_log_id = wl.id;  -- workout_id : colonne inexistante (corrigé le 2026-11-13)
  end if;
end;
$$;
