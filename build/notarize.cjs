// electron-builder `afterSign` hook — notarize + staple the macOS app.
//
// It runs ONLY when notarization credentials are present in the environment, so
// contributors without an Apple account can still `npm run dist:mac` and get a
// working (unsigned) build — this just no-ops. With a Developer ID cert in the
// keychain + the env vars below, the produced .app/.dmg is signed, notarized,
// and stapled, so end users get a single one-time macOS access prompt.
//
// Credentials (set whichever pair you use):
//   App-specific password:  APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID
//   App Store Connect key:  APPLE_API_KEY (path to .p8), APPLE_API_KEY_ID, APPLE_API_ISSUER
const { execFileSync } = require('node:child_process');
const path = require('node:path');

/**
 * Without a Developer ID cert electron-builder skips signing entirely, which
 * leaves only the Mach-O linker signatures: the bundle itself is not sealed
 * (`codesign --verify` says "code object is not signed at all"). A copy of that
 * downloaded from GitHub gets macOS's "damaged, move to Trash" dialog, with no
 * way to open it. Sealing it ad hoc turns that into the ordinary "could not
 * verify the developer" dialog, which Privacy & Security > Open Anyway clears
 * (RELEASE.md walks owners through it).
 *
 * Runs only when the bundle does not already verify, so a real Developer ID
 * signature is never touched. electron-builder 25 has no ad-hoc identity of its
 * own (`identity: "-"` is looked up in the keychain and skipped), hence here.
 */
function sealAdHocIfUnsigned(appPath) {
  try {
    execFileSync('codesign', ['--verify', '--strict', appPath], { stdio: 'ignore' });
    return; // properly signed already
  } catch { /* not sealed: fall through */ }
  const entitlements = path.join(__dirname, 'entitlements.mac.plist');
  console.log('[sign] no Developer ID signature: sealing the app ad hoc so a downloaded copy can be opened.');
  execFileSync('codesign', [
    '--force', '--deep', '--sign', '-',
    '--options', 'runtime', '--entitlements', entitlements,
    appPath
  ], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], { stdio: 'inherit' });
}

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return; // mac only

  sealAdHocIfUnsigned(path.join(appOutDir, `${context.packager.appInfo.productFilename}.app`));

  const {
    APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID,
    APPLE_API_KEY, APPLE_API_KEY_ID, APPLE_API_ISSUER
  } = process.env;

  const hasPassword = !!(APPLE_ID && APPLE_APP_SPECIFIC_PASSWORD && APPLE_TEAM_ID);
  const hasApiKey = !!(APPLE_API_KEY && APPLE_API_KEY_ID && APPLE_API_ISSUER);
  if (!hasPassword && !hasApiKey) {
    console.log('[notarize] no APPLE_* credentials in env — skipping notarization (build stays unsigned).');
    return;
  }

  let notarize;
  try {
    ({ notarize } = require('@electron/notarize'));
  } catch {
    console.warn('[notarize] @electron/notarize not installed — run `npm install`. Skipping.');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  const creds = hasApiKey
    ? { appleApiKey: APPLE_API_KEY, appleApiKeyId: APPLE_API_KEY_ID, appleApiIssuer: APPLE_API_ISSUER }
    : { appleId: APPLE_ID, appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD, teamId: APPLE_TEAM_ID };

  console.log(`[notarize] submitting ${appName}.app to Apple via notarytool (this can take a few minutes)…`);
  try {
    await notarize({ tool: 'notarytool', appPath, ...creds });
    console.log('[notarize] stapling ticket to the app…');
    execFileSync('xcrun', ['stapler', 'staple', appPath], { stdio: 'inherit' });
    console.log('[notarize] done — app is signed, notarized, and stapled.');
  } catch (err) {
    // Best-effort: notarization talks to Apple's servers and can fail for reasons
    // outside the build (bad/expired app-specific password, unaccepted Developer
    // Program agreement, Apple-side outage, a rejected submission). That must NOT
    // sink the whole cross-platform release — the app is still Developer ID *signed*,
    // which is what gives the stable identity macOS uses to remember folder-access
    // grants (the one-time prompt). So we log loudly and ship the signed build;
    // once the credentials are valid, the next release notarizes with no code change.
    // Un-notarized = users may need a one-time right-click → Open on first launch.
    console.warn('[notarize] ⚠️  NOTARIZATION FAILED — shipping a signed-but-unnotarized build.');
    console.warn('[notarize] Fix the APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID secrets to enable it.');
    console.warn(`[notarize] notarytool said:\n${err && err.message ? err.message : err}`);
  }
};
