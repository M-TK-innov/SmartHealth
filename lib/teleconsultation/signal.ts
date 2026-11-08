/**
 * Signalisation de la consultation a distance.
 *
 * CE QUE C'EST, ET CE QUE CE N'EST PAS
 *
 * Deux navigateurs qui veulent se parler en WebRTC doivent d'abord s'echanger
 * une description de session et des candidats reseau. Cet echange ne peut pas
 * se faire entre eux — ils ne se connaissent pas encore. Il faut un tiers qui
 * se contente de transmettre : c'est ce fichier.
 *
 * LA VIDEO ELLE-MEME NE PASSE PAS PAR ICI. Une fois les deux pairs en
 * relation, le flux va de l'un a l'autre sans toucher le serveur. C'est ce qui
 * rend la chose tenable sur un mini-PC de centre de sante : le serveur porte
 * quelques kilo-octets de negociation, pas des heures de video.
 *
 * LA LIMITE, DITE PLUTOT QUE CACHEE
 *
 * Sans serveur de relais — un TURN —, la liaison directe echoue quand les deux
 * pairs sont derriere des reseaux qui ne se laissent pas traverser. Sur le
 * reseau d'un meme etablissement, cela fonctionne. Entre deux connexions
 * mobiles quelconques, pas toujours. Le relais se declare dans
 * `SMARTHEALTH_TURN_URL`, et son absence n'est pas une panne : c'est une
 * installation sans relais, et l'interface doit le dire au lieu de laisser
 * tourner un ecran noir.
 *
 * LES MESSAGES VIVENT EN MEMOIRE, ET C'EST VOULU. Ils ne valent que quelques
 * secondes, le temps d'etablir la liaison. Les ecrire en base ferait persister
 * des descriptions de session bien apres la consultation, pour rien. En
 * contrepartie, cette signalisation suppose UN SEUL processus serveur : avec
 * plusieurs instances derriere un repartiteur, deux pairs pourraient tomber
 * sur des memoires differentes et ne jamais se trouver.
 */

export type RoleSignal = 'praticien' | 'patient';

export interface MessageSignal {
  /** Rang croissant, qui sert de curseur a celui qui releve. */
  seq: number;
  de: RoleSignal;
  /** Charge utile WebRTC : offre, reponse, ou candidat. */
  charge: unknown;
  depose: number;
}

interface Boite {
  messages: MessageSignal[];
  suivant: number;
  touchee: number;
}

/** Au-dela, une boite est oubliee. Une negociation prend quelques secondes. */
const DUREE_VIE_MS = 30 * 60 * 1000;

/** Garde-fou : une boite qui deborde signale une boucle, pas une negociation. */
const MAX_MESSAGES = 200;

const boites = new Map<string, Boite>();

function nettoyer(maintenant: number) {
  for (const [salle, b] of boites) {
    if (maintenant - b.touchee > DUREE_VIE_MS) boites.delete(salle);
  }
}

/** Depose un message a l'intention de l'autre pair. Rend son rang. */
export function deposer(
  salle: string,
  de: RoleSignal,
  charge: unknown,
  maintenant = Date.now(),
): number {
  nettoyer(maintenant);
  const b = boites.get(salle) ?? { messages: [], suivant: 1, touchee: maintenant };
  const seq = b.suivant;
  b.messages.push({ seq, de, charge, depose: maintenant });
  b.suivant = seq + 1;
  b.touchee = maintenant;
  // On jette les plus anciens plutot que de refuser les nouveaux : une
  // negociation qui dure a besoin de ses DERNIERS candidats, pas des premiers.
  if (b.messages.length > MAX_MESSAGES) {
    b.messages.splice(0, b.messages.length - MAX_MESSAGES);
  }
  boites.set(salle, b);
  return seq;
}

/**
 * Releve ce que l'AUTRE pair a depose depuis le curseur.
 *
 * On ne se relit jamais soi-meme : un pair qui recevrait sa propre offre la
 * traiterait comme venant d'en face et repondrait a lui-meme.
 */
export function relever(
  salle: string,
  pour: RoleSignal,
  depuis: number,
  maintenant = Date.now(),
): { messages: MessageSignal[]; curseur: number } {
  nettoyer(maintenant);
  const b = boites.get(salle);
  if (!b) return { messages: [], curseur: depuis };
  b.touchee = maintenant;
  const messages = b.messages.filter((m) => m.seq > depuis && m.de !== pour);
  const curseur = messages.length > 0 ? messages[messages.length - 1].seq : depuis;
  return { messages, curseur };
}

/**
 * Ferme la boite d'une salle.
 *
 * Appelee a la cloture de la consultation : ce qui a servi a etablir la
 * liaison n'a plus de raison de rester en memoire une fois la liaison finie.
 */
export function fermer(salle: string): void {
  boites.delete(salle);
}

/** Nombre de boites ouvertes. Sert au diagnostic, jamais a l'affichage patient. */
export function boitesOuvertes(): number {
  return boites.size;
}

/**
 * Les serveurs utiles a l'etablissement de la liaison.
 *
 * STUN sert a decouvrir sa propre adresse publique ; TURN relaie le flux
 * quand la liaison directe echoue. L'installation hors-ligne n'a ni l'un ni
 * l'autre, et c'est normal : sur un reseau local, les pairs se trouvent sans
 * aide. On ne met donc AUCUN serveur public par defaut — pointer vers un
 * service externe depuis une application de sante installerait une
 * dependance que personne n'a choisie.
 */
export function serveursGlace(env: NodeJS.ProcessEnv = process.env): RTCIceServerLike[] {
  const serveurs: RTCIceServerLike[] = [];
  const stun = env.SMARTHEALTH_STUN_URL?.trim();
  if (stun) serveurs.push({ urls: stun });
  const turn = env.SMARTHEALTH_TURN_URL?.trim();
  if (turn) {
    serveurs.push({
      urls: turn,
      username: env.SMARTHEALTH_TURN_USER ?? undefined,
      credential: env.SMARTHEALTH_TURN_PASS ?? undefined,
    });
  }
  return serveurs;
}

export interface RTCIceServerLike {
  urls: string;
  username?: string;
  credential?: string;
}

/**
 * Peut-on esperer une liaison hors du reseau local ?
 *
 * Sans relais declare, la reponse est non des que les deux pairs sont sur des
 * reseaux differents. L'interface s'en sert pour prevenir AVANT la
 * consultation, plutot que de laisser deux personnes face a un ecran noir en
 * se demandant qui a un probleme.
 */
export function relaisDisponible(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SMARTHEALTH_TURN_URL?.trim());
}
