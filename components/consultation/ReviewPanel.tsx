'use client';

import type { ClinicalExtraction } from '@/lib/ai/schema';
import type { CommitSelection } from '@/lib/repo';

export type SelectionKey = keyof CommitSelection;

function Confidence({ value }: { value?: number }) {
  if (value === undefined) return null;
  const pct = Math.round(value * 100);
  const tone = pct >= 80 ? 'text-ok' : pct >= 55 ? 'text-warn' : 'text-danger';
  return <span className={`text-[11px] font-semibold ${tone}`}>{pct} %</span>;
}

function Quote({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="mt-1 border-l-2 border-line pl-2 text-[11px] italic leading-snug text-ink-soft">
      « {text} »
    </p>
  );
}

function Group<T>({
  title,
  hint,
  items,
  selected,
  onToggle,
  onToggleAll,
  render,
}: {
  title: string;
  hint?: string;
  items: T[];
  selected: number[];
  onToggle: (i: number) => void;
  onToggleAll: (all: boolean) => void;
  render: (item: T) => React.ReactNode;
}) {
  if (!items.length) return null;
  const allSelected = selected.length === items.length;
  return (
    <section className="card">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <div>
          <h3 className="text-sm font-semibold">
            {title} <span className="text-ink-soft">({items.length})</span>
          </h3>
          {hint && <p className="text-[11px] text-ink-soft">{hint}</p>}
        </div>
        <button className="btn-ghost btn-sm" onClick={() => onToggleAll(!allSelected)}>
          {allSelected ? 'Tout decocher' : 'Tout cocher'}
        </button>
      </header>
      <ul className="divide-y divide-line">
        {items.map((item, i) => (
          <li key={i} className={`px-4 py-2.5 ${selected.includes(i) ? '' : 'opacity-55'}`}>
            <label className="flex cursor-pointer items-start gap-2.5">
              <input
                type="checkbox"
                checked={selected.includes(i)}
                onChange={() => onToggle(i)}
                className="mt-1 h-4 w-4 shrink-0 accent-brand"
              />
              <div className="min-w-0 flex-1">{render(item)}</div>
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReviewPanel({
  extraction,
  selection,
  onSelectionChange,
}: {
  extraction: ClinicalExtraction;
  selection: Required<CommitSelection>;
  onSelectionChange: (s: Required<CommitSelection>) => void;
}) {
  const toggle = (key: SelectionKey, i: number) => {
    const current = selection[key];
    onSelectionChange({
      ...selection,
      [key]: current.includes(i) ? current.filter((x) => x !== i) : [...current, i].sort((a, b) => a - b),
    });
  };
  const toggleAll = (key: SelectionKey, count: number, all: boolean) => {
    onSelectionChange({ ...selection, [key]: all ? Array.from({ length: count }, (_, i) => i) : [] });
  };

  const e = extraction;
  const totalSelected =
    selection.vitals.length +
    selection.diagnoses.length +
    selection.allergies.length +
    selection.history.length +
    selection.medications.length +
    selection.investigations.length;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-white p-3 text-sm">
        <strong>{totalSelected}</strong> element(s) seront ecrits dans le dossier medical. Decochez ce que vous ne
        validez pas : rien n est enregistre sans votre accord explicite.
      </div>

      {e.chiefComplaint && (
        <div className="card-pad">
          <h3 className="section-title mb-1">Motif de consultation</h3>
          <p className="text-sm">{e.chiefComplaint}</p>
        </div>
      )}

      <Group
        title="Constantes et mesures"
        hint="Enregistrees comme Observation FHIR, codees LOINC."
        items={e.vitals}
        selected={selection.vitals}
        onToggle={(i) => toggle('vitals', i)}
        onToggleAll={(all) => toggleAll('vitals', e.vitals.length, all)}
        render={(v) => (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">{v.label}</span>
              <span className="text-sm font-bold text-brand-dark">
                {v.value ?? v.valueText} {v.unit}
              </span>
              {v.loincCode && <code className="text-[11px]">LOINC {v.loincCode}</code>}
              <Confidence value={v.confidence} />
            </div>
            <Quote text={v.quote} />
          </>
        )}
      />

      <Group
        title="Diagnostics"
        hint="Codes CIM-10. Un diagnostic confirme rejoint aussi la liste des problemes du patient."
        items={e.diagnoses}
        selected={selection.diagnoses}
        onToggle={(i) => toggle('diagnoses', i)}
        onToggleAll={(all) => toggleAll('diagnoses', e.diagnoses.length, all)}
        render={(d) => (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">{d.label}</span>
              {d.icd10Code && <code className="text-[11px]">CIM-10 {d.icd10Code}</code>}
              <span className="chip bg-paper text-ink-soft">
                {{ suspected: 'suspecte', confirmed: 'confirme', differential: 'differentiel', 'ruled-out': 'ecarte' }[
                  d.certainty
                ] ?? d.certainty}
              </span>
              <Confidence value={d.confidence} />
            </div>
            {d.rationale && <p className="mt-0.5 text-xs text-ink-soft">{d.rationale}</p>}
            <Quote text={d.quote} />
          </>
        )}
      />

      <Group
        title="Allergies"
        hint="Alimentent le controle de securite de toutes les ordonnances futures."
        items={e.allergies}
        selected={selection.allergies}
        onToggle={(i) => toggle('allergies', i)}
        onToggleAll={(all) => toggleAll('allergies', e.allergies.length, all)}
        render={(a) => (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">{a.substance}</span>
              {a.reaction && <span className="text-xs text-ink-soft">{a.reaction}</span>}
              {a.criticality === 'high' && <span className="chip bg-danger text-white">critique</span>}
              <Confidence value={a.confidence} />
            </div>
            <Quote text={a.quote} />
          </>
        )}
      />

      <Group
        title="Antecedents"
        hint="Ajoutes a la liste des problemes persistants du dossier."
        items={e.history}
        selected={selection.history}
        onToggle={(i) => toggle('history', i)}
        onToggleAll={(all) => toggleAll('history', e.history.length, all)}
        render={(h) => (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="chip bg-brand-soft text-brand-dark">
                {{ medical: 'medical', surgical: 'chirurgical', family: 'familial', obstetric: 'obstetrical', immunisation: 'vaccinal' }[
                  h.type
                ] ?? h.type}
              </span>
              <span className="text-sm font-medium">{h.label}</span>
              {h.icd10Code && <code className="text-[11px]">CIM-10 {h.icd10Code}</code>}
              <Confidence value={h.confidence} />
            </div>
            <Quote text={h.quote} />
          </>
        )}
      />

      <Group
        title="Traitements en cours"
        hint="Enregistres comme traitement de fond : pris en compte dans les interactions."
        items={e.currentMedications}
        selected={selection.medications}
        onToggle={(i) => toggle('medications', i)}
        onToggleAll={(all) => toggleAll('medications', e.currentMedications.length, all)}
        render={(m) => (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">{m.name}</span>
              {m.dose && <span className="text-xs text-ink-soft">{m.dose}</span>}
              {m.atcCode && <code className="text-[11px]">ATC {m.atcCode}</code>}
              <Confidence value={m.confidence} />
            </div>
            <Quote text={m.quote} />
          </>
        )}
      />

      <Group
        title="Examens demandes"
        hint="Generent des ServiceRequest FHIR transmissibles au laboratoire (HL7 ORM)."
        items={e.investigations}
        selected={selection.investigations}
        onToggle={(i) => toggle('investigations', i)}
        onToggleAll={(all) => toggleAll('investigations', e.investigations.length, all)}
        render={(inv) => (
          <>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm font-medium">{inv.label}</span>
              {inv.loincCode && <code className="text-[11px]">LOINC {inv.loincCode}</code>}
              {inv.priority && inv.priority !== 'routine' && (
                <span className="chip bg-warn text-white">{inv.priority}</span>
              )}
              <Confidence value={inv.confidence} />
            </div>
            {inv.reason && <p className="mt-0.5 text-xs text-ink-soft">{inv.reason}</p>}
            <Quote text={inv.quote} />
          </>
        )}
      />

      {e.symptoms.length > 0 && (
        <div className="card-pad">
          <h3 className="section-title mb-2">Symptomes releves</h3>
          <div className="flex flex-wrap gap-1.5">
            {e.symptoms.map((s, i) => (
              <span
                key={i}
                title={s.quote}
                className={`chip ${
                  s.negated ? 'bg-paper text-ink-soft line-through' : 'bg-brand-soft text-brand-dark'
                }`}
              >
                {s.label}
                {s.duration ? ` · ${s.duration}` : ''}
              </span>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-soft">
            Les symptomes barres sont ceux que le patient a nies. Ils sont conserves dans le compte rendu : une
            negation est une information clinique.
          </p>
        </div>
      )}

      {e.redFlags.length > 0 && (
        <div className="rounded-xl border border-danger bg-danger-soft p-4">
          <h3 className="section-title mb-2 text-danger">Signes de gravite a expliquer au patient</h3>
          <ul className="list-disc pl-5 text-sm">
            {e.redFlags.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {e.uncertainties.length > 0 && (
        <div className="rounded-xl border border-warn bg-warn-soft p-4">
          <h3 className="section-title mb-2 text-warn">Ce que l IA n a pas pu determiner</h3>
          <ul className="list-disc pl-5 text-sm">
            {e.uncertainties.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
