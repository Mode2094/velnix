'use strict';
// Deployment metadata only, never a private key or Google ADC credential.
// The runtime service account email is not a secret: it is granted only the
// KMS cryptoKeyEncrypterDecrypter role on Velnix's own key. When the gitignored
// functions/.env is absent (fresh clone, CI), falling back to the default
// compute service account silently breaks KMS-backed paths (Click send and
// credential setup) with PERMISSION_DENIED. So an explicit account is required
// for a real deploy, and the project-derived default is used only as a safe,
// non-secret convenience.
function defaultRuntimeAccount(project) {
  // Only the known production project has the dedicated runtime identity. For
  // any other project (emulators, throwaway projects) keep prior behaviour and
  // return no account, so tests and the emulator suite are unaffected.
  if (project !== 'velnix-6c1a2') return null;
  return `velnix-runtime-internal@${project}.iam.gserviceaccount.com`;
}
function runtimeOptions(account, project, emulator = false) {
  if (emulator) return {};
  const chosen = account || defaultRuntimeAccount(project);
  if (!chosen) return {};
  if (typeof chosen !== 'string') throw Error('invalid_runtime_service_account');
  const match = /^[a-z][a-z0-9-]{4,28}[a-z0-9]@([a-z][a-z0-9-]{4,28}[a-z0-9])\.iam\.gserviceaccount\.com$/.exec(chosen);
  if (!match || (project && match[1] !== project)) throw Error('invalid_runtime_service_account');
  return { serviceAccount: chosen };
}
module.exports = { runtimeOptions, defaultRuntimeAccount };

