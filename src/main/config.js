const fs = require('fs');
const path = require('path');
const { app } = require('electron');

let configDir = null;
let configFile = null;
let config = {};

function ensurePaths() {
  if (!configDir) {
    configDir = path.join(app.getPath('userData'));
    configFile = path.join(configDir, 'config.json');
  }
}

function loadConfig() {
  ensurePaths();
  try {
    if (fs.existsSync(configFile)) {
      config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    }
  } catch {
    config = {};
  }
  return config;
}

function saveConfig() {
  ensurePaths();
  try {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save config:', err.message);
  }
}

function get(key, defaultValue) {
  return config[key] !== undefined ? config[key] : defaultValue;
}

function set(key, value) {
  config[key] = value;
  saveConfig();
}

module.exports = { loadConfig, get, set };
