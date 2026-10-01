'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Ce que l'installation a appris des corrections des praticiens.
 *
 * Cet ecran est le CONTRE-POUVOIR du mecanisme d'apprentissage. Une lecon
 * retenue a tort s'applique en silence a toutes les transcriptions suivantes,
 * et le praticien relit alors un texte deja abime en croyant relire la machine.
 * Le seul garde-fou qui vaille est qu'un humain puisse voir ce qui a ete appris
 * et le retirer — sans quoi l'automatisme n'a aucun frein.
 *
 * D'ou la forme : ce qui est APPLIQUE est en haut, en pleine lumiere, et le
 * retrait est a un clic. Ce qui est seulement observe vient apres.
 */

interface Lecon {
  avant: string;
  apres: string;
  avant_affiche: string;
  contexte: string | null;
  consultations: number;
  etat: string;
}

interface Donnees {
  seuil: number;
  lecons: Lecon[];
  appliquees: number;
}

export function ApprentissagePanel({ peutExporter }: { peutExporter: boolean }) {
  const [donnees, setDonnees] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/apprentissage');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Lecture impossible.');
      setDonnees(d);
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Lecture impossible.');
    }
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  async function ecarter(l: Lecon) {
    setOccupe(`${l.avant}>${l.apres}`);
    try {
      const res = await fetch('/api/admin/apprentissage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avant: l.avant, apres: l.apres }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? 'Retrait impossible.');
      setDonnees((v) => (v ? { ...v, lecons: d.lecons, appliquees: d.appliquees } : v));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Retrait impossible.');
    } finally {
      setOccupe(null);
    }
  }

  if (erreur && !donnees) {
    return <div className="card-pad text-sm text-danger">{erreur}</div>;
  }
  if (!donnees) {
    return <div className="card-pad text-sm text-ink-soft">Lecture en cours...</div>;
  }

  const appliquees = donnees.lecons.filter((l) => l.etat !== 'ecarte' && l.consultations >= donnees.seuil);
  const observees = donnees.lecons.filter((l) => l.etat !== 'ecarte' && l.consultations < donnees.seuil);
  const ecartees = donnees.lecons.filter((l) => l.etat === 'ecarte');

  return (
    <div className="space-y-4">
      <section className="card-pad">
        <h2 className="section-title mb-1">Ce que cette installation a appris</h2>
        <p className="text-sm leading-relaxed text-ink-soft">
          Quand un praticien reprend une transcription, il indique sans le savoir ce que la machine a mal
          entendu. Ces couples sont conserves <strong>sur ce poste uniquement</strong> : rien ne remonte vers
          un serveur, rien ne descend d ailleurs, et une lecon ne franchit pas la structure qui l a produite.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Une correction n est appliquee qu apres etre apparue dans <strong>{donnees.seuil} consultations
          distinctes</strong>. Les corrections faites a la transcription restent affichees au praticien :
          rien n est repris en douce.
        </p>
      </section>

      {erreur && <div className="rounded-lg border border-danger bg-danger-soft p-3 text-sm">{erreur}</div>}

      <Groupe
        titre={`Appliquees (${appliquees.length})`}
        vide="Aucune lecon n est encore appliquee."
        aide="Ces corrections sont posees automatiquement sur les transcriptions neuves. Retirez celle qui ne se generalise pas : le retrait est definitif, le couple ne reviendra pas meme s il est corrige a nouveau."
        lecons={appliquees}
        surEcarter={ecarter}
        occupe={occupe}
        accent="border-ok bg-ok-soft"
      />

      <Groupe
        titre={`Observees, pas encore appliquees (${observees.length})`}
        vide="Rien en attente."
        aide={`Vues une fois seulement. Il en faut ${donnees.seuil} dans des consultations differentes : une correction isolee peut etre une faute de frappe ou un mot rare.`}
        lecons={observees}
        surEcarter={ecarter}
        occupe={occupe}
        accent="border-line bg-paper"
      />

      {ecartees.length > 0 && (
        <Groupe
          titre={`Ecartees (${ecartees.length})`}
          vide=""
          aide="Retirees par un relecteur. Elles ne seront plus proposees."
          lecons={ecartees}
          occupe={occupe}
          accent="border-line bg-paper opacity-60"
        />
      )}

      {peutExporter && (
        <section className="card-pad">
          <h3 className="section-title mb-1">Emporter ces corrections</h3>
          <p className="mb-3 text-sm leading-relaxed text-ink-soft">
            Pour un re-entrainement ulterieur, sur une machine dediee. Entrainer un modele sur des
            consultations est un <strong>traitement de donnees de sante a part entiere</strong>, avec sa
            propre base juridique : ce n est pas une operation que l application declenche seule. Le
            telechargement est inscrit au journal.
          </p>
          <a className="btn-secondary btn-sm" href="/api/admin/apprentissage?format=jsonl" download>
            Telecharger (JSONL)
          </a>
        </section>
      )}
    </div>
  );
}

function Groupe({
  titre,
  aide,
  vide,
  lecons,
  surEcarter,
  occupe,
  accent,
}: {
  titre: string;
  aide: string;
  vide: string;
  lecons: Lecon[];
  surEcarter?: (l: Lecon) => void;
  occupe: string | null;
  accent: string;
}) {
  if (lecons.length === 0 && !vide) return null;

  return (
    <section className="card-pad">
      <h3 className="section-title mb-1">{titre}</h3>
      <p className="mb-3 text-xs leading-relaxed text-ink-soft">{aide}</p>

      {lecons.length === 0 ? (
        <p className="text-sm text-ink-soft">{vide}</p>
      ) : (
        <ul className="space-y-2">
          {lecons.map((l) => (
            <li key={`${l.avant}>${l.apres}`} className={`rounded-lg border p-3 ${accent}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-mono text-ink-soft line-through">{l.avant_affiche}</span>
                    <span aria-hidden className="mx-2 text-ink-soft">
                      →
                    </span>
                    <span className="font-mono font-medium">{l.apres}</span>
                  </p>
                  {l.contexte && (
                    <p className="mt-1 text-xs italic text-ink-soft" title="Phrase ou la correction a ete vue">
                      « {l.contexte} »
                    </p>
                  )}
                  <p className="mt-1 text-xs text-ink-soft">
                    {l.consultations} consultation{l.consultations > 1 ? 's' : ''}
                  </p>
                </div>
                {surEcarter && (
                  <button
                    className="btn-secondary btn-sm shrink-0"
                    onClick={() => surEcarter(l)}
                    disabled={occupe === `${l.avant}>${l.apres}`}
                    title="Retrait definitif : ce couple ne sera plus propose"
                  >
                    {occupe === `${l.avant}>${l.apres}` ? 'Retrait...' : 'Ecarter'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
