'use client';

import { useEffect, useState } from 'react';
import type { ProposedMedication } from '@/lib/ai/schema';
import type { Prescription, PrescriptionItem, SafetyAlert } from '@/lib/types';
import { SafetyAlerts } from '@/components/SafetyAlerts';

interface DrugOption {
  dci: string;
  atc: string;
  forms: string[];
  strengths: string[];
  className: string;
  essential: boolean;
  pregnancy: string;
  notes: string | null;
}

const EMPTY_LINE: ProposedMedication = {
  dci: '',
  form: 'comprime',
  strength: '',
  dose: '1 comprime',
  route: 'oral',
  frequency: '3 fois par jour',
  frequencyPerDay: 3,
  durationDays: 5,
  spokenByClinician: false,
};

export function PrescriptionPanel({
  items,
  onItemsChange,
  prescription,
  savedItems,
  safetyAlerts,
  onValidate,
  onCancel,
  busy,
  locked,
}: {
  items: ProposedMedication[];
  onItemsChange: (items: ProposedMedication[]) => void;
  prescription: Prescription | null;
  savedItems: PrescriptionItem[];
  safetyAlerts: SafetyAlert[];
  onValidate: (opts: { note?: string; overrideJustification?: string }) => Promise<void>;
  onCancel: (reason: string) => Promise<void>;
  busy: boolean;
  locked: boolean;
}) {
  const [catalog, setCatalog] = useState<DrugOption[]>([]);
  const [note, setNote] = useState('');
  const [override, setOverride] = useState('');

  useEffect(() => {
    fetch('/api/drugs')
      .then((r) => r.json())
      .then((d) => setCatalog(d.drugs ?? []))
      .catch(() => setCatalog([]));
  }, []);

  const validated = prescription?.status === 'validated';
  const cancelled = prescription?.status === 'cancelled';
  const blocking = safetyAlerts.filter((a) => a.severity === 'contraindicated');

  const patch = (i: number, data: Partial<ProposedMedication>) => {
    onItemsChange(items.map((it, k) => (k === i ? { ...it, ...data } : it)));
  };

  const applyDrug = (i: number, dci: string) => {
    const def = catalog.find((d) => d.dci === dci);
    patch(i, {
      dci,
      atcCode: def?.atc,
      form: def?.forms[0] ?? items[i].form,
      strength: def?.strengths[0] ?? items[i].strength,
      route: def?.forms[0] === 'injectable' ? 'intramusculaire' : 'oral',
    });
  };

  // ------------------------------------------------------- ordonnance figee
  if (validated || cancelled) {
    return (
      <div className="space-y-4">
        <div
          className={`rounded-xl border p-4 ${
            validated ? 'border-ok bg-ok-soft' : 'border-line bg-paper'
          }`}
        >
          <h3 className="text-sm font-bold">
            {validated ? 'Ordonnance validee par le medecin' : 'Ordonnance annulee'}
          </h3>
          <p className="mt-1 text-xs text-ink-soft">
            {validated
              ? `Validee le ${prescription?.validated_at}. Elle a desormais valeur de prescription et peut etre imprimee ou transmise a la pharmacie (HL7 RDE^O11 / FHIR MedicationRequest actif).`
              : prescription?.cancelled_reason}
          </p>
          {prescription?.validation_note && (
            <p className="mt-1 text-xs text-ink-soft">Note : {prescription.validation_note}</p>
          )}
        </div>

        <ol className="card divide-y divide-line">
          {savedItems.map((it) => (
            <li key={it.id} className="px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="font-semibold">{it.drug_name}</span>
                <span className="text-sm">{it.strength}</span>
                <span className="text-xs text-ink-soft">{it.form}</span>
                {it.is_essential_list === 1 && (
                  <span className="chip bg-brand-soft text-brand-dark">liste essentielle</span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-ink-soft">
                {[it.dose, it.frequency, it.duration_days ? `pendant ${it.duration_days} jours` : null, it.instructions]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </li>
          ))}
        </ol>

        {validated && (
          <a className="btn-ghost no-print" href={`/ordonnance/${prescription?.id}`} target="_blank" rel="noreferrer">
            Ouvrir la version imprimable
          </a>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------- mode brouillon
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-warn bg-warn-soft p-3 text-sm">
        <strong>Projet d ordonnance genere par l IA — sans valeur legale.</strong> Relisez chaque ligne, corrigez
        posologie et duree, puis validez. Tant que vous n avez pas valide, aucune delivrance n est possible.
      </div>

      <ol className="space-y-3">
        {items.map((it, i) => {
          const def = catalog.find((d) => d.dci === it.dci);
          return (
            <li key={i} className="card-pad">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-ink-soft">Ligne {i + 1}</span>
                <div className="flex items-center gap-2">
                  {it.spokenByClinician ? (
                    <span className="chip bg-ok-soft text-ok">prononce en consultation</span>
                  ) : (
                    <span className="chip bg-warn-soft text-warn">suggestion IA</span>
                  )}
                  <button
                    className="btn-ghost btn-sm"
                    disabled={locked}
                    onClick={() => onItemsChange(items.filter((_, k) => k !== i))}
                  >
                    Retirer
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="col-span-2">
                  <label className="label">Denomination (DCI)</label>
                  <input
                    className="input"
                    list="formulaire-dci"
                    value={it.dci}
                    disabled={locked}
                    onChange={(e) => applyDrug(i, e.target.value)}
                    placeholder="ex : Amoxicilline"
                  />
                </div>
                <div>
                  <label className="label">Dosage</label>
                  <input
                    className="input"
                    list={`strengths-${i}`}
                    value={it.strength ?? ''}
                    disabled={locked}
                    onChange={(e) => patch(i, { strength: e.target.value })}
                  />
                  <datalist id={`strengths-${i}`}>
                    {def?.strengths.map((s) => <option key={s} value={s} />)}
                  </datalist>
                </div>
                <div>
                  <label className="label">Forme</label>
                  <input
                    className="input"
                    list={`forms-${i}`}
                    value={it.form ?? ''}
                    disabled={locked}
                    onChange={(e) => patch(i, { form: e.target.value })}
                  />
                  <datalist id={`forms-${i}`}>{def?.forms.map((f) => <option key={f} value={f} />)}</datalist>
                </div>
                <div>
                  <label className="label">Posologie unitaire</label>
                  <input
                    className="input"
                    value={it.dose ?? ''}
                    disabled={locked}
                    onChange={(e) => patch(i, { dose: e.target.value })}
                    placeholder="1 comprime"
                  />
                </div>
                <div>
                  <label className="label">Prises / jour</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={12}
                    value={it.frequencyPerDay ?? ''}
                    disabled={locked}
                    onChange={(e) =>
                      patch(i, {
                        frequencyPerDay: e.target.value ? Number(e.target.value) : undefined,
                        frequency: e.target.value ? `${e.target.value} fois par jour` : undefined,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="label">Duree (jours)</label>
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={365}
                    value={it.durationDays ?? ''}
                    disabled={locked}
                    onChange={(e) => patch(i, { durationDays: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
                <div>
                  <label className="label">Voie</label>
                  <select
                    className="input"
                    value={it.route ?? 'oral'}
                    disabled={locked}
                    onChange={(e) => patch(i, { route: e.target.value })}
                  >
                    {['oral', 'intramusculaire', 'intraveineuse', 'sous-cutanee', 'rectale', 'cutanee', 'inhalee', 'vaginale', 'oculaire'].map(
                      (r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ),
                    )}
                  </select>
                </div>
                <div className="col-span-2 md:col-span-4">
                  <label className="label">Instructions au patient</label>
                  <input
                    className="input"
                    value={it.instructions ?? ''}
                    disabled={locked}
                    onChange={(e) => patch(i, { instructions: e.target.value })}
                    placeholder="ex : a prendre au cours des repas"
                  />
                </div>
              </div>

              {def?.notes && (
                <p className="mt-2 rounded bg-paper p-2 text-xs text-ink-soft">{def.notes}</p>
              )}
              {it.rationale && (
                <p className="mt-2 text-xs italic text-ink-soft">Justification IA : {it.rationale}</p>
              )}
              {it.quote && <p className="mt-1 text-[11px] italic text-ink-soft">« {it.quote} »</p>}
            </li>
          );
        })}
      </ol>

      <datalist id="formulaire-dci">
        {catalog.map((d) => (
          <option key={d.dci} value={d.dci}>
            {d.className}
          </option>
        ))}
      </datalist>

      <button className="btn-ghost" disabled={locked} onClick={() => onItemsChange([...items, { ...EMPTY_LINE }])}>
        + Ajouter une ligne
      </button>

      <div>
        <h3 className="section-title mb-2">Controle de securite</h3>
        <SafetyAlerts alerts={safetyAlerts} />
      </div>

      {!prescription && items.length > 0 && (
        <p className="rounded-lg border border-line bg-paper p-3 text-sm text-ink-soft">
          Enregistrez d abord la consultation dans le dossier (etape « Revue IA ») pour creer l ordonnance en
          brouillon. Elle pourra ensuite etre validee ici.
        </p>
      )}

      {prescription?.status === 'draft' && (
        <div className="card-pad space-y-3">
          <div>
            <label className="label">Note de validation (facultative)</label>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ex : revue avec le patient, allergie verifiee"
            />
          </div>

          {blocking.length > 0 && (
            <div>
              <label className="label text-danger">
                Justification obligatoire — {blocking.length} contre-indication(s)
              </label>
              <textarea
                className="input"
                rows={3}
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                placeholder="Expliquez pourquoi vous prescrivez malgre la contre-indication. Ce texte est archive dans le journal."
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              className="btn-primary"
              disabled={busy || items.length === 0 || (blocking.length > 0 && !override.trim())}
              onClick={() => onValidate({ note: note || undefined, overrideJustification: override || undefined })}
            >
              Valider et signer l ordonnance
            </button>
            <button
              className="btn-ghost"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt("Motif d'annulation de l'ordonnance ?");
                if (reason) onCancel(reason);
              }}
            >
              Annuler l ordonnance
            </button>
          </div>
          <p className="text-xs text-ink-soft">
            En validant, vous engagez votre responsabilite de prescripteur. L horodatage, votre identifiant et
            l eventuelle derogation sont inscrits au journal d audit de facon inalterable.
          </p>
        </div>
      )}
    </div>
  );
}
