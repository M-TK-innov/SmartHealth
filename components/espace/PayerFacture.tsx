import { francs } from '@/lib/hopital/caisse';
import { OPERATEURS, referenceFacture, type Operateur } from '@/lib/paiement/tentative';
import { pourquoiIndisponible } from '@/lib/paiement/fournisseur';

/**
 * Comment regler une facture, vu du patient.
 *
 * DEUX CHEMINS, ET L'UN NE DEPEND DE PERSONNE
 *
 * Le reglement a la caisse fonctionne sans aucun reglage, sans operateur et
 * sans reseau. Il est donc presente en premier, et il reste presente meme
 * quand le paiement en ligne marche : dans beaucoup de centres, c'est celui
 * qu'on utilisera.
 *
 * POURQUOI LE REFUS EST AFFICHE EN TOUTES LETTRES
 *
 * Un bouton grise sans explication fait croire a une panne, et le patient
 * appelle le centre. L'ecran dit donc ce qui manque, dans des termes qui
 * s'adressent a lui — pas les noms de variables, qui regardent le
 * responsable technique et apparaissent, eux, dans la console.
 */
export function PayerFacture({
  factureId,
  resteACharge,
}: {
  factureId: string;
  resteACharge: number;
}) {
  if (resteACharge <= 0) return null;

  const operateurs = Object.keys(OPERATEURS) as Operateur[];
  const indisponibles = operateurs.map((o) => ({ o, motif: pourquoiIndisponible(o) }));
  const ouverts = indisponibles.filter((x) => !x.motif).map((x) => x.o);

  // Meme fonction que l'en-tete de la facture : le patient dicte
  // exactement ce que le caissier voit a l'ecran.
  const reference = referenceFacture(factureId);

  return (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-sm font-semibold">Comment regler</p>

      <div className="mt-2 rounded-lg bg-paper p-3">
        <p className="text-sm">
          <b>A la caisse de votre centre.</b> Annoncez cette reference :
        </p>
        <p className="mt-1 font-mono text-base font-bold tracking-widest">{reference}</p>
        <p className="mt-1 text-xs text-ink-soft">
          Montant du : <b>{francs(resteACharge)}</b>. Un recu vous sera remis.
        </p>
      </div>

      {ouverts.length > 0 ? (
        <div className="mt-2 rounded-lg bg-paper p-3">
          <p className="text-sm">
            <b>Depuis votre telephone</b>, avec {ouverts.map((o) => OPERATEURS[o]).join(' ou ')}.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-xs leading-relaxed text-ink-soft">
          Le paiement depuis le telephone n est pas encore ouvert dans ce centre. Il le sera sans
          que vous ayez rien a faire ; en attendant, la caisse reste le chemin.
        </p>
      )}
    </div>
  );
}
