/**
 * Lien de réservation du point hebdo (Calendly, sans API).
 *
 * Le coach colle une URL Calendly dans ses réglages, l'athlète la voit dans son
 * profil et réserve depuis un panneau plein écran (iframe inline).
 *
 * Deux règles qui pilotent tout le module :
 *  - on n'accepte QUE https://calendly.com (ou un sous-domaine). Pas de http,
 *    pas d'autre hôte : l'URL finit dans un iframe et dans un postMessage dont
 *    on vérifie l'origine, donc tout élargissement ici élargit la surface
 *    d'attaque.
 *  - on préserve les query params déjà posés par le coach (ex. ?month=2026-11)
 *    et on n'ajoute que ce dont l'embed a besoin.
 */

/** Hôte canonique Calendly — sert aussi de contrôle d'origine du postMessage. */
export const CALENDLY_ORIGIN = "https://calendly.com";

/** Événement postMessage émis par le widget quand un créneau est confirmé. */
export const CALENDLY_SCHEDULED_EVENT = "calendly.event_scheduled";

/** Hauteur mini de l'iframe : en dessous, Calendly scrolle dans le scroll. */
export const CALENDLY_MIN_HEIGHT = 640;

/**
 * Vrai si `value` est une URL Calendly utilisable.
 * Accepte calendly.com et ses sous-domaines (certains comptes entreprise),
 * refuse "notcalendly.com" et "calendly.com.evil.net".
 */
export function isCalendlyUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (host !== "calendly.com" && !host.endsWith(".calendly.com")) return false;

  // https://calendly.com seul ne mène à aucun créneau : il faut au moins /user.
  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return false;

  return true;
}

/**
 * Nettoie l'URL saisie par le coach, ou `null` si elle n'est pas exploitable.
 * Retire le slash final et le hash (Calendly n'en fait rien), garde la query.
 */
export function normalizeBookingUrl(value: unknown): string | null {
  if (!isCalendlyUrl(value)) return null;

  const url = new URL((value as string).trim());
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.replace(/\/+$/, "");
  }

  return url.toString();
}

/** Message d'erreur à afficher sous le champ coach, ou `null` si c'est bon. */
export function bookingUrlError(value: string): string | null {
  if (value.trim() === "") return null; // vide = pas de lien, c'est permis
  if (!isCalendlyUrl(value)) {
    return "Lien invalide. Attendu : https://calendly.com/ton-compte/30min";
  }
  return null;
}

export interface CalendlyEmbedOptions {
  /** URL de réservation du coach. */
  url: string | null | undefined;
  /** Nom de l'athlète, préremplit le formulaire. */
  name?: string | null;
  /** Email de l'athlète, préremplit le formulaire. */
  email?: string | null;
  /** Domaine hôte, requis par Calendly pour émettre ses postMessage. */
  embedDomain?: string | null;
}

/**
 * Construit l'URL à mettre dans l'iframe.
 * Retourne `null` si l'URL du coach n'est pas valide — l'appelant n'affiche
 * alors simplement pas l'entrée de menu.
 */
export function buildCalendlyEmbedUrl(options: CalendlyEmbedOptions): string | null {
  const base = normalizeBookingUrl(options.url);
  if (!base) return null;

  const url = new URL(base);
  const params = url.searchParams;

  params.set("embed_type", "Inline");
  params.set("hide_gdpr_banner", "1");

  const domain = (options.embedDomain ?? "").trim();
  if (domain) params.set("embed_domain", domain);

  const name = (options.name ?? "").trim().replace(/\s+/g, " ");
  if (name) params.set("name", name);

  const email = (options.email ?? "").trim();
  if (email) params.set("email", email);

  return url.toString();
}

/** Lien de secours « Ouvrir dans Calendly » : l'URL nue, sans params d'embed. */
export function buildCalendlyFallbackUrl(url: string | null | undefined): string | null {
  return normalizeBookingUrl(url);
}

/**
 * Vrai si cet événement `message` est bien la confirmation Calendly.
 * Contrôle l'origine ET la forme du payload : sans le test d'origine, n'importe
 * quel iframe tiers pourrait fermer le panneau en affichant « réservé ».
 */
export function isCalendlyScheduledMessage(event: {
  origin?: unknown;
  data?: unknown;
}): boolean {
  if (typeof event.origin !== "string") return false;

  let originHost: string;
  try {
    originHost = new URL(event.origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (originHost !== "calendly.com" && !originHost.endsWith(".calendly.com")) {
    return false;
  }

  const data = event.data;
  if (!data || typeof data !== "object") return false;
  const eventName = (data as { event?: unknown }).event;

  return eventName === CALENDLY_SCHEDULED_EVENT;
}
