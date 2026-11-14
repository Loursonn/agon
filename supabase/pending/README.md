# Migrations prêtes, en attente d'accord

Le job CI « Rejeu des migrations (R2) » compare `supabase/migrations/` au schéma de la prod
(`supabase/tests/ci/schema.sql`) et devient rouge si un fichier n'est pas appliqué. Une migration
écrite mais pas encore autorisée attend donc ici, avec son test. Ce dossier n'est lu par aucun outil.
