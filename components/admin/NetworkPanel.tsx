'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AUTH_MODE_LABELS,
  CATEGORY_LABELS,
  DATA_CLASS_LABELS,
  DEROGABLE_CODES,
  FHIR_ACCESS_LABELS,
  MIN_JUSTIFICATION,
  type AuthMode,
  type DataClass,
  type Endpoint,
  type EndpointCategory,
  type Evaluation,
  type FhirAccess,
  type Finding,
  type NetworkConfig,
  type Scope,
} from '@/lib/compliance/rules';

interface EndpointRow extends Endpoint {
  note: string | null;
  last_test_at: string | null;
  last_test_status: string | null;
}

interface Payload {
  config: NetworkConfig & { updated_at: string };
  endpoints: EndpointRow[];
  evaluation: Evaluation;
  detected: { url: string; label: string; local: boolean }[];
  livePort: number;
  secrets: Record<string, boolean>;
  desktop: boolean;
}

const derogable = new Set<string>(DEROGABLE_CODES);

export function NetworkPanel({ canDerogate }: { canDerogate: boolean }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/network');
    const payload = await res.json();
    if (res.ok) setData(payload);
    else setError(payload.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="card-pad text-sm text-danger">{error}</p>;
  if (!data) return <p className="card-pad text-sm text-ink-soft">Lecture de la configuration reseau...</p>;

  return (
    <div className="space-y-5">
      <ComplianceCard data={data} canDerogate={canDerogate} reload={load} />
      <ApplicationCard data={data} canDerogate={canDerogate} reload={load} />
      <DatabaseCard data={data} canDerogate={canDerogate} reload={load} />
      <TerritoryCard data={data} canDerogate={canDerogate} reload={load} />
      <ServersCard data={data} reload={load} />
    </div>
  );
}

// -------------------------------------------------------------- conformite

const LEVEL_STYLE: Record<string, { box: string; chip: string; word: string }> = {
  blocking: { box: 'border-danger bg-danger-soft', chip: 'bg-danger-soft text-danger', word: 'Bloquant' },
  restricted: { box: 'border-warn bg-warn-soft', chip: 'bg-warn-soft text-warn', word: 'A lever par ecrit' },
  warning: { box: 'border-line bg-white', chip: 'bg-warn-soft text-warn', word: 'Alerte' },
};

function ComplianceCard({
  data,
  canDerogate,
  reload,
}: {
  data: Payload;
  canDerogate: boolean;
  reload: () => Promise<void>;
}) {
  const { evaluation } = data;
  const ordered = [...evaluation.blocking, ...evaluation.pending, ...evaluation.warnings, ...evaluation.waived];

  return (
    <section className="card-pad">
      <h2 className="section-title mb-1">Restrictions sanitaires</h2>
      <p className="mb-4 max-w-4xl text-sm text-ink-soft">
        Chaque adresse et chaque serveur declare ici est confronte aux regles qui encadrent les systemes
        d information de sante. Les manquements bloquants empechent l enregistrement ; ils ne se contournent pas.
        Les restrictions se levent par une decision ecrite du super-administrateur, conservee au journal.
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Bloquants', evaluation.blocking.length, 'text-danger'],
          ['A lever', evaluation.pending.length, 'text-warn'],
          ['Derogations en vigueur', evaluation.waived.length, 'text-ink-soft'],
          ['Alertes', evaluation.warnings.length, 'text-ink-soft'],
        ].map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-lg border border-line p-3">
            <div className="text-xs text-ink-soft">{label}</div>
            <div className={`text-2xl font-bold ${Number(value) > 0 ? tone : 'text-ok'}`}>{String(value)}</div>
          </div>
        ))}
      </div>

      {ordered.length === 0 ? (
        <p className="mt-4 rounded-lg border border-ok bg-ok-soft p-3 text-sm text-ok">
          Aucun manquement detecte sur la configuration actuelle.
        </p>
      ) : (
        <ul className="mt-4 space-y-2.5">
          {ordered.map((f) => (
            <FindingCard
              key={`${f.code}-${f.target}`}
              finding={f}
              canDerogate={canDerogate}
              reload={reload}
            />
          ))}
        </ul>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-ink-soft">
        Les references citees fondent chaque regle ; elles ne valent pas attestation de conformite. Un logiciel
        ne certifie pas un traitement de donnees de sante — il empeche les erreurs de configuration qu on sait
        nommer, et laisse au responsable de traitement ce qui releve de sa decision.
      </p>
    </section>
  );
}

function FindingCard({
  finding,
  canDerogate,
  reload,
}: {
  finding: Finding;
  canDerogate: boolean;
  reload: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const style = finding.waived ? LEVEL_STYLE.warning : LEVEL_STYLE[finding.level];
  const canLift = finding.level === 'restricted' && derogable.has(finding.code);

  async function grant() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/network/derogations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: finding.code, target: finding.target, reason }),
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error);
      setOpen(false);
      setReason('');
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!window.confirm('Revenir sur cette derogation ? La restriction redeviendra bloquante.')) return;
    setBusy(true);
    try {
      await fetch(
        `/api/admin/network/derogations?code=${encodeURIComponent(finding.code)}&target=${encodeURIComponent(finding.target)}`,
        { method: 'DELETE' },
      );
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={`rounded-lg border p-3.5 ${style.box}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{finding.title}</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            {finding.targetLabel} · <code className="text-[10px]">{finding.code}</code>
          </p>
        </div>
        <span className={`chip ${finding.waived ? 'bg-ok-soft text-ok' : style.chip}`}>
          {finding.waived ? 'Derogation accordee' : style.word}
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed">{finding.detail}</p>

      <p className="mt-2 text-sm">
        <span className="font-medium">Correction : </span>
        {finding.remedy}
      </p>

      <p className="mt-1.5 text-[11px] text-ink-soft">Fondement : {finding.reference}</p>

      {finding.waived && (
        <div className="mt-2.5 rounded-lg border border-line bg-white p-2.5 text-xs">
          <p className="font-medium">
            Levee par {finding.waived.granted_by_label ?? 'un super-administrateur'} le {finding.waived.granted_at}
          </p>
          <p className="mt-1 text-ink-soft">{finding.waived.reason}</p>
          {canDerogate && (
            <button className="btn-ghost btn-sm mt-2" disabled={busy} onClick={revoke}>
              Revenir sur cette derogation
            </button>
          )}
        </div>
      )}

      {canLift && !finding.waived && canDerogate && (
        <div className="mt-2.5">
          {!open ? (
            <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
              Accorder une derogation
            </button>
          ) : (
            <div className="rounded-lg border border-line bg-white p-3">
              <label className="label" htmlFor={`reason-${finding.code}-${finding.target}`}>
                Justification et mesure compensatoire
              </label>
              <textarea
                id={`reason-${finding.code}-${finding.target}`}
                className="input"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Ex. : reseau physiquement isole, sans acces internet, acces limite a deux postes du dispensaire."
              />
              <p className="mt-1 text-[11px] text-ink-soft">
                {reason.trim().length} / {MIN_JUSTIFICATION} caracteres minimum. Ce texte est conserve au journal
                d audit avec votre nom : il devra expliquer la decision a qui la relira dans un an.
              </p>
              {error && <p className="mt-2 text-sm text-danger">{error}</p>}
              <div className="mt-2 flex gap-2">
                <button
                  className="btn-primary btn-sm"
                  disabled={busy || reason.trim().length < MIN_JUSTIFICATION}
                  onClick={grant}
                >
                  {busy ? 'Enregistrement...' : 'Signer la derogation'}
                </button>
                <button className="btn-ghost btn-sm" disabled={busy} onClick={() => setOpen(false)}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {canLift && !finding.waived && !canDerogate && (
        <p className="mt-2 text-xs text-ink-soft">
          Cette restriction peut etre levee, mais seul un super-administrateur peut signer la decision.
        </p>
      )}
    </li>
  );
}

// ------------------------------------------------------------- formulaires

function useConfigForm(data: Payload, reload: () => Promise<void>, canDerogate: boolean) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [blocked, setBlocked] = useState<Finding[]>([]);
  const [pending, setPending] = useState<Finding[]>([]);

  async function save(patch: Partial<NetworkConfig>) {
    setBusy(true);
    setMessage(null);
    setBlocked([]);
    try {
      const res = await fetch('/api/admin/network', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const payload = await res.json();
      if (res.status === 422) {
        const ev: Evaluation = payload.evaluation;
        setBlocked(ev.blocking);
        setPending(ev.pending);
        setMessage({ tone: 'error', text: payload.error });
        return;
      }
      if (!res.ok) throw new Error(payload.error);
      setBlocked([]);
      setPending([]);
      setMessage({ tone: 'ok', text: 'Configuration enregistree.' });
      await reload();
    } catch (e) {
      setMessage({ tone: 'error', text: e instanceof Error ? e.message : 'Erreur' });
    } finally {
      setBusy(false);
    }
  }

  const feedback = (
    <>
      {message && (
        <p
          className={`mt-3 rounded-lg border p-3 text-sm ${
            message.tone === 'ok' ? 'border-ok bg-ok-soft text-ok' : 'border-danger bg-danger-soft text-danger'
          }`}
        >
          {message.text}
        </p>
      )}
      {blocked.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {blocked.map((f) => (
            <li key={`${f.code}-${f.target}`} className="rounded-lg border border-danger bg-danger-soft p-2.5 text-sm">
              <strong>{f.title}</strong> — {f.remedy}
            </li>
          ))}
        </ul>
      )}
      {/*
        Les restrictions sont affichees en entier, avec leur bouton de signature.
        Sans cela elles seraient inatteignables : l'enregistrement est refuse,
        donc le constat n'entre jamais dans l'etat courant, donc la liste du haut
        ne l'affiche jamais — et la restriction ne pourrait jamais etre levee.
      */}
      {pending.length > 0 && (
        <ul className="mt-2 space-y-2.5">
          {pending.map((f) => (
            <FindingCard
              key={`${f.code}-${f.target}`}
              finding={f}
              canDerogate={canDerogate}
              reload={async () => {
                setPending([]);
                setMessage({
                  tone: 'ok',
                  text: 'Derogation enregistree. Relancez l enregistrement pour appliquer la configuration.',
                });
                await reload();
              }}
            />
          ))}
        </ul>
      )}
    </>
  );

  return { busy, save, feedback, data };
}

function ApplicationCard({ data, canDerogate, reload }: { data: Payload; canDerogate: boolean; reload: () => Promise<void> }) {
  const { busy, save, feedback } = useConfigForm(data, reload, canDerogate);
  const [form, setForm] = useState({
    app_public_url: data.config.app_public_url ?? '',
    app_bind_host: data.config.app_bind_host,
    app_port: String(data.config.app_port),
    app_https: data.config.app_https === 1,
    allowed_origins: data.config.allowed_origins,
    fhir_access: data.config.fhir_access,
  });

  return (
    <section className="card-pad">
      <h2 className="section-title mb-1">Adresse de l application</h2>
      <p className="mb-4 max-w-4xl text-sm text-ink-soft">
        L adresse declaree ici est celle que l application utilise pour se designer elle-meme : liens des
        ressources FHIR emises, adresses communiquees aux postes. Derriere un proxy, le serveur ne peut pas la
        deviner — il ne voit que <code>127.0.0.1</code>.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="label" htmlFor="public-url">
            Adresse publique
          </label>
          <input
            id="public-url"
            className="input"
            value={form.app_public_url}
            placeholder="https://parledocteur.hopital.bj"
            onChange={(e) => setForm({ ...form, app_public_url: e.target.value })}
          />
          <p className="mt-1 text-[11px] text-ink-soft">Laisser vide pour utiliser l origine de la requete.</p>
        </div>

        <div>
          <label className="label" htmlFor="bind-host">
            Interface d ecoute
          </label>
          <select
            id="bind-host"
            className="input"
            value={form.app_bind_host}
            onChange={(e) => setForm({ ...form, app_bind_host: e.target.value })}
          >
            <option value="127.0.0.1">127.0.0.1 — ce poste uniquement</option>
            <option value="0.0.0.0">0.0.0.0 — tout le reseau de la structure</option>
          </select>
          <p className="mt-1 text-[11px] text-ink-soft">
            Decrit la maniere dont le serveur est demarre. C est cette valeur qui determine la severite des
            controles : exposer au reseau sans chiffrement devient une restriction.
          </p>
        </div>

        <div>
          <label className="label" htmlFor="port">
            Port
          </label>
          <input
            id="port"
            className="input"
            type="number"
            value={form.app_port}
            onChange={(e) => setForm({ ...form, app_port: e.target.value })}
          />
          <p className="mt-1 text-[11px] text-ink-soft">
            Port ecoute actuellement : <strong>{data.livePort}</strong>
            {data.desktop && ' — l application desktop en tire un au hasard a chaque lancement.'}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="fhir-access">
            Acces a l API FHIR
          </label>
          <select
            id="fhir-access"
            className="input"
            value={form.fhir_access}
            onChange={(e) => setForm({ ...form, fhir_access: e.target.value as FhirAccess })}
          >
            {(Object.keys(FHIR_ACCESS_LABELS) as FhirAccess[]).map((k) => (
              <option key={k} value={k}>
                {FHIR_ACCESS_LABELS[k]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-ink-soft">
            L API FHIR sert le dossier medical. Le jeton de service se definit dans{' '}
            <code>FHIR_API_TOKEN</code> cote serveur
            {data.secrets.FHIR_API_TOKEN ? ' (defini)' : ' (absent pour l instant)'}.
          </p>
        </div>

        <div className="lg:col-span-2">
          <label className="label" htmlFor="origins">
            Origines autorisees sur l API FHIR
          </label>
          <input
            id="origins"
            className="input"
            value={form.allowed_origins}
            placeholder="https://sih.hopital.bj, https://portail.sante.gouv.bj"
            onChange={(e) => setForm({ ...form, allowed_origins: e.target.value })}
          />
          <p className="mt-1 text-[11px] text-ink-soft">
            Separees par des virgules. Vide interdit tout appel navigateur inter-origine — c est le reglage le
            plus sur, et il n empeche aucun appel de serveur a serveur.
          </p>
        </div>
      </div>

      <label className="mt-4 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.app_https}
          onChange={(e) => setForm({ ...form, app_https: e.target.checked })}
        />
        <span>
          L adresse publique est servie en HTTPS
          <span className="block text-[11px] text-ink-soft">
            Directement ou par un proxy TLS. Sans HTTPS, le microphone reste inutilisable depuis les autres
            postes : les navigateurs le reservent aux sites securises et a localhost.
          </span>
        </span>
      </label>

      <div className="mt-4 flex items-center gap-3">
        <button
          className="btn-primary btn-sm"
          disabled={busy}
          onClick={() =>
            save({
              app_public_url: form.app_public_url.trim() || null,
              app_bind_host: form.app_bind_host,
              app_port: Number(form.app_port) || data.livePort,
              app_https: form.app_https ? 1 : 0,
              allowed_origins: form.allowed_origins,
              fhir_access: form.fhir_access,
            })
          }
        >
          {busy ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      {feedback}

      <h3 className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-ink-soft">
        Adresses detectees ({data.detected.length})
      </h3>
      <ul className="space-y-1 text-sm">
        {data.detected.map((a) => (
          <li key={a.url} className="flex flex-wrap items-center justify-between gap-2 border-b border-line py-1">
            <code className="text-xs">{a.url}</code>
            <span className="text-xs text-ink-soft">{a.local ? 'ce poste' : a.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-ink-soft">
        Adresses auxquelles le serveur repond reellement, relevees sur les interfaces reseau du poste. Les
        interfaces sans bail DHCP sont ecartees : aucun appareil ne les joindrait.
      </p>
    </section>
  );
}

function DatabaseCard({ data, canDerogate, reload }: { data: Payload; canDerogate: boolean; reload: () => Promise<void> }) {
  const { busy, save, feedback } = useConfigForm(data, reload, canDerogate);
  const [form, setForm] = useState({
    db_path: data.config.db_path,
    db_backup_dir: data.config.db_backup_dir ?? '',
    db_encrypted: data.config.db_encrypted === 1,
  });

  return (
    <section className="card-pad">
      <h2 className="section-title mb-1">Adresse de la base de donnees</h2>
      <p className="mb-4 max-w-4xl text-sm text-ink-soft">
        La base est un fichier SQLite embarque : pas de serveur de base a joindre, pas de mot de passe reseau.
        Son emplacement effectif est fixe au demarrage par <code>PARLEDOCTEUR_DB</code> ; le champ ci-dessous
        enregistre l emplacement de reference de la structure et sert aux controles.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="label" htmlFor="db-path">
            Emplacement de la base
          </label>
          <input
            id="db-path"
            className="input"
            value={form.db_path}
            onChange={(e) => setForm({ ...form, db_path: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="backup-dir">
            Emplacement des sauvegardes
          </label>
          <input
            id="backup-dir"
            className="input"
            value={form.db_backup_dir}
            placeholder="D:\\sauvegardes\\parledocteur"
            onChange={(e) => setForm({ ...form, db_backup_dir: e.target.value })}
          />
        </div>
      </div>

      <label className="mt-4 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.db_encrypted}
          onChange={(e) => setForm({ ...form, db_encrypted: e.target.checked })}
        />
        <span>
          Le support qui porte la base est chiffre
          <span className="block text-[11px] text-ink-soft">
            BitLocker, LUKS ou FileVault. Declaratif : l application ne peut pas le verifier, et ne pretend pas
            le faire. Cocher sans avoir active le chiffrement ne protege rien.
          </span>
        </span>
      </label>

      <div className="mt-4">
        <button
          className="btn-primary btn-sm"
          disabled={busy}
          onClick={() =>
            save({
              db_path: form.db_path.trim(),
              db_backup_dir: form.db_backup_dir.trim() || null,
              db_encrypted: form.db_encrypted ? 1 : 0,
            })
          }
        >
          {busy ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      {feedback}
    </section>
  );
}

function TerritoryCard({ data, canDerogate, reload }: { data: Payload; canDerogate: boolean; reload: () => Promise<void> }) {
  const { busy, save, feedback } = useConfigForm(data, reload, canDerogate);
  const [form, setForm] = useState({
    data_residency_country: data.config.data_residency_country,
    allow_external_transfer: data.config.allow_external_transfer === 1,
  });

  return (
    <section className="card-pad">
      <h2 className="section-title mb-1">Territoire et transferts</h2>
      <p className="mb-4 max-w-4xl text-sm text-ink-soft">
        Un transfert de donnees de sante hors du territoire de collecte est un traitement a part entiere, soumis
        a une base juridique propre — autorisation de l autorite nationale de protection, clauses contractuelles
        types ou decision d adequation. L interrupteur ci-dessous conditionne tout flux sortant.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="label" htmlFor="residency">
            Pays de residence des donnees
          </label>
          <input
            id="residency"
            className="input"
            maxLength={2}
            value={form.data_residency_country}
            onChange={(e) => setForm({ ...form, data_residency_country: e.target.value.toUpperCase() })}
          />
          <p className="mt-1 text-[11px] text-ink-soft">Code ISO a deux lettres : BJ, CI, SN, FR...</p>
        </div>
      </div>

      <label className="mt-4 flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.allow_external_transfer}
          onChange={(e) => setForm({ ...form, allow_external_transfer: e.target.checked })}
        />
        <span>
          Autoriser les transferts vers des serveurs externes
          <span className="block text-[11px] text-ink-soft">
            Decoche, aucun flux contenant des donnees de sante ne sort du reseau de la structure, quels que
            soient les serveurs declares. C est le reglage d une installation de dispensaire hors ligne.
          </span>
        </span>
      </label>

      <div className="mt-4">
        <button
          className="btn-primary btn-sm"
          disabled={busy}
          onClick={() =>
            save({
              data_residency_country: form.data_residency_country.trim().toUpperCase(),
              allow_external_transfer: form.allow_external_transfer ? 1 : 0,
            })
          }
        >
          {busy ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>

      {feedback}
    </section>
  );
}

// ---------------------------------------------------------------- serveurs

const EMPTY: EndpointForm = {
  label: '',
  scope: 'internal',
  category: 'fhir',
  url: '',
  enabled: true,
  auth_mode: 'none',
  secret_env: '',
  data_class: 'none',
  country: '',
  verify_tls: true,
  note: '',
};

interface EndpointForm {
  label: string;
  scope: Scope;
  category: EndpointCategory;
  url: string;
  enabled: boolean;
  auth_mode: AuthMode;
  secret_env: string;
  data_class: DataClass;
  country: string;
  verify_tls: boolean;
  note: string;
}

function ServersCard({ data, reload }: { data: Payload; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<string | 'new' | null>(null);

  const internal = data.endpoints.filter((e) => e.scope === 'internal');
  const external = data.endpoints.filter((e) => e.scope === 'external');

  return (
    <section className="card-pad">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="section-title">Serveurs internes et externes</h2>
        <button className="btn-primary btn-sm" onClick={() => setEditing(editing === 'new' ? null : 'new')}>
          {editing === 'new' ? 'Annuler' : 'Declarer un serveur'}
        </button>
      </div>
      <p className="mb-4 max-w-4xl text-sm text-ink-soft">
        Un serveur interne vit sur le reseau de la structure ; un serveur externe est joignable depuis
        l internet. La portee n est pas declarative : elle est verifiee contre l adresse, car c est elle qui
        assouplit les autres controles.
      </p>

      {editing === 'new' && (
        <EndpointForm
          initial={EMPTY}
          onDone={async () => {
            setEditing(null);
            await reload();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <Group
        title="Serveurs internes"
        rows={internal}
        data={data}
        editing={editing}
        setEditing={setEditing}
        reload={reload}
        empty="Aucun serveur interne declare."
      />
      <Group
        title="Serveurs externes"
        rows={external}
        data={data}
        editing={editing}
        setEditing={setEditing}
        reload={reload}
        empty="Aucun serveur externe declare — aucune donnee ne sort de la structure."
      />
    </section>
  );
}

function Group({
  title,
  rows,
  data,
  editing,
  setEditing,
  reload,
  empty,
}: {
  title: string;
  rows: EndpointRow[];
  data: Payload;
  editing: string | 'new' | null;
  setEditing: (v: string | 'new' | null) => void;
  reload: () => Promise<void>;
  empty: string;
}) {
  return (
    <div className="mt-5">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">
        {title} ({rows.length})
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((e) => (
            <EndpointItem
              key={e.id}
              row={e}
              data={data}
              editing={editing}
              setEditing={setEditing}
              reload={reload}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function EndpointItem({
  row,
  data,
  editing,
  setEditing,
  reload,
}: {
  row: EndpointRow;
  data: Payload;
  editing: string | 'new' | null;
  setEditing: (v: string | 'new' | null) => void;
  reload: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<string | null>(null);

  const problems = data.evaluation.findings.filter((f) => f.target === row.id && !f.waived);
  const worst = problems.some((p) => p.level === 'blocking')
    ? 'blocking'
    : problems.some((p) => p.level === 'restricted')
      ? 'restricted'
      : null;

  async function runTest() {
    setBusy(true);
    setTest(null);
    try {
      const res = await fetch(`/api/admin/network/endpoints/${row.id}/test`, { method: 'POST' });
      const payload = await res.json();
      setTest(payload.message ?? payload.error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Supprimer « ${row.label} » ? Les derogations associees sont retirees.`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/network/endpoints/${row.id}`, { method: 'DELETE' });
      await reload();
    } finally {
      setBusy(false);
    }
  }

  if (editing === row.id) {
    return (
      <li>
        <EndpointForm
          initial={{
            label: row.label,
            scope: row.scope,
            category: row.category,
            url: row.url,
            enabled: row.enabled === 1,
            auth_mode: row.auth_mode,
            secret_env: row.secret_env ?? '',
            data_class: row.data_class,
            country: row.country ?? '',
            verify_tls: row.verify_tls === 1,
            note: row.note ?? '',
          }}
          id={row.id}
          onDone={async () => {
            setEditing(null);
            await reload();
          }}
          onCancel={() => setEditing(null)}
        />
      </li>
    );
  }

  return (
    <li
      className={`rounded-lg border p-3 ${
        worst === 'blocking' ? 'border-danger bg-danger-soft' : worst === 'restricted' ? 'border-warn' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            <span aria-hidden className={row.enabled === 1 ? 'text-ok' : 'text-ink-soft'}>
              {row.enabled === 1 ? '● ' : '○ '}
            </span>
            {row.label}
          </p>
          <p className="mt-0.5 break-all text-xs text-ink-soft">
            <code>{row.url}</code>
          </p>
          <p className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
            <span className="chip bg-brand-soft text-brand-dark">{CATEGORY_LABELS[row.category]}</span>
            <span className="chip bg-warn-soft text-warn">{DATA_CLASS_LABELS[row.data_class]}</span>
            <span className="chip">{AUTH_MODE_LABELS[row.auth_mode]}</span>
            {row.country && <span className="chip">{row.country}</span>}
          </p>
          {row.secret_env && (
            <p className="mt-1 text-[11px] text-ink-soft">
              Secret : <code>{row.secret_env}</code>{' '}
              {data.secrets[row.secret_env] ? '— defini sur ce serveur' : '— absent de ce serveur'}
            </p>
          )}
          {row.note && <p className="mt-1 text-[11px] text-ink-soft">{row.note}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button className="btn-ghost btn-sm" disabled={busy} onClick={runTest}>
            {busy ? '...' : 'Tester'}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setEditing(row.id)}>
            Modifier
          </button>
          <button className="btn-danger btn-sm" disabled={busy} onClick={remove}>
            Supprimer
          </button>
        </div>
      </div>

      {(test || row.last_test_status) && (
        <p className="mt-2 text-xs text-ink-soft">
          {test ?? `Dernier test : ${row.last_test_status} (${row.last_test_at})`}
        </p>
      )}

      {problems.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs">
          {problems.map((p) => (
            <li key={p.code} className={p.level === 'blocking' ? 'text-danger' : 'text-warn'}>
              {p.level === 'blocking' ? 'Bloquant' : p.level === 'restricted' ? 'A lever' : 'Alerte'} — {p.title}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function EndpointForm({
  initial,
  id,
  onDone,
  onCancel,
}: {
  initial: EndpointForm;
  id?: string;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EndpointForm>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<Finding[]>([]);

  async function submit() {
    setBusy(true);
    setError(null);
    setBlocked([]);
    try {
      const res = await fetch(id ? `/api/admin/network/endpoints/${id}` : '/api/admin/network/endpoints', {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: form.label.trim(),
          scope: form.scope,
          category: form.category,
          url: form.url.trim(),
          enabled: form.enabled ? 1 : 0,
          auth_mode: form.auth_mode,
          secret_env: form.secret_env.trim() || null,
          data_class: form.data_class,
          country: form.country.trim() || null,
          verify_tls: form.verify_tls ? 1 : 0,
          note: form.note.trim() || null,
        }),
      });
      const payload = await res.json();
      if (res.status === 422) {
        const ev: Evaluation = payload.evaluation;
        setBlocked([...ev.blocking, ...ev.pending]);
        setError(payload.error);
        return;
      }
      if (!res.ok) throw new Error(payload.error);
      // Enregistre mais desactive faute de derogation : l utilisateur doit le
      // savoir avant de fermer le formulaire, sinon il croira le serveur actif.
      if (payload.message) window.alert(payload.message);
      await onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg border border-brand bg-brand-soft/30 p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="label" htmlFor="e-label">
            Nom
          </label>
          <input
            id="e-label"
            className="input"
            value={form.label}
            placeholder="Serveur FHIR du CHU de Cotonou"
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="e-url">
            Adresse
          </label>
          <input
            id="e-url"
            className="input"
            value={form.url}
            placeholder="https://sih.chu-cotonou.bj/fhir"
            onChange={(e) => setForm({ ...form, url: e.target.value })}
          />
        </div>
        <div>
          <label className="label" htmlFor="e-scope">
            Portee
          </label>
          <select
            id="e-scope"
            className="input"
            value={form.scope}
            onChange={(e) => setForm({ ...form, scope: e.target.value as Scope })}
          >
            <option value="internal">Interne — reseau de la structure</option>
            <option value="external">Externe — joignable depuis l internet</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-category">
            Usage
          </label>
          <select
            id="e-category"
            className="input"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value as EndpointCategory })}
          >
            {(Object.keys(CATEGORY_LABELS) as EndpointCategory[]).map((k) => (
              <option key={k} value={k}>
                {CATEGORY_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-data">
            Donnees transmises
          </label>
          <select
            id="e-data"
            className="input"
            value={form.data_class}
            onChange={(e) => setForm({ ...form, data_class: e.target.value as DataClass })}
          >
            {(Object.keys(DATA_CLASS_LABELS) as DataClass[]).map((k) => (
              <option key={k} value={k}>
                {DATA_CLASS_LABELS[k]}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-ink-soft">
            Declarer au plus haut en cas de doute : c est ce champ qui declenche les controles.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="e-auth">
            Authentification
          </label>
          <select
            id="e-auth"
            className="input"
            value={form.auth_mode}
            onChange={(e) => setForm({ ...form, auth_mode: e.target.value as AuthMode })}
          >
            {(Object.keys(AUTH_MODE_LABELS) as AuthMode[]).map((k) => (
              <option key={k} value={k}>
                {AUTH_MODE_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="e-secret">
            Variable d environnement portant le secret
          </label>
          <input
            id="e-secret"
            className="input"
            value={form.secret_env}
            placeholder="FHIR_EXPORT_TOKEN"
            onChange={(e) => setForm({ ...form, secret_env: e.target.value })}
          />
          <p className="mt-1 text-[11px] text-ink-soft">
            Le NOM de la variable, jamais sa valeur. Un secret modifiable depuis une page web est un secret
            expose : il vit dans le fichier d environnement du serveur.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="e-country">
            Pays d hebergement
          </label>
          <input
            id="e-country"
            className="input"
            maxLength={2}
            value={form.country}
            placeholder="BJ"
            onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
          />
        </div>
        <div className="lg:col-span-2">
          <label className="label" htmlFor="e-note">
            Note
          </label>
          <input
            id="e-note"
            className="input"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
          />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <label className="flex items-center gap-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
          Serveur actif
        </label>
        <label className="flex items-start gap-2.5 text-sm">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={form.verify_tls}
            onChange={(e) => setForm({ ...form, verify_tls: e.target.checked })}
          />
          <span>
            Verifier le certificat TLS
            <span className="block text-[11px] text-ink-soft">
              A laisser coche. Sans verification, le chiffrement subsiste mais plus rien ne garantit
              l identite du destinataire.
            </span>
          </span>
        </label>
      </div>

      {error && <p className="mt-3 rounded-lg border border-danger bg-danger-soft p-3 text-sm text-danger">{error}</p>}
      {blocked.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {blocked.map((f) => (
            <li key={`${f.code}-${f.target}`} className="rounded-lg border border-danger bg-danger-soft p-2.5 text-sm">
              <strong>{f.title}</strong> — {f.detail}
              <span className="mt-1 block text-xs">Correction : {f.remedy}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex gap-2">
        <button className="btn-primary btn-sm" disabled={busy} onClick={submit}>
          {busy ? 'Enregistrement...' : id ? 'Enregistrer' : 'Declarer'}
        </button>
        <button className="btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
          Annuler
        </button>
      </div>
    </div>
  );
}
