import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.QA_PORT ?? 4321);
const proxy = process.env.HTTPS_PROXY
  ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' }
  : undefined;

export default defineConfig({
  testDir: 'tests',
  outputDir: 'qa/.tmp/test-results',
  // El QA por viewport (5 páginas, axe, capturas y formulario) es el test más largo.
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list'], ['json', { outputFile: 'qa/.tmp/results.json' }]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    proxy,
    // El proxy de salida del entorno de CI/sandbox reemite TLS con su propia CA.
    ignoreHTTPSErrors: Boolean(proxy),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node scripts/qa-server.mjs',
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      PORT: String(PORT),
      LEAD_MOCK: '1',
      LEAD_MOCK_FILE: 'qa/.tmp/leads.jsonl',
    },
  },
});
