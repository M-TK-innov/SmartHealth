import os from 'node:os';

/**
 * Adresses auxquelles le serveur repond.
 *
 * Module volontairement separe de `bootstrap.ts` : il ne touche pas a la base
 * de donnees, ce qui le rend testable sous Node sans monter tout Next.
 */

export interface NetworkAddress {
  /** URL complete, prete a etre saisie dans un navigateur. */
  url: string;
  /** Interface reseau d'origine (Wi-Fi, Ethernet...). */
  label: string;
  /** true pour l'acces depuis le poste serveur lui-meme. */
  local: boolean;
}

/**
 * Adresses a afficher a l'installateur.
 *
 * Les autres postes de la structure ont besoin de l'adresse IP du serveur :
 * la retrouver soi-meme suppose de savoir lancer `ipconfig` et de lire la
 * bonne ligne parmi une dizaine. On la donne donc directement.
 */
export function networkAddresses(port = 3000): NetworkAddress[] {
  const addresses: NetworkAddress[] = [
    { url: `http://localhost:${port}`, label: 'Ce poste', local: true },
  ];

  const interfaces = os.networkInterfaces();
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      // IPv4 uniquement, et pas la boucle locale : on veut ce que les autres
      // appareils du reseau peuvent reellement joindre.
      if (entry.family !== 'IPv4' || entry.internal) continue;
      // 169.254.x.x : interface sans bail DHCP. Aucun appareil ne joindra le
      // serveur par la — l'afficher enverrait l'installateur dans le mur.
      if (entry.address.startsWith('169.254.')) continue;
      addresses.push({ url: `http://${entry.address}:${port}`, label: name, local: false });
    }
  }

  return addresses;
}

/**
 * Port reellement ecoute.
 *
 * L'application desktop demarre son serveur sur un port libre tire au hasard
 * et le transmet par PORT ; le serveur web utilise 3000.
 */
export function currentPort(): number {
  const fromEnv = Number(process.env.PORT);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 3000;
}
