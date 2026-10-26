-- Réserver le point hebdo : le coach colle son lien Calendly, l'athlète le voit
-- dans son profil et réserve depuis un panneau plein écran (iframe inline).
-- Nullable : tant que le coach n'a rien posé, l'entrée de menu reste cachée.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS booking_url text;

-- Garde-fou : l'URL finit dans un iframe, donc on n'accepte que https://calendly.com
-- (ou un sous-domaine entreprise). La validation côté client est dans src/lib/booking.ts.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_booking_url_chk;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_booking_url_chk CHECK (
    booking_url IS NULL
    OR booking_url ~ '^https://([a-z0-9-]+\.)*calendly\.com/[^\s]+$'
  );

COMMENT ON COLUMN public.profiles.booking_url IS
  'Lien Calendly du coach pour le point hebdo. Lu par ses athlètes via profiles_select_coaches.';
