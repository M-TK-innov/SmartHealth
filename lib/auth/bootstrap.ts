import { get } from '@/lib/db';

/**
 * Amorcage d'une installation neuve.
 *
 * Une base fraiche ne contient aucun compte : personne ne peut se connecter, et
 * une page de connexion sans compte est une impasse. Tant qu'aucun compte
 * n'existe, l'application bascule sur l'ecran d'amorcage.
 *
 * Cet etat est la SEULE condition qui autorise la creation d'un
 * super-administrateur sans etre authentifie. Des qu'un compte existe — meme
 * suspendu, meme refuse — la route d'amorcage se ferme definitivement. Sans
 * cette regle, suspendre le seul administrateur rouvrirait la creation d'un
 * compte tout-puissant a quiconque atteint le serveur.
 */
export function needsBootstrap(): boolean {
  try {
    return (get<{ n: number }>('SELECT COUNT(*) n FROM user_account')?.n ?? 0) === 0;
  } catch {
    // Table absente : base encore plus neuve que prevu, donc a amorcer.
    return true;
  }
}

export { currentPort, networkAddresses, type NetworkAddress } from './network';
