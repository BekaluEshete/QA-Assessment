import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ---------------------------------------------------------------------------
// Ella API — k6 Performance Test
// Author: Bekalu Eshete
//
// Target endpoint: POST /transactions (critical write path — creates a
// purchase, updates product stock, links user + product).
//
// To run:
//   k6 run qa/performance-test.js
//
// Prerequisites:
//   - API running at http://localhost:4000
//   - At least one user and one product exist in the database
//   - Set BASE_URL, USER_ID, PRODUCT_ID via env vars if different from defaults
// ---------------------------------------------------------------------------

// --- Configuration ----------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const USER_ID = __ENV.USER_ID || 1;
const PRODUCT_ID = __ENV.PRODUCT_ID || 1;

// --- Custom metrics ---------------------------------------------------------

const errorRate = new Rate('transaction_errors');
const transactionLatency = new Trend('transaction_latency');

// --- Test options -----------------------------------------------------------
// Smoke test: low load to verify the script works and establish a baseline.
// For load/stress testing, change the stages below.

export const options = {
  stages: [
    // Smoke: 1 VU for 30 seconds (change for load/stress tests)
    { duration: '10s', target: 1 },
    { duration: '20s', target: 1 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    // SLO: 95% of requests should complete within 500ms
    http_req_duration: ['p(95)<500'],
    // SLO: error rate should be below 1%
    http_req_failed: ['rate<0.01'],
    // Custom: transaction errors should be below 1%
    transaction_errors: ['rate<0.01'],
  },
};

// --- Setup: verify endpoints are reachable ----------------------------------

export function setup() {
  const healthRes = http.get(`${BASE_URL}/products`);
  if (healthRes.status !== 200) {
    console.error(`Setup check failed: GET /products returned ${healthRes.status}`);
    console.error('Ensure the API is running and data exists.');
  }
  return { baseUrl: BASE_URL };
}

// --- Main test: exercise POST /transactions --------------------------------

export default function (data) {
  group('Create Transaction', () => {
    const payload = JSON.stringify({
      userId: USER_ID,
      productId: PRODUCT_ID,
      quantity: 1,
    });

    const params = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const res = http.post(`${data.baseUrl}/transactions`, payload, params);

    transactionLatency.add(res.timings.duration);

    const success = check(res, {
      'status is 201': (r) => r.status === 201,
      'response has data': (r) => r.json('data') !== null,
      'response has transaction id': (r) =>
        r.json('data.id') !== undefined && r.json('data.id') > 0,
      'response has user relation': (r) => r.json('data.user') !== null,
      'response has product relation': (r) => r.json('data.product') !== null,
    });

    errorRate.add(!success);

    if (!success) {
      console.warn(
        `Transaction creation failed: status=${res.status} body=${res.body}`
      );
    }
  });

  // Small pause between iterations to simulate think time
  sleep(0.5);
}

// --- Teardown: summary log --------------------------------------------------

export function handleSummary(data) {
  return {
    'qa/performance-results.json': JSON.stringify(data, null, 2),
    stdout: textSummary(data),
  };
}

// Simple text summary for console output
function textSummary(data) {
  const metrics = data.metrics;
  return `
=== Performance Test Summary ===
Endpoint: POST /transactions
VUs: ${options.stages.map((s) => s.target).join(' → ')}
Duration: ${options.stages.map((s) => s.duration).join(' + ')}

Requests:        ${metrics.http_reqs ? metrics.http_reqs.values.count : 'N/A'}
Duration (avg):  ${metrics.http_req_duration ? metrics.http_req_duration.values.avg.toFixed(2) : 'N/A'} ms
Duration (p95):  ${metrics.http_req_duration ? metrics.http_req_duration.values['p(95)'].toFixed(2) : 'N/A'} ms
Failed requests: ${metrics.http_req_failed ? (metrics.http_req_failed.values.rate * 100).toFixed(2) : 'N/A'}%
Transaction errors: ${metrics.transaction_errors ? (metrics.transaction_errors.values.rate * 100).toFixed(2) : 'N/A'}%

Thresholds:
${data.thresholds ? JSON.stringify(data.thresholds, null, 2) : 'N/A'}
================================
`;
}
