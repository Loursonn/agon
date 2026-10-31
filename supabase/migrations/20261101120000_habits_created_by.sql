-- Habitudes : qui l'a posée.
--
-- L'assistant IA du coach crée des habitudes pour l'athlète. Il doit
-- distinguer les siennes (et celles du coach) de celles que l'athlète s'est
-- données : le nom de ces dernières est un texte libre de l'athlète, qui ne
-- part pas chez l'assistant, et l'assistant ne les modifie pas.
--
-- NULL = posée par l'athlète (toutes les habitudes existantes : l'app ne
-- permet qu'à l'athlète d'en créer). Renseignée par l'Edge Function coach-api
-- (clé de service) ; l'app athlète ne l'écrit pas.

ALTER TABLE public.habits
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
