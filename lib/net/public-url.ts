import { networkConfig } from '@/lib/net/store';

/**
 * Adresse publique de l'application.
 *
 * Trois sources, dans cet ordre :
 *   1. l'adresse declaree dans la console — c'est celle que la structure a
 *      choisie, et la seule qui reste juste derriere un proxy TLS ;
 *   2. FHIR_BASE_URL, pour les installations configurees avant cette page ;
 *   3. l'origine de la requete courante.
 *
 * L'ordre compte : derriere un proxy, l'origine vue par le serveur est
 * `http://127.0.0.1:3000`. Une ressource FHIR qui reference ses voisines par
 * cette adresse produit un Bundle inexploitable des qu'il sort du serveur —
 * les liens pointent vers une machine que le destinataire ne joindra jamais.
 */
export function publicBaseUrl(fallbackOrigin?: string): string {
  const declared = networkConfig().app_public_url?.trim();
  if (declared) return declared.replace(/\/+$/, '');
  const fromEnv = process.env.FHIR_BASE_URL?.trim();
  if (fromEnv) {
    try {
      return new URL(fromEnv).origin;
    } catch {
      /* adresse illisible : on passe a la suite */
    }
  }
  return (fallbackOrigin || 'http://localhost:3000').replace(/\/+$/, '');
}

/** Racine de l'API FHIR, telle qu'elle doit apparaitre dans les ressources emises. */
export function fhirBaseUrl(fallbackOrigin?: string): string {
  const fromEnv = process.env.FHIR_BASE_URL?.trim();
  const declared = networkConfig().app_public_url?.trim();
  // FHIR_BASE_URL peut designer un chemin particulier (ex. /fhir/r4) : on ne
  // l'ecrase que si une adresse publique a ete explicitement declaree.
  if (!declared && fromEnv) return fromEnv.replace(/\/+$/, '');
  return `${publicBaseUrl(fallbackOrigin)}/api/fhir`;
}
