const chokidar = require('chokidar');
const { CLAUDE_JSON } = require('./parser');

let watcher = null;

function startWatching(onChange) {
  watcher = chokidar.watch(CLAUDE_JSON, {
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
    usePolling: false,
  });

  watcher.on('change', () => {
    onChange();
  });

  watcher.on('error', (err) => {
    console.error('Watcher error:', err.message);
  });
}

function stopWatching() {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
}

module.exports = { startWatching, stopWatching };
