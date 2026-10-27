'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { francs } from '@/lib/hopital/caisse';
import { formaterInstant } from '@/lib/localisation';
import type { AvisPaiement, Facture, Solde } from '@/lib/hopital/caisse';

/**
 * Ecran de caisse.
 *
 * L'avis de paiement est affiche EN TETE, avant les montants, et sa couleur
 * ne depend pas de la somme due mais de l'urgence de l'acte. Sur un acte
 * vital ou urgent, l'encadre dit explicitement que l'acte se fait et que la
 * regularisation vient apres — un bandeau rouge « 50 000 F dus » sans cette
 * phrase se lit comme un ordre d'arreter.
 *
 * Il n'y a ni bouton de modification ni bouton de suppression sur un
 * paiement. Une caisse dont les lignes s'editent ne prouve rien, et c'est
 * une preuve qu'on lui demande.
 */

const MOYENS = [
  ['especes', 'Especes'],
  ['mobile', 'Mobile money'],
  ['carte', 'Carte'],
  ['tiers-payant', 'Tiers payant'],
] as const;

export function Caisse({
  facture,
  solde,
  avis,
  patientNom,
  peutEncaisser,
  fuseau,
}: {
  facture: Facture;
  solde: Solde;
  avis: AvisPaiement;
  patientNom: string;
  peutEncaisser: boolean;
  /** Fuseau de l'etablissement : les heures affichees sont les siennes,
   *  pas celles du poste depuis lequel on regarde. */
  fuseau: string;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [refus, setRefus] = useState<{ message: string; remede: string } | null>(null);
  const [montant, setMontant] = useState('');
  const [moyen, setMoyen] = useState<string>('especes');
  const [reference, setReference] = useState('');

  async function envoyer(corps: Record<string, unknown>) {
    setRefus(null);
    const r = await fetch(`/api/hopital/factures/${facture.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
    if (!r.ok) {
      const data = await r.json().catch(() => ({}));
      setRefus({
        message: data.error ?? 'Operation impossible.',
        remede: data.remede ?? 'La facture a peut-etre change entre-temps.',
      });
      // Resynchronisation meme sur un refus : un montant refuse parce que la
      // facture a bouge doit etre recalcule sous les yeux de l'agent, pas
      // laisse perime a l'ecran.
      demarrer(() => router.refresh());
      return false;
    }
    demarrer(() => router.refresh());
    return true;
  }

  async function encaisser(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(montant);
    if (await envoyer({ type: 'paiement', montant: n, moyen, reference: reference || undefined })) {
      setMontant('');
      setReference('');
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section className="card">
        <header className="border-b border-line px-5 py-3">
          <h1 className="text-lg font-bold">Facture — {patientNom}</h1>
          <p className="text-xs text-ink-soft">
            Montants en francs CFA entiers · {facture.close ? 'facture close' : 'facture ouverte'}
          </p>
        </header>

        <Avis avis={avis} />

        {refus && (
          <div className="border-b border-danger bg-danger-soft px-5 py-3">
            <p className="text-sm font-semibold text-danger">{refus.message}</p>
            <p className="mt-0.5 text-sm">{refus.remede}</p>
          </div>
        )}

        <table className="w-full text-sm">
          <thead className="border-b border-line text-left text-xs uppercase text-ink-soft">
            <tr>
              <th className="px-5 py-2 font-medium">Acte</th>
              <th className="px-2 py-2 text-right font-medium">Unitaire</th>
              <th className="px-2 py-2 text-right font-medium">Qte</th>
              <th className="px-5 py-2 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {facture.lignes.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-4 text-ink-soft">
                  Aucun acte facture.
                </td>
              </tr>
            ) : (
              facture.lignes.map((l) => (
                <tr key={l.id}>
                  <td className="px-5 py-2">
                    {l.libelle}
                    {l.urgence !== 'programmable' && (
                      <>
                        {' '}
                        <span className="chip bg-warn-soft text-warn">{l.urgence}</span>
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{francs(l.montant)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{l.quantite}</td>
                  <td className="px-5 py-2 text-right font-medium tabular-nums">
                    {francs(l.montant * l.quantite)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {facture.paiements.length > 0 && (
          <div className="border-t border-line">
            <h2 className="px-5 pt-3 text-sm font-semibold">Paiements recus</h2>
            <ul className="divide-y divide-line">
              {facture.paiements.map((p) => (
                <li key={p.id} className="flex items-center justify-between px-5 py-2 text-sm">
                  <span>
                    {MOYENS.find(([v]) => v === p.moyen)?.[1] ?? p.moyen}
                    <span className="ml-2 text-xs text-ink-soft">
                      {formaterInstant(p.recuLe, fuseau)}
                    </span>
                  </span>
                  <span className="font-medium tabular-nums">{francs(p.montant)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <div className="grid gap-4">
        <section className="card-pad">
          <h2 className="mb-2 text-sm font-semibold">Solde</h2>
          <dl className="grid gap-1 text-sm">
            <Ligne terme="Total des actes" valeur={francs(solde.total)} />
            {solde.partTiers > 0 && <Ligne terme="Pris en charge" valeur={`− ${francs(solde.partTiers)}`} />}
            <Ligne terme="Du par le patient" valeur={francs(solde.duPatient)} />
            <Ligne terme="Deja regle" valeur={francs(solde.regle)} />
            <div className="mt-1 border-t border-line pt-1">
              <Ligne
                terme="Reste a charge"
                valeur={francs(solde.resteACharge)}
                fort
                alerte={solde.resteACharge > 0}
              />
            </div>
            {solde.tropPercu > 0 && (
              // Un trop-percu est nomme, jamais absorbe : sans cette ligne,
              // une erreur de rendu devient une recette.
              <div className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-xs text-warn">
                <b>{francs(solde.tropPercu)} percus en trop.</b> A rembourser au patient.
              </div>
            )}
          </dl>
        </section>

        {peutEncaisser && !facture.close && (
          <section className="card-pad">
            <h2 className="mb-2 text-sm font-semibold">Encaisser</h2>
            <form onSubmit={encaisser} className="grid gap-2">
              <input
                className="input"
                inputMode="numeric"
                placeholder={`Montant (reste ${solde.resteACharge})`}
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                required
              />
              <select className="input" value={moyen} onChange={(e) => setMoyen(e.target.value)}>
                {MOYENS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              {moyen === 'mobile' && (
                <input
                  className="input"
                  placeholder="Reference de la transaction"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                />
              )}
              <button className="btn-primary" disabled={enCours || solde.resteACharge === 0}>
                {enCours ? 'Enregistrement...' : 'Enregistrer le paiement'}
              </button>
            </form>

            {solde.soldee && (
              <button
                className="btn-ghost mt-2 w-full"
                disabled={enCours}
                onClick={() => envoyer({ type: 'cloture' })}
              >
                Clore la facture
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Avis({ avis }: { avis: AvisPaiement }) {
  if (avis.niveau === 'aucun') return null;

  // Sur un acte urgent l'encadre est SOBRE et affirmatif : il informe sans
  // suggerer d'attendre. Le rouge est reserve a ce qui peut reellement
  // attendre sans dommage.
  const urgent = avis.niveau === 'avis';
  return (
    <div
      className={`border-b px-5 py-3 ${
        urgent ? 'border-line bg-brand-soft' : 'border-danger bg-danger-soft'
      }`}
    >
      <p className={`text-sm ${urgent ? 'text-brand-dark' : 'font-semibold text-danger'}`}>
        {avis.message}
      </p>
    </div>
  );
}

function Ligne({
  terme,
  valeur,
  fort = false,
  alerte = false,
}: {
  terme: string;
  valeur: string;
  fort?: boolean;
  alerte?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={fort ? 'font-semibold' : 'text-ink-soft'}>{terme}</dt>
      <dd className={`tabular-nums ${fort ? 'text-lg font-bold' : ''} ${alerte ? 'text-danger' : ''}`}>
        {valeur}
      </dd>
    </div>
  );
}
