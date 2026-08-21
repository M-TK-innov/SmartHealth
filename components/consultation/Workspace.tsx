'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ClinicalExtraction, ProposedMedication } from '@/lib/ai/schema';
import type {
  Consultation,
  Patient,
  Practitioner,
  Prescription,
  PrescriptionItem,
  SafetyAlert,
  TranscriptSegment,
} from '@/lib/types';
import type { CommitSelection } from '@/lib/repo';
import { Recorder, type Segment } from '@/components/Recorder';
import { ReviewPanel } from '@/components/consultation/ReviewPanel';
import { PrescriptionPanel } from '@/components/consultation/PrescriptionPanel';
import { Markdown } from '@/components/Markdown';
import { EXPORT_LABELS } from '@/lib/interop/labels';

type RxWithItems = Prescription & { items: PrescriptionItem[] };

interface Props {
  consultation: Consultation;
  patient: Patient;
  practitioner: Practitioner | null;
  segments: TranscriptSegment[];
  extraction: ClinicalExtraction | null;
  prescriptions: RxWithItems[];
  report: string;
}

const STEPS = [
  { key: 'capture', label: '1. Ecoute' },
  { key: 'review', label: '2. Revue IA' },
  { key: 'prescription', label: '3. Ordonnance' },
  { key: 'report', label: '4. Compte rendu' },
  { key: 'interop', label: '5. Interoperabilite' },
] as const;
type Step = (typeof STEPS)[number]['key'];

const EMPTY_SELECTION: Required<CommitSelection> = {
  vitals: [],
  diagnoses: [],
  allergies: [],
  history: [],
  medications: [],
  investigations: [],
};

const allIndexes = (n: number) => Array.from({ length: n }, (_, i) => i);

export function Workspace(props: Props) {
  const router = useRouter();
  const [consultation, setConsultation] = useState(props.consultation);
  const [patient, setPatient] = useState(props.patient);
  const [segments, setSegments] = useState<TranscriptSegment[]>(props.segments);
  const [extraction, setExtraction] = useState<ClinicalExtraction | null>(props.extraction);
  const [prescriptions, setPrescriptions] = useState<RxWithItems[]>(props.prescriptions);
  const [report, setReport] = useState(props.report);
  const [step, setStep] = useState<Step>(props.extraction ? 'review' : 'capture');

  const [selection, setSelection] = useState<Required<CommitSelection>>(EMPTY_SELECTION);
  const [rxItems, setRxItems] = useState<ProposedMedication[]>(props.extraction?.proposedPrescription ?? []);
  const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>([]);
  const [patientUpdates, setPatientUpdates] = useState<Record<string, unknown>>({});

  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const [engineInfo, setEngineInfo] = useState<{ engine: string; degraded: boolean } | null>(
    consultation.analysis_engine ? { engine: consultation.analysis_engine, degraded: consultation.analysis_engine === 'local-rules' } : null,
  );
  const [manualTranscript, setManualTranscript] = useState('');
  const [editingTranscript, setEditingTranscript] = useState(false);

  const bufferRef = useRef<Segment[]>([]);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const signed = consultation.status === 'signed';
  const draftRx = prescriptions.find((p) => p.status === 'draft') ?? null;
  const activeRx = prescriptions.find((p) => p.status === 'validated') ?? draftRx ?? prescriptions[0] ?? null;

  // ------------------------------------------------------------ transcription

  const flush = useCallback(async () => {
    const batch = bufferRef.current;
    if (!batch.length) return;
    bufferRef.current = [];
    try {
      const res = await fetch(`/api/consultations/${consultation.id}/transcript`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments: batch }),
      });
      const data = await res.json();
      if (res.ok) setSegments(data.segments);
    } catch {
      // hors-ligne : on remet les segments en file, ils partiront au prochain envoi
      bufferRef.current = [...batch, ...bufferRef.current];
      setMessage({ tone: 'warn', text: 'Reseau indisponible : la transcription est mise en attente localement.' });
    }
  }, [consultation.id]);

  const onSegment = useCallback(
    (s: Segment) => {
      bufferRef.current.push(s);
      // affichage optimiste immediat
      setSegments((prev) => [
        ...prev,
        {
          id: `local-${prev.length}-${s.text.length}`,
          consultation_id: consultation.id,
          seq: prev.length + 1,
          speaker: s.speaker,
          text: s.text,
          start_ms: s.startMs ?? null,
          end_ms: null,
          confidence: s.confidence ?? null,
          language: null,
          is_final: 1,
          created_at: new Date().toISOString(),
        },
      ]);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flush, 2500);
    },
    [consultation.id, flush],
  );

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    };
  }, []);

  const transcriptText = useMemo(
    () =>
      segments
        .map((s) => {
          const label =
            s.speaker === 'clinician' ? 'Medecin' : s.speaker === 'patient' ? 'Patient' : s.speaker === 'companion' ? 'Accompagnant' : '';
          return label ? `[${label}] ${s.text}` : s.text;
        })
        .join('\n'),
    [segments],
  );

  async function saveManualTranscript() {
    setBusy('transcript');
    try {
      const res = await fetch(`/api/consultations/${consultation.id}/transcript`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: manualTranscript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSegments(data.segments);
      setEditingTranscript(false);
      setMessage({ tone: 'ok', text: 'Transcription mise a jour.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(null);
    }
  }

  async function setConsent(v: boolean) {
    setConsultation((c) => ({ ...c, consent_recording: v ? 1 : 0 }));
    await fetch(`/api/consultations/${consultation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent_recording: v ? 1 : 0 }),
    }).catch(() => undefined);
  }

  // ---------------------------------------------------------------- analyse

  async function analyze() {
    await flush();
    setBusy('analyze');
    setMessage(null);
    try {
      const res = await fetch(`/api/consultations/${consultation.id}/analyze`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const e = data.extraction as ClinicalExtraction;
      setExtraction(e);
      setReport(data.report);
      setRxItems(e.proposedPrescription);
      setSafetyAlerts(data.safetyAlerts ?? []);
      setEngineInfo({ engine: data.engine, degraded: data.degraded });
      // par defaut tout est pre-coche : le medecin decoche ce qu'il refuse
      setSelection({
        vitals: allIndexes(e.vitals.length),
        diagnoses: allIndexes(e.diagnoses.length),
        allergies: allIndexes(e.allergies.length),
        history: allIndexes(e.history.length),
        medications: allIndexes(e.currentMedications.length),
        investigations: allIndexes(e.investigations.length),
      });
      setPatientUpdates(proposePatientUpdates(patient, e));
      setStep('review');
      if (data.warning) setMessage({ tone: 'warn', text: data.warning });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Analyse impossible' });
    } finally {
      setBusy(null);
    }
  }

  // ------------------------------------------------------------- integration

  async function commit() {
    if (!extraction) return;
    setBusy('commit');
    setMessage(null);
    try {
      const res = await fetch(`/api/consultations/${consultation.id}/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          extraction,
          selection,
          patientUpdates,
          prescriptionItems: rxItems.filter((i) => i.dci.trim()),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setConsultation(data.consultation);
      setPatient(data.patient);
      setPrescriptions(data.prescriptions);
      setReport(data.report);
      setSafetyAlerts(data.result.safetyAlerts ?? []);
      const r = data.result;
      setMessage({
        tone: 'ok',
        text: `Dossier enrichi : ${r.observations} constante(s), ${r.diagnoses} diagnostic(s), ${r.problems} probleme(s), ${r.allergies} allergie(s), ${r.serviceRequests} examen(s).${
          r.prescriptionId ? ' Ordonnance creee en brouillon.' : ''
        }`,
      });
      if (r.prescriptionId) setStep('prescription');
      router.refresh();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Enregistrement impossible' });
    } finally {
      setBusy(null);
    }
  }

  // ------------------------------------------------------------- ordonnance

  async function saveRxItems() {
    if (!draftRx) return;
    setBusy('rx');
    try {
      const res = await fetch(`/api/prescriptions/${draftRx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: rxItems
            .filter((i) => i.dci.trim())
            .map((i) => ({
              drug_name: i.dci,
              atc_code: i.atcCode,
              form: i.form,
              strength: i.strength,
              dose: i.dose,
              route: i.route,
              frequency: i.frequency,
              frequency_per_day: i.frequencyPerDay,
              duration_days: i.durationDays,
              instructions: i.instructions,
              ai_confidence: i.confidence,
              ai_rationale: i.rationale,
              edited_by_clinician: true,
            })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSafetyAlerts(data.safetyAlerts);
      setPrescriptions((prev) => prev.map((p) => (p.id === draftRx.id ? { ...data.prescription, items: data.items } : p)));
      setMessage({ tone: 'ok', text: 'Ordonnance enregistree et re-controlee.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(null);
    }
  }

  async function validateRx(opts: { note?: string; overrideJustification?: string }) {
    if (!draftRx) return;
    setBusy('validate');
    try {
      await saveRxItems();
      const res = await fetch(`/api/prescriptions/${draftRx.id}/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(opts),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPrescriptions((prev) => prev.map((p) => (p.id === draftRx.id ? { ...data.prescription, items: data.items } : p)));
      setSafetyAlerts(data.safetyAlerts ?? []);
      setMessage({ tone: 'ok', text: 'Ordonnance validee. Elle a maintenant valeur de prescription.' });
      router.refresh();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Validation impossible' });
    } finally {
      setBusy(null);
    }
  }

  async function cancelRx(reason: string) {
    if (!draftRx) return;
    setBusy('cancel');
    try {
      const res = await fetch(`/api/prescriptions/${draftRx.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPrescriptions((prev) => prev.map((p) => (p.id === draftRx.id ? { ...data.prescription, items: p.items } : p)));
      setMessage({ tone: 'ok', text: 'Ordonnance annulee.' });
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(null);
    }
  }

  // ----------------------------------------------------------------- signature

  async function sign(force = false) {
    setBusy('sign');
    try {
      const res = await fetch(`/api/consultations/${consultation.id}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report, force }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setConsultation(data.consultation);
      setMessage({ tone: 'ok', text: 'Compte rendu signe. La consultation est cloturee et archivee.' });
      router.refresh();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Signature impossible' });
    } finally {
      setBusy(null);
    }
  }

  async function saveReport() {
    setBusy('report');
    try {
      await fetch(`/api/consultations/${consultation.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_markdown: report }),
      });
      setMessage({ tone: 'ok', text: 'Compte rendu enregistre.' });
    } finally {
      setBusy(null);
    }
  }

  // --------------------------------------------------------------------- UI

  return (
    <div className="space-y-4">
      {/* Sur telephone les 5 etapes ne tiennent pas cote a cote : la barre
          defile horizontalement plutot que d'ecraser les libelles. */}
      <nav className="no-print -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 rounded-xl border border-line bg-white p-1 sm:min-w-0">
          {STEPS.map((s) => (
            <button
              key={s.key}
              onClick={() => setStep(s.key)}
              aria-current={step === s.key ? 'step' : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-1 sm:shrink ${
                step === s.key ? 'bg-brand text-white' : 'text-ink-soft hover:bg-paper'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </nav>

      {message && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            message.tone === 'ok'
              ? 'border-ok bg-ok-soft text-ok'
              : message.tone === 'warn'
                ? 'border-warn bg-warn-soft text-warn'
                : 'border-danger bg-danger-soft text-danger'
          }`}
        >
          {message.text}
        </div>
      )}

      {signed && (
        <div className="rounded-lg border border-ok bg-ok-soft p-3 text-sm text-ok">
          Consultation signee le {consultation.signed_at} : le dossier est verrouille en ecriture.
        </div>
      )}

      {/* ------------------------------------------------------------ ETAPE 1 */}
      {step === 'capture' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <Recorder
              consent={consultation.consent_recording === 1}
              onConsentChange={setConsent}
              onSegment={onSegment}
              disabled={signed}
            />
            <div className="card-pad">
              <h2 className="section-title mb-2">Saisie manuelle</h2>
              <p className="mb-2 text-xs text-ink-soft">
                Sans micro ou pour corriger : collez ou tapez l echange. Prefixez chaque ligne par
                <code> [Medecin] </code> ou <code> [Patient] </code> — l IA distingue alors ce que le patient rapporte
                de ce que le medecin constate.
              </p>
              {!editingTranscript ? (
                <button
                  className="btn-ghost"
                  disabled={signed}
                  onClick={() => {
                    setManualTranscript(transcriptText);
                    setEditingTranscript(true);
                  }}
                >
                  Editer la transcription
                </button>
              ) : (
                <>
                  <textarea
                    className="input font-mono text-xs"
                    rows={12}
                    value={manualTranscript}
                    onChange={(e) => setManualTranscript(e.target.value)}
                    placeholder={'[Patient] Docteur, j ai de la fievre depuis trois jours.\n[Medecin] Votre temperature est a 39 degres.'}
                  />
                  <div className="mt-2 flex gap-2">
                    <button className="btn-primary" onClick={saveManualTranscript} disabled={busy === 'transcript'}>
                      Enregistrer
                    </button>
                    <button className="btn-ghost" onClick={() => setEditingTranscript(false)}>
                      Annuler
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card flex max-h-[70vh] flex-col">
            <header className="flex items-center justify-between border-b border-line px-4 py-2.5">
              <h2 className="section-title">Transcription ({segments.length} segments)</h2>
              <button className="btn-primary btn-sm" onClick={analyze} disabled={busy !== null || !segments.length}>
                {busy === 'analyze' ? 'Analyse en cours...' : 'Analyser la consultation'}
              </button>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {segments.length === 0 && (
                <p className="text-sm text-ink-soft">
                  La transcription apparaitra ici au fil de la conversation.
                </p>
              )}
              {segments.map((s) => (
                <div key={s.id} className={`flex gap-2 ${s.speaker === 'clinician' ? 'flex-row-reverse text-right' : ''}`}>
                  <span
                    className={`chip h-fit shrink-0 ${
                      s.speaker === 'clinician'
                        ? 'bg-brand text-white'
                        : s.speaker === 'patient'
                          ? 'bg-brand-soft text-brand-dark'
                          : 'bg-paper text-ink-soft'
                    }`}
                  >
                    {s.speaker === 'clinician' ? 'Med' : s.speaker === 'patient' ? 'Pat' : 'Acc'}
                  </span>
                  <p className="text-sm leading-snug">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ ETAPE 2 */}
      {step === 'review' && (
        <div className="space-y-4">
          {engineInfo && (
            <div
              className={`rounded-lg border p-3 text-sm ${
                engineInfo.degraded ? 'border-warn bg-warn-soft' : 'border-line bg-white'
              }`}
            >
              Moteur d analyse : <code>{engineInfo.engine}</code>
              {engineInfo.degraded && ' — mode degrade hors-ligne, la couverture est reduite.'}
            </div>
          )}

          {!extraction ? (
            <div className="card-pad text-center">
              <p className="mb-3 text-sm text-ink-soft">Aucune analyse disponible pour cette consultation.</p>
              <button className="btn-primary" onClick={analyze} disabled={busy !== null || !segments.length}>
                Analyser la consultation
              </button>
            </div>
          ) : (
            <>
              {Object.keys(patientUpdates).length > 0 && (
                <div className="card-pad">
                  <h3 className="section-title mb-2">Enrichissement de la fiche patient</h3>
                  <p className="mb-2 text-xs text-ink-soft">
                    Ces champs sont vides dans le dossier et ont ete entendus pendant l echange. Decochez pour ne pas
                    les enregistrer.
                  </p>
                  <div className="space-y-1.5">
                    {Object.entries(patientUpdates).map(([field, value]) => (
                      <label key={field} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked
                          onChange={() =>
                            setPatientUpdates((prev) => {
                              const next = { ...prev };
                              delete next[field];
                              return next;
                            })
                          }
                          className="h-4 w-4 accent-brand"
                        />
                        <span className="text-ink-soft">{FIELD_LABELS[field] ?? field} :</span>
                        <strong>{String(value)}</strong>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <ReviewPanel extraction={extraction} selection={selection} onSelectionChange={setSelection} />

              <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-20 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white p-3 shadow-lg md:bottom-4">
                <button className="btn-primary" onClick={commit} disabled={busy !== null || signed}>
                  {busy === 'commit' ? 'Enregistrement...' : 'Enregistrer dans le dossier medical'}
                </button>
                <button className="btn-ghost" onClick={analyze} disabled={busy !== null || signed}>
                  Relancer l analyse
                </button>
                <span className="text-xs text-ink-soft">
                  Cree aussi le projet d ordonnance ({rxItems.length} ligne{rxItems.length > 1 ? 's' : ''}) en
                  brouillon.
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ ETAPE 3 */}
      {step === 'prescription' && (
        <div className="space-y-3">
          <PrescriptionPanel
            items={rxItems}
            onItemsChange={setRxItems}
            prescription={activeRx}
            savedItems={activeRx?.items ?? []}
            safetyAlerts={safetyAlerts.length ? safetyAlerts : JSON.parse(activeRx?.safety_json || '[]')}
            onValidate={validateRx}
            onCancel={cancelRx}
            busy={busy !== null}
            locked={signed || activeRx?.status === 'validated' || activeRx?.status === 'cancelled'}
          />
          {draftRx && (
            <button className="btn-ghost" onClick={saveRxItems} disabled={busy !== null}>
              Enregistrer les modifications et recontroler
            </button>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------ ETAPE 4 */}
      {step === 'report' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="card-pad no-print">
            <h2 className="section-title mb-2">Compte rendu (Markdown editable)</h2>
            <textarea
              className="input font-mono text-xs"
              rows={26}
              value={report}
              disabled={signed}
              onChange={(e) => setReport(e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-ghost" onClick={saveReport} disabled={busy !== null || signed}>
                Enregistrer
              </button>
              <button className="btn-primary" onClick={() => sign(false)} disabled={busy !== null || signed}>
                {signed ? 'Deja signe' : 'Signer le compte rendu'}
              </button>
              <button className="btn-ghost" onClick={() => window.print()}>
                Imprimer
              </button>
            </div>
            {!signed && (
              <p className="mt-2 text-xs text-ink-soft">
                La signature fige la consultation et lui donne sa valeur medico-legale. Une ordonnance encore en
                brouillon bloque la signature.
              </p>
            )}
          </div>
          <div className="card-pad">
            <Markdown source={report} />
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------ ETAPE 5 */}
      {step === 'interop' && <InteropStep consultationId={consultation.id} />}
    </div>
  );
}

// ------------------------------------------------------------------ interop

function InteropStep({ consultationId }: { consultationId: string }) {
  const [preview, setPreview] = useState<{ format: string; body: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

  async function load(format: string) {
    setLoading(format);
    setSendResult(null);
    try {
      const res = await fetch(`/api/export/${consultationId}?format=${format}&inline=1`);
      const body = await res.text();
      setPreview({ format, body: res.ok ? body : `Erreur : ${body}` });
    } finally {
      setLoading(null);
    }
  }

  async function send(format: string) {
    setLoading(format);
    try {
      const res = await fetch(`/api/export/${consultationId}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format }),
      });
      const data = await res.json();
      setSendResult(res.ok ? `Transmis a ${data.endpoint} (HTTP ${data.status}).` : data.error);
    } catch (e) {
      setSendResult(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <div className="space-y-2">
        {Object.entries(EXPORT_LABELS).map(([format, label]) => (
          <div key={format} className="card p-3">
            <p className="text-sm font-medium">{label}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button className="btn-ghost btn-sm" onClick={() => load(format)} disabled={loading !== null}>
                Apercu
              </button>
              <a className="btn-ghost btn-sm" href={`/api/export/${consultationId}?format=${format}`}>
                Telecharger
              </a>
              {(format === 'fhir-transaction' || format === 'dhis2-event') && (
                <button className="btn-ghost btn-sm" onClick={() => send(format)} disabled={loading !== null}>
                  Transmettre
                </button>
              )}
            </div>
          </div>
        ))}
        {sendResult && (
          <p className="rounded-lg border border-line bg-white p-3 text-xs">{sendResult}</p>
        )}
      </div>

      <div className="card flex max-h-[70vh] flex-col">
        <header className="border-b border-line px-4 py-2.5">
          <h2 className="section-title">{preview ? EXPORT_LABELS[preview.format as keyof typeof EXPORT_LABELS] : 'Apercu'}</h2>
        </header>
        <pre className="flex-1 overflow-auto p-4 text-[11px] leading-relaxed">
          {preview?.body ?? 'Choisissez un format a gauche pour en voir le contenu exact avant transmission.'}
        </pre>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ helpers

const FIELD_LABELS: Record<string, string> = {
  given_name: 'Prenom',
  family_name: 'Nom',
  birth_date: 'Date de naissance',
  gender: 'Sexe',
  phone: 'Telephone',
  address_line: 'Adresse',
  is_pregnant: 'Grossesse',
  weight_kg: 'Poids (kg)',
  insurance_id: 'Numero assurance',
};

/** Champs vides du dossier que l'echange permet de completer. Jamais d'ecrasement. */
function proposePatientUpdates(patient: Patient, e: ClinicalExtraction): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const id = e.identity;

  if (!patient.phone && id.phone) out.phone = id.phone;
  if (!patient.address_line && id.address) out.address_line = id.address;
  if (!patient.insurance_id && id.insuranceId) out.insurance_id = id.insuranceId;
  if (patient.gender === 'unknown' && id.gender && id.gender !== 'unknown') out.gender = id.gender;
  if (!patient.is_pregnant && id.isPregnant) out.is_pregnant = 1;

  if (!patient.birth_date && id.age !== undefined) {
    const years = id.ageUnit === 'months' ? id.age / 12 : id.ageUnit === 'days' ? id.age / 365 : id.age;
    const year = new Date().getFullYear() - Math.round(years);
    out.birth_date = `${year}-01-01`;
    out.birth_date_estimated = 1;
  }

  const generic = /^(inconnu|unknown|patient)$/i;
  if (generic.test(patient.given_name) && id.givenName) out.given_name = id.givenName;
  if (generic.test(patient.family_name) && id.familyName) out.family_name = id.familyName;

  return out;
}
