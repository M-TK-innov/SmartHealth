import type { SafetyAlert } from '@/lib/types';

const STYLE: Record<SafetyAlert['severity'], { box: string; chip: string; label: string }> = {
  contraindicated: {
    box: 'border-danger bg-danger-soft',
    chip: 'bg-danger text-white',
    label: 'Contre-indication',
  },
  major: { box: 'border-warn bg-warn-soft', chip: 'bg-warn text-white', label: 'Majeure' },
  moderate: { box: 'border-line bg-warn-soft', chip: 'bg-warn-soft text-warn', label: 'Moderee' },
  info: { box: 'border-line bg-paper', chip: 'bg-white text-ink-soft', label: 'Information' },
};

const KIND_LABEL: Record<SafetyAlert['kind'], string> = {
  allergy: 'Allergie',
  interaction: 'Interaction',
  pregnancy: 'Grossesse',
  renal: 'Fonction renale',
  hepatic: 'Fonction hepatique',
  pediatric: 'Pediatrie',
  duplicate: 'Redondance',
  dosage: 'Posologie',
  formulary: 'Formulaire',
};

export function SafetyAlerts({ alerts, compact }: { alerts: SafetyAlert[]; compact?: boolean }) {
  if (!alerts.length) {
    return (
      <p className="rounded-lg border border-line bg-ok-soft p-3 text-sm text-ok">
        Aucune alerte de securite detectee sur cette ordonnance. Le controle porte sur les allergies documentees, les
        interactions du formulaire embarque, le terrain (grossesse, rein, foie, age) et la posologie.
      </p>
    );
  }

  const order: SafetyAlert['severity'][] = ['contraindicated', 'major', 'moderate', 'info'];
  const sorted = [...alerts].sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  return (
    <ul className="space-y-2">
      {sorted.map((a, i) => {
        const s = STYLE[a.severity];
        return (
          <li key={i} className={`rounded-lg border p-3 ${s.box}`}>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className={`chip ${s.chip}`}>{s.label}</span>
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {KIND_LABEL[a.kind]}
              </span>
              {!compact && a.items.length > 0 && (
                <span className="text-xs text-ink-soft">{a.items.join(' · ')}</span>
              )}
            </div>
            <p className="text-sm">{a.message}</p>
            {a.advice && <p className="mt-1 text-xs text-ink-soft">Conduite a tenir : {a.advice}</p>}
          </li>
        );
      })}
    </ul>
  );
}
