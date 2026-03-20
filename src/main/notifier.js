const { Notification } = require('electron');

const THRESHOLDS = {
  cost: 5,        // $5
  tokens: 500000, // 500K
};

let alertedCost = false;
let alertedTokens = false;

function checkThresholds(totals) {
  if (!alertedCost && totals.cost >= THRESHOLDS.cost) {
    alertedCost = true;
    showNotification(
      '비용 임계값 초과',
      `총 비용이 $${totals.cost.toFixed(2)}에 도달했습니다 (임계값: $${THRESHOLDS.cost})`
    );
  }

  const totalTokens = totals.inputTokens + totals.outputTokens;
  if (!alertedTokens && totalTokens >= THRESHOLDS.tokens) {
    alertedTokens = true;
    showNotification(
      '토큰 임계값 초과',
      `총 토큰이 ${(totalTokens / 1000).toFixed(0)}K에 도달했습니다 (임계값: ${THRESHOLDS.tokens / 1000}K)`
    );
  }
}

function showNotification(title, body) {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: `Claude Monitor: ${title}`,
    body,
    silent: false,
  });
  n.show();
}

function resetAlerts() {
  alertedCost = false;
  alertedTokens = false;
}

module.exports = { checkThresholds, resetAlerts };
