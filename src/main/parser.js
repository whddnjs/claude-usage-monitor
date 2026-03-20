const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_JSON = path.join(os.homedir(), '.claude.json');
const CREDENTIALS_JSON = path.join(os.homedir(), '.claude', '.credentials.json');

async function parseClaudeData() {
  let claudeData, credentials;

  try {
    const raw = fs.readFileSync(CLAUDE_JSON, 'utf-8');
    claudeData = JSON.parse(raw);
  } catch {
    return null;
  }

  try {
    const raw = fs.readFileSync(CREDENTIALS_JSON, 'utf-8');
    credentials = JSON.parse(raw);
  } catch {
    credentials = {};
  }

  // Account info
  const oauth = claudeData.oauthAccount || {};
  const cred = credentials.claudeAiOauth || {};
  const account = {
    displayName: oauth.displayName || 'Unknown',
    subscriptionType: cred.subscriptionType || 'unknown',
    rateLimitTier: cred.rateLimitTier || '',
    billingType: oauth.billingType || '',
  };

  // Parse projects
  const projects = [];
  const totals = {
    cost: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheCreation: 0,
    cacheRead: 0,
  };
  const modelUsageTotal = {};

  const projectsData = claudeData.projects || {};
  for (const [projectPath, data] of Object.entries(projectsData)) {
    if (!data.lastCost && !data.lastTotalInputTokens && !data.lastTotalOutputTokens) {
      continue;
    }

    const cost = data.lastCost || 0;
    const inputTokens = data.lastTotalInputTokens || 0;
    const outputTokens = data.lastTotalOutputTokens || 0;
    const cacheCreation = data.lastTotalCacheCreationInputTokens || 0;
    const cacheRead = data.lastTotalCacheReadInputTokens || 0;

    const totalInput = cacheRead + cacheCreation + inputTokens;
    const cacheHitRate = totalInput > 0 ? (cacheRead / totalInput * 100) : 0;

    // Short name: last folder name
    const shortName = projectPath.split(/[/\\]/).filter(Boolean).pop() || projectPath;

    projects.push({
      path: projectPath,
      shortName,
      cost,
      inputTokens,
      outputTokens,
      cacheCreation,
      cacheRead,
      cacheHitRate,
      modelUsage: data.lastModelUsage || {},
    });

    totals.cost += cost;
    totals.inputTokens += inputTokens;
    totals.outputTokens += outputTokens;
    totals.cacheCreation += cacheCreation;
    totals.cacheRead += cacheRead;

    // Aggregate model usage
    for (const [model, usage] of Object.entries(data.lastModelUsage || {})) {
      if (!modelUsageTotal[model]) {
        modelUsageTotal[model] = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUSD: 0 };
      }
      modelUsageTotal[model].inputTokens += usage.inputTokens || 0;
      modelUsageTotal[model].outputTokens += usage.outputTokens || 0;
      modelUsageTotal[model].cacheReadInputTokens += usage.cacheReadInputTokens || 0;
      modelUsageTotal[model].cacheCreationInputTokens += usage.cacheCreationInputTokens || 0;
      modelUsageTotal[model].costUSD += usage.costUSD || 0;
    }
  }

  // Sort by cost descending
  projects.sort((a, b) => b.cost - a.cost);

  // Reset timer (next UTC midnight)
  const now = new Date();
  const nextReset = new Date(now);
  nextReset.setUTCDate(nextReset.getUTCDate() + 1);
  nextReset.setUTCHours(0, 0, 0, 0);
  const resetTimer = nextReset.getTime() - now.getTime();

  return {
    account,
    totals,
    projects,
    modelUsage: modelUsageTotal,
    resetTimer,
    projectCount: projects.length,
  };
}

module.exports = { parseClaudeData, CLAUDE_JSON };
