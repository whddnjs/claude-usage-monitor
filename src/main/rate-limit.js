const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CREDENTIALS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

function getApiKey() {
  try {
    const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return data.claudeAiOauth?.accessToken || null;
  } catch {
    return null;
  }
}

function fetchRateLimits() {
  return new Promise((resolve, reject) => {
    const apiKey = getApiKey();
    if (!apiKey) {
      return reject(new Error('No API key found'));
    }

    const body = JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1,
      messages: [{ role: 'user', content: '.' }],
    });

    const options = {
      hostname: 'api.anthropic.com',
      port: 443,
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      // Read body to completion (discard)
      res.on('data', () => {});
      res.on('end', () => {
        const headers = res.headers;
        const result = {
          fiveHour: {
            status: headers['anthropic-ratelimit-unified-5h-status'] || 'unknown',
            utilization: parseFloat(headers['anthropic-ratelimit-unified-5h-utilization'] || '0'),
            resetTimestamp: parseInt(headers['anthropic-ratelimit-unified-5h-reset'] || '0', 10),
            resetMs: 0,
          },
          sevenDay: {
            status: headers['anthropic-ratelimit-unified-7d-status'] || 'unknown',
            utilization: parseFloat(headers['anthropic-ratelimit-unified-7d-utilization'] || '0'),
            resetTimestamp: parseInt(headers['anthropic-ratelimit-unified-7d-reset'] || '0', 10),
            resetMs: 0,
          },
          overallStatus: headers['anthropic-ratelimit-unified-status'] || 'unknown',
          representativeClaim: headers['anthropic-ratelimit-unified-representative-claim'] || '',
        };

        const now = Math.floor(Date.now() / 1000);
        result.fiveHour.resetMs = Math.max(0, (result.fiveHour.resetTimestamp - now) * 1000);
        result.sevenDay.resetMs = Math.max(0, (result.sevenDay.resetTimestamp - now) * 1000);

        resolve(result);
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(body);
    req.end();
  });
}

module.exports = { fetchRateLimits };
