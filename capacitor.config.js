'use strict';
/* Capacitor loads this by requiring it, so the side effect below runs before
 * every `cap` command that reads the config \u2014 sync, copy, update, open, run.
 * That means `npx cap sync` alone stays honest: www/ is rebuilt from the
 * current sources first, so a new js file added to index.html cannot be left
 * behind in the previous www/ snapshot. */
const path = require('path');
const { execFileSync } = require('child_process');

try {
  execFileSync(process.execPath, [path.join(__dirname, 'sync-web.js')], {
    stdio: 'inherit',
    cwd: __dirname
  });
} catch (err) {
  console.error('capacitor.config.js: sync-web.js failed:', err && err.message);
  process.exit(1);
}

module.exports = {
  appId: 'com.politecarrot.colorjars',
  appName: 'Color Sort & Merge',
  webDir: 'www'
};
