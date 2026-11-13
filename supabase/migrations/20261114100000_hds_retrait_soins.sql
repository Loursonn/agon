-- Retrait de tout ce qui relève des soins (hors hébergement de données de santé,
-- art. L.1111-8 CSP). Décision d'Hugo du 2026-11-13, revue juridique
-- docs/juridique/REVUE_2026-11.md §2 et §3.2 (risque C1).
--
-- Agon garde la blessure sportive : zone, type, mécanisme, contexte, douleur,
-- impact, jours d'arrêt, date de retour, statut, notes. Il ne garde plus :
--   - medical_entries.diagnosis, treatment, diagnosed_by ;
--   - les entrées « opération », « pathologie », « autre » (antécédents) ;
--   - medical_history (antécédents : pathologies, allergies, opérations, traitements) ;
--   - medical_attachments + bucket `medical` (documents médicaux).
--
-- Temps 1 (ce fichier) : données nettoyées et écriture refusée. Le client de
-- `main` écrit encore ces champs : les colonnes restent, un trigger les vide à
-- chaque écriture (aucune erreur pour lui), et les écritures dans
-- medical_history / medical_attachments / bucket `medical` sont refusées
-- (le formulaire d'antécédents de `main` affiche une erreur, rien n'est stocké).
-- Temps 2, une fois `dev` en production : supprimer colonnes, tables et bucket
-- (tâche roadmap « HDS temps 2 »).

-- ── 1. Données existantes ───────────────────────────────────────────────────
-- Accord d'Hugo (2026-11-13) : diagnostic, traitement et « vu par » des
-- blessures sont recopiés en fin des notes de l'athlète, puis vidés ; les
-- entrées qui ne sont pas des blessures sont supprimées.
DELETE FROM public.medical_entries WHERE kind <> 'blessure';

UPDATE public.medical_entries
SET notes = concat_ws(E'\n\n',
      nullif(btrim(notes), ''),
      'Diagnostic : ' || nullif(btrim(diagnosis), ''),
      'Traitement : ' || nullif(btrim(treatment), ''),
      'Vu par : ' || CASE diagnosed_by
        WHEN 'medecin' THEN 'médecin' WHEN 'kine' THEN 'kiné' WHEN 'osteo' THEN 'ostéo'
        WHEN 'autre' THEN 'autre' ELSE NULL END),
    diagnosis = NULL, treatment = NULL, diagnosed_by = NULL
WHERE coalesce(btrim(diagnosis), '') <> '' OR coalesce(btrim(treatment), '') <> '' OR diagnosed_by IS NOT NULL;

-- Notes vides après concat_ws : NULL plutôt que ''.
UPDATE public.medical_entries SET notes = NULL WHERE notes = '';

DELETE FROM public.medical_history;
DELETE FROM public.medical_attachments;

-- ── 2. medical_entries : blessure seule, sans champ de soins ────────────────
CREATE OR REPLACE FUNCTION public.medical_entries_sans_soins()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  -- Le client de `main` peut encore envoyer ces champs : on les vide plutôt
  -- que de faire échouer l'enregistrement de la blessure.
  NEW.kind := 'blessure';
  NEW.diagnosis := NULL;
  NEW.treatment := NULL;
  NEW.diagnosed_by := NULL;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.medical_entries_sans_soins() IS
  'Hors HDS (2026-11-13) : toute entrée est une blessure sportive, sans diagnostic, traitement ni « vu par ».';

DROP TRIGGER IF EXISTS medical_entries_sans_soins ON public.medical_entries;
CREATE TRIGGER medical_entries_sans_soins
  BEFORE INSERT OR UPDATE ON public.medical_entries
  FOR EACH ROW EXECUTE FUNCTION public.medical_entries_sans_soins();

ALTER TABLE public.medical_entries DROP CONSTRAINT IF EXISTS medical_entries_kind_check;
ALTER TABLE public.medical_entries ADD CONSTRAINT medical_entries_kind_check CHECK (kind = 'blessure');
ALTER TABLE public.medical_entries ADD CONSTRAINT medical_entries_sans_soins_check
  CHECK (diagnosis IS NULL AND treatment IS NULL AND diagnosed_by IS NULL);

COMMENT ON COLUMN public.medical_entries.diagnosis IS 'Retiré (hors HDS, 2026-11-13) : toujours NULL, colonne supprimée au temps 2';
COMMENT ON COLUMN public.medical_entries.treatment IS 'Retiré (hors HDS, 2026-11-13) : toujours NULL, colonne supprimée au temps 2';
COMMENT ON COLUMN public.medical_entries.diagnosed_by IS 'Retiré (hors HDS, 2026-11-13) : toujours NULL, colonne supprimée au temps 2';

-- ── 3. Antécédents et documents médicaux : plus aucune écriture ─────────────
-- Lecture et suppression restent possibles (export, droit à l'effacement).
REVOKE INSERT, UPDATE ON public.medical_history FROM anon, authenticated;
REVOKE INSERT, UPDATE ON public.medical_attachments FROM anon, authenticated;

COMMENT ON TABLE public.medical_history IS 'Retirée (hors HDS, 2026-11-13) : plus aucune écriture, table supprimée au temps 2';
COMMENT ON TABLE public.medical_attachments IS 'Retirée (hors HDS, 2026-11-13) : plus aucune écriture, table supprimée au temps 2';

-- Bucket `medical` : plus d'envoi. Lecture et suppression gardées.
DROP POLICY IF EXISTS medical_storage_all ON storage.objects;
DROP POLICY IF EXISTS staff_medical_storage_insert ON storage.objects;

CREATE POLICY medical_storage_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'medical' AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.is_coach_of(((storage.foldername(name))[1])::uuid)));

CREATE POLICY medical_storage_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'medical' AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.is_coach_of(((storage.foldername(name))[1])::uuid)));
