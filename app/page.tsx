import { requireAuth } from '@/lib/auth/guard';
import { PosteMedecin } from '@/components/poste/Medecin';
import { PosteInfirmier } from '@/components/poste/Infirmier';
import { PosteEtablissement } from '@/components/poste/Etablissement';
import { PosteAdministration, PosteMinistere } from '@/components/poste/Pilotage';

export const dynamic = 'force-dynamic';

/**
 * L'ecran d'ouverture : un poste de travail, pas un tableau de bord commun.
 *
 * CE QUI A CHANGE, ET POURQUOI. Un seul ecran etait servi aux sept acteurs :
 * une banniere de presentation, quatre compteurs de consultations, la liste
 * des consultations recentes et un formulaire de creation de patient. C'etait
 * l'ecran d'un medecin, montre a l'infirmier d'accueil, a la direction, au
 * ministere et aux administrateurs. Chacun arrivait sur le travail d'un autre,
 * puis partait le chercher dans un menu plat.
 *
 * Le cloisonnement des DROITS etait deja fait et verifie page par page. Ce
 * fichier s'occupe d'autre chose : du PREMIER REGARD. Il repond a « qu'est-ce
 * que je fais maintenant », et la reponse n'est pas la meme selon le poste.
 *
 * LE ROLE DECIDE DE L'ECRAN, PAS DES DROITS. Chaque poste ne demande que ce
 * que son role porte, mais rien ici ne tient lieu d'autorisation : les pages
 * revalident leurs droits, et un poste qui afficherait un chiffre interdit se
 * ferait refuser a la premiere requete. Masquer n'a jamais protege.
 */
export default async function Accueil() {
  const ctx = await requireAuth('/');

  switch (ctx.user.role) {
    case 'medecin':
      return <PosteMedecin ctx={ctx} />;
    case 'infirmier':
      return <PosteInfirmier ctx={ctx} />;
    case 'hopital':
      return <PosteEtablissement ctx={ctx} />;
    case 'ministere':
      return <PosteMinistere ctx={ctx} />;
    case 'admin':
    case 'super_admin':
      return <PosteAdministration ctx={ctx} />;
    default:
      // Un role ajoute sans son poste atterrit ici. On le dit plutot que de
      // montrer un ecran vide : le symptome serait un compte qui « ne charge
      // pas », et on chercherait la panne du mauvais cote.
      return (
        <section className="card-pad">
          <h1 className="text-xl font-bold">Aucun poste de travail pour ce role</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Le role « {ctx.user.role} » n a pas encore d ecran d accueil. Vos droits restent
            valables : le menu vous mene aux ecrans qui vous sont ouverts.
          </p>
        </section>
      );
  }
}
