const { Notification } = require('electron');

let alerted5h = false;
let alerted7d = false;

function checkRateLimitThresholds(rateLimits) {
  if (!rateLimits) return;

  const pct5h = Math.round(rateLimits.fiveHour.utilization * 100);
  const pct7d = Math.round(rateLimits.sevenDay.utilization * 100);

  if (pct5h >= 80 && !alerted5h) {
    alerted5h = true;
    showNotification('세션 사용량 경고', `5시간 세션 사용량이 ${pct5h}%에 도달했습니다`);
  } else if (pct5h < 80) {
    alerted5h = false;
  }

  if (pct7d >= 80 && !alerted7d) {
    alerted7d = true;
    showNotification('주간 사용량 경고', `7일 주간 사용량이 ${pct7d}%에 도달했습니다`);
  } else if (pct7d < 80) {
    alerted7d = false;
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

module.exports = { checkRateLimitThresholds };
