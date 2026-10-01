/**
 * Ce qu'un systeme tiers apprend AVANT de s'authentifier.
 *
 * Le CapabilityStatement est la seule chose que l'API FHIR sert a un appelant
 * anonyme. S'il ne dit pas qu'une authentification est attendue, l'integrateur
 * d'en face recoit un 401 sans savoir quoi presenter, et conclut a une panne du
 * serveur — un appel qu'on ne recevra jamais, et un reproche adresse au mauvais
 * endroit.
 *
 * Module sans dependance, comme le moteur de restrictions : la decision se
 * teste telle qu'elle tourne.
 */

export type ModeAccesFhir = 'session' | 'token' | 'open';

export interface SecuriteRest {
  cors: boolean;
  service: { coding: { system: string; code: string; display: string }[]; text: string }[];
  description: string;
}

const SYSTEME_FHIR = 'http://terminology.hl7.org/CodeSystem/restful-security-service';

/**
 * Declaration de securite, tiree de la configuration REELLE de la structure.
 *
 * Elle suit le reglage plutot qu'une constante : annoncer une authentification
 * la ou l'API est ouverte serait un mensonge, et l'inverse bloquerait
 * l'integration.
 *
 * Aucun code du vocabulaire FHIR ne designe le jeton porteur de service.
 * « OAuth » et « SMART-on-FHIR » promettraient une negociation que ce serveur
 * n'offre pas : un client SMART qui suivrait l'annonce irait chercher un point
 * d'autorisation inexistant. On declare donc le code le plus neutre, et
 * l'intention en clair dans `description`, ce que la specification prevoit.
 */
export function securiteRest(mode: ModeAccesFhir): SecuriteRest | undefined {
  if (mode === 'open') return undefined;

  return {
    cors: true,
    service: [
      {
        coding: [{ system: SYSTEME_FHIR, code: 'Basic', display: 'Basic' }],
        text: mode === 'token' ? 'Jeton porteur de service' : 'Session authentifiee',
      },
    ],
    description:
      mode === 'token'
        ? 'Chaque requete doit porter un en-tete Authorization: Bearer <jeton>. Le jeton est delivre par l etablissement (FHIR_API_TOKEN cote serveur). Les acces acceptes sont journalises.'
        : "L acces demande une session authentifiee disposant du droit export:read. Pour un appel de serveur a serveur, demandez a l etablissement d activer le jeton de service. Les acces acceptes sont journalises.",
  };
}
