/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['node:sqlite'],
  experimental: { serverActions: { bodySizeLimit: '25mb' } },
  async headers() {
    return [
      {
        // Interoperabilite : les SIH tiers doivent pouvoir interroger l'API FHIR
        source: '/api/fhir/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: process.env.FHIR_CORS_ORIGIN || '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
        ],
      },
    ];
  },
};
export default nextConfig;
