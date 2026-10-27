import { NextResponse } from 'next/server';
import os from 'node:os';
import { statfsSync } from 'node:fs';
import path from 'node:path';
import { databasePath, get } from '@/lib/db';
import { apiRequire, guarded } from '@/lib/auth/guard';
import { aiAvailable, aiModel } from '@/lib/ai/extract';

export const dynamic = 'force-dynamic';

/**
 * Etat du serveur et des integrations.
 *
 * On expose la PRESENCE d'un secret, jamais sa valeur : savoir qu'une cle est
 * configuree suffit a diagnostiquer, la lire ne sert qu'a la voler. Meme regle
 * pour les jetons d'export.
 */
function integrationStatus() {
  const declared = (v?: string) => Boolean(v && v.trim());
  return [
    {
      key: 'ANTHROPIC_API_KEY',
      label: 'Modele de langage (extraction clinique)',
      configured: aiAvailable(),
      detail: aiAvailable() ? `modele : ${aiModel()}` : 'repli sur le moteur local hors-ligne',
      critical: false,
    },
    {
      key: 'FHIR_EXPORT_ENDPOINT',
      label: 'Serveur FHIR de destination',
      configured: declared(process.env.FHIR_EXPORT_ENDPOINT),
      detail: declared(process.env.FHIR_EXPORT_ENDPOINT)
        ? new URL(process.env.FHIR_EXPORT_ENDPOINT!).origin
        : 'transmission automatique desactivee',
      critical: false,
    },
    {
      key: 'FHIR_EXPORT_TOKEN',
      label: "Jeton d'authentification FHIR",
      configured: declared(process.env.FHIR_EXPORT_TOKEN),
      detail: declared(process.env.FHIR_EXPORT_TOKEN) ? 'defini' : 'absent',
      critical: false,
    },
    {
      key: 'DHIS2_BASE_URL',
      label: 'DHIS2 (surveillance nationale)',
      configured: declared(process.env.DHIS2_BASE_URL),
      detail: declared(process.env.DHIS2_BASE_URL)
        ? new URL(process.env.DHIS2_BASE_URL!).origin
        : 'transmission automatique desactivee',
      critical: false,
    },
    {
      key: 'FHIR_CORS_ORIGIN',
      label: 'Origines autorisees sur l API FHIR',
      configured: declared(process.env.FHIR_CORS_ORIGIN) && process.env.FHIR_CORS_ORIGIN !== '*',
      detail:
        !declared(process.env.FHIR_CORS_ORIGIN) || process.env.FHIR_CORS_ORIGIN === '*'
          ? 'toutes origines (*) — a restreindre en production'
          : process.env.FHIR_CORS_ORIGIN!,
      critical: process.env.NODE_ENV === 'production' && (process.env.FHIR_CORS_ORIGIN ?? '*') === '*',
    },
  ];
}

export function GET() {
  return guarded(async () => {
    await apiRequire('server:manage');

    let disk: { total: number; free: number } | null = null;
    try {
      const s = statfsSync(path.dirname(databasePath()));
      disk = { total: Number(s.blocks) * Number(s.bsize), free: Number(s.bavail) * Number(s.bsize) };
    } catch {
      disk = null;
    }

    const mem = process.memoryUsage();
    const count = (t: string) => get<{ n: number }>(`SELECT COUNT(*) n FROM ${t}`)?.n ?? 0;

    return NextResponse.json({
      application: {
        name: 'SmartHealth',
        version: process.env.npm_package_version ?? '0.2.0',
        environment: process.env.NODE_ENV ?? 'development',
        facility: process.env.FACILITY_NAME ?? null,
        facilityId: process.env.FACILITY_ID ?? null,
        fhirBaseUrl: process.env.FHIR_BASE_URL ?? null,
        // le serveur embarque de l'application desktop fixe cette variable
        desktop: Boolean(process.env.SMARTHEALTH_DB),
      },
      runtime: {
        node: process.version,
        platform: `${os.platform()} ${os.release()}`,
        arch: os.arch(),
        cpus: os.cpus().length,
        processUptimeSeconds: Math.round(process.uptime()),
        systemUptimeSeconds: Math.round(os.uptime()),
        pid: process.pid,
      },
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        systemTotal: os.totalmem(),
        systemFree: os.freemem(),
      },
      disk,
      storage: { databasePath: databasePath() },
      activity: {
        organizations: count('organization'),
        users: count('user_account'),
        activeSessions:
          get<{ n: number }>(
            "SELECT COUNT(*) n FROM user_session WHERE revoked_at IS NULL AND expires_at > datetime('now')",
          )?.n ?? 0,
        patients: count('patient'),
        consultations: count('consultation'),
        exports: count('interop_export'),
        auditEntries: count('audit_log'),
      },
      integrations: integrationStatus(),
    });
  });
}
