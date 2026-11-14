-- À charger AVANT schema.sql, sur la base locale seulement.
-- Supabase local donne par défaut tous les droits à anon / authenticated / service_role
-- sur chaque objet créé dans public. pg_dump, lui, écrit les droits de la prod en partant
-- des droits Postgres d'origine : sans ce fichier, chaque REVOKE fait en prod serait
-- perdu ici (anon pourrait appeler toutes les fonctions). Le dump remet ces règles par
-- défaut à la fin, une fois les objets créés.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
