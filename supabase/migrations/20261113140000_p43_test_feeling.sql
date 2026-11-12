-- P43 · planche « Saisir un résultat de test » (Ath1SaisirTest).
-- L'athlète note son ressenti (1 = très dur … 5 = facile) et laisse un mot ;
-- les deux suivent le résultat (athlete_test_results) pour la page détail du
-- test et pour le coach.
-- Additif : 2 colonnes nullables ; le trigger de synchro séance → résultat
-- recopie results_structured.feeling / .comment, et retire le résultat de
-- l'ancien jour quand l'athlète corrige la date du test.

ALTER TABLE public.athlete_test_results
  ADD COLUMN IF NOT EXISTS feeling smallint,
  ADD COLUMN IF NOT EXISTS comment text;

DO $$ BEGIN
  ALTER TABLE public.athlete_test_results
    ADD CONSTRAINT athlete_test_results_feeling_check CHECK (feeling IS NULL OR feeling BETWEEN 1 AND 5);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.athlete_test_results
    ADD CONSTRAINT athlete_test_results_comment_len CHECK (comment IS NULL OR length(comment) <= 1000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.athlete_test_results.feeling IS 'Ressenti de l''athlète : 1 = très dur … 5 = facile';
COMMENT ON COLUMN public.athlete_test_results.comment IS 'Mot de l''athlète sur ce test';

CREATE OR REPLACE FUNCTION public.sync_test_session_to_results()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  declare def_id uuid; res_id uuid; tv_id uuid; v_key text; v_val numeric; vars jsonb;
          v_feeling smallint; v_comment text;
  begin
    if NEW.completed is not true then return NEW; end if;
    vars := NEW.results_structured->'variables';
    if vars is null or jsonb_typeof(vars)<>'object' then return NEW; end if;
    select id into def_id from public.test_definitions where lower(name)=lower(NEW.title) order by (case when is_global then 0 else 1 end), created_at limit 1;
    if def_id is null then return NEW; end if;
    -- Date corrigée par l'athlète : le résultat de l'ancien jour ne tient plus.
    if TG_OP = 'UPDATE' and OLD.date is distinct from NEW.date then
      delete from public.athlete_test_results where athlete_id=NEW.athlete_id and test_definition_id=def_id and performed_at=OLD.date;
    end if;
    delete from public.athlete_test_results where athlete_id=NEW.athlete_id and test_definition_id=def_id and performed_at=NEW.date;
    if not exists (select 1 from jsonb_each_text(vars) e where e.value ~ '^-?[0-9]+(\.[0-9]+)?$') then return NEW; end if;
    if (NEW.results_structured->>'feeling') ~ '^[1-5]$' then v_feeling := (NEW.results_structured->>'feeling')::smallint; end if;
    v_comment := left(nullif(btrim(NEW.results_structured->>'comment'), ''), 1000);
    insert into public.athlete_test_results (athlete_id,test_definition_id,performed_at,notes,feeling,comment)
      values (NEW.athlete_id,def_id,NEW.date,NEW.results_note,v_feeling,v_comment) returning id into res_id;
    for v_key,v_val in select e.key,e.value::numeric from jsonb_each_text(vars) e where e.value ~ '^-?[0-9]+(\.[0-9]+)?$' loop
      select id into tv_id from public.test_variables where test_definition_id=def_id and key=v_key;
      if tv_id is not null then insert into public.athlete_test_values (result_id,variable_id,value) values (res_id,tv_id,v_val) on conflict (result_id,variable_id) do update set
  value=excluded.value; end if;
    end loop;
    return NEW;
  end; $function$;
