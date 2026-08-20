'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function StartConsultation({
  patientId,
  label = 'Demarrer une consultation',
  className = 'btn-primary',
}: {
  patientId: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    try {
      const res = await fetch('/api/consultations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId }),
      });
      const data = await res.json();
      if (res.ok) router.push(`/consultations/${data.consultation.id}`);
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  return (
    <button className={className} onClick={start} disabled={busy}>
      {busy ? 'Ouverture...' : label}
    </button>
  );
}
