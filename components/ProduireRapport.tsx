'use client';

import { useState } from 'react';

/**
 * Production et transmission du rapport mensuel.
 *
 * Le bouton n'envoie rien au niveau central : la transmission reelle passe
 * par le canal declare dans Administration, et elle n'est pas automatique a
 * dessein. Un rapport qui part sans qu'un agent l'ait regarde est un rapport
 * que personne ne verifie.
 *
 * Ce que le bouton fait : il telecharge le fichier au format attendu, et il
 * enregistre qu'une ressaisie a ete evitee. La quantite n'est PAS envoyee
 * par cet ecran, elle est recalculee par le serveur a partir de la base :
 * un compteur alimente par le client est un compteur declaratif.
 */
export function ProduireRapport({
  annee,
  mois,
  enCours,
  lignes,
  charge,
}: {
  annee: number;
  mois: number;
  enCours: boolean;
  lignes: number;
  charge: string;
}) {
  const [etat, setEtat] = useState<'repos' | 'envoi' | 'note' | 'echec'>('repos');
  const [motif, setMotif] = useState('');
  const [voirCharge, setVoirCharge] = useState(false);

  function telecharger() {
    const blob = new Blob([charge], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-surveillance-${annee}${String(mois).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function marquerProduit() {
    setEtat('envoi');
    setMotif('');
    try {
      const r = await fetch('/api/interop/rapport-mensuel/produit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ annee, mois }),
      });
      const corps = await r.json().catch(() => ({}));
      if (!r.ok) {
        setEtat('echec');
        setMotif(corps.error ?? 'Enregistrement impossible.');
        return;
      }
      setEtat('note');
    } catch {
      setEtat('echec');
      setMotif('Le serveur n a pas repondu.');
    }
  }

  return (
    <section className="card-pad">
      <h2 className="section-title mb-2">Produire et transmettre</h2>

      {lignes === 0 ? (
        <p className="text-sm text-ink-soft">
          Rien a transmettre pour ce mois : aucun cas relevant de la surveillance.
        </p>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">
            Le fichier est au format attendu par le systeme national. La transmission reste
            manuelle : un rapport qui part sans qu un agent l ait regarde est un rapport que
            personne ne verifie.
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn-primary" onClick={telecharger}>
              Telecharger le fichier
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={marquerProduit}
              disabled={etat === 'envoi' || etat === 'note' || enCours}
            >
              {etat === 'note' ? 'Production enregistree' : 'Marquer comme produit'}
            </button>
            <button type="button" className="btn-ghost" onClick={() => setVoirCharge((v) => !v)}>
              {voirCharge ? 'Masquer le contenu' : 'Voir le contenu'}
            </button>
          </div>

          {enCours && (
            <p className="mt-3 text-sm text-warn">
              Le mois n est pas termine : la production ne peut pas etre enregistree.
            </p>
          )}

          {etat === 'echec' && (
            <p role="alert" className="mt-3 rounded-lg bg-danger-soft p-3 text-sm text-danger">
              {motif}
            </p>
          )}

          {etat === 'note' && (
            <p className="mt-3 text-sm text-ink-soft">
              Enregistre. Les lignes que vous n avez pas eu a recopier sont comptees dans le
              releve d allegement, sans aucune donnee nominative.
            </p>
          )}

          {voirCharge && (
            <pre className="mt-4 overflow-x-auto rounded-lg bg-paper p-3 text-xs leading-relaxed">
              {charge}
            </pre>
          )}
        </>
      )}
    </section>
  );
}
