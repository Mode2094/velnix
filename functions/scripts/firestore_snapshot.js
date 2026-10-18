'use strict';
// Local-only disaster-recovery rehearsal tool for Velnix Firestore data.
// Usage (isolated emulator only):
//   node scripts/firestore_snapshot.js backup  --project demo-velnix --file snapshot.json [--force]
//   node scripts/firestore_snapshot.js verify  --project demo-velnix --file snapshot.json
//   node scripts/firestore_snapshot.js restore --project demo-velnix --file snapshot.json [--apply]
// Guards (no bypass option exists): refuses velnix-6c1a2, refuses any project
// that is not "demo-*", and refuses any Firestore host that is not loopback.
// Restore is a dry run unless --apply is passed. The tool never logs document
// values and never deletes documents.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FORMAT = 'velnix-firestore-snapshot-v1';
const PRODUCTION_PROJECTS = new Set(['velnix-6c1a2']);
const DEMO_PROJECT = /^demo-[a-z0-9][a-z0-9-]*$/;
const LOOPBACK = /^127\.0\.0\.1:\d+$/;
const MAX_SNAPSHOT_BYTES = 64 * 1024 * 1024;
const BATCH_SIZE = 400;
const MAX_EXTRA_SAMPLES = 10;

function assertIsolatedEnvironment(projectId, env = process.env) {
  if (typeof projectId !== 'string' || !projectId) throw Error('project_id_required');
  if (PRODUCTION_PROJECTS.has(projectId)) throw Error('production_project_refused');
  if (!DEMO_PROJECT.test(projectId)) throw Error('non_demo_project_refused');
  if (!LOOPBACK.test(env.FIRESTORE_EMULATOR_HOST || '')) throw Error('emulator_host_required');
  return projectId;
}

function createIsolatedDb(projectId, env = process.env) {
  assertIsolatedEnvironment(projectId, env);
  // firebase-admin resolves the emulator endpoint from the process environment.
  // The guard above already proved the value is loopback.
  process.env.FIRESTORE_EMULATOR_HOST = env.FIRESTORE_EMULATOR_HOST;
  const {initializeApp, getApps} = require('firebase-admin/app');
  const {getFirestore} = require('firebase-admin/firestore');
  const app = getApps().length ? getApps()[0] : initializeApp({projectId});
  return getFirestore(app);
}

const TYPE_TIMESTAMP = 'timestamp';
const TYPE_REFERENCE = 'reference';
const TYPE_GEOPOINT = 'geopoint';
const TYPE_BYTES = 'bytes';
const RESERVED_KEY = '__velnixType';

function classOf(value) {
  return value && value.constructor && typeof value.constructor.name === 'string' ? value.constructor.name : '';
}

function encodeValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('snapshot_unsupported_value');
    return value;
  }
  if (Buffer.isBuffer(value)) return {[RESERVED_KEY]: TYPE_BYTES, value: value.toString('base64')};
  if (Array.isArray(value)) return value.map(encodeValue);
  if (typeof value === 'object') {
    const kind = classOf(value);
    if (kind === 'Timestamp') {
      if (!Number.isInteger(value.seconds) || !Number.isInteger(value.nanoseconds)) throw Error('snapshot_unsupported_value');
      return {[RESERVED_KEY]: TYPE_TIMESTAMP, seconds: value.seconds, nanoseconds: value.nanoseconds};
    }
    if (kind === 'DocumentReference') {
      if (typeof value.path !== 'string') throw Error('snapshot_unsupported_value');
      return {[RESERVED_KEY]: TYPE_REFERENCE, value: value.path};
    }
    if (kind === 'GeoPoint') {
      if (!Number.isFinite(value.latitude) || !Number.isFinite(value.longitude)) throw Error('snapshot_unsupported_value');
      return {[RESERVED_KEY]: TYPE_GEOPOINT, latitude: value.latitude, longitude: value.longitude};
    }
    if (kind !== 'Object') throw Error('snapshot_unsupported_value');
    const encoded = {};
    for (const key of Object.keys(value).sort()) {
      if (key === RESERVED_KEY) throw Error('snapshot_reserved_field_name');
      encoded[key] = encodeValue(value[key]);
    }
    return encoded;
  }
  throw Error('snapshot_unsupported_value');
}

function decodeValue(value, db) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => decodeValue(item, db));
  const kind = value[RESERVED_KEY];
  if (kind !== undefined) {
    if (kind === TYPE_TIMESTAMP) {
      const {Timestamp} = require('firebase-admin/firestore');
      return new Timestamp(value.seconds, value.nanoseconds);
    }
    if (kind === TYPE_REFERENCE) return db.doc(value.value);
    if (kind === TYPE_GEOPOINT) {
      const {GeoPoint} = require('firebase-admin/firestore');
      return new GeoPoint(value.latitude, value.longitude);
    }
    if (kind === TYPE_BYTES) return Buffer.from(value.value, 'base64');
    throw Error('snapshot_unknown_type');
  }
  const decoded = {};
  for (const key of Object.keys(value)) decoded[key] = decodeValue(value[key], db);
  return decoded;
}

function patternOf(documentPath) {
  return documentPath.split('/').map((segment, index) => (index % 2 ? '*' : segment)).join('/');
}

function assertDocumentPath(documentPath) {
  if (typeof documentPath !== 'string' || !documentPath || documentPath.length > 1500 || documentPath.includes('//')) throw Error('snapshot_path_invalid');
  const segments = documentPath.split('/');
  if (segments.length % 2 !== 0) throw Error('snapshot_path_invalid');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || segment.startsWith('__')) throw Error('snapshot_path_invalid');
  }
}

function canonicalDocuments(documents) {
  return JSON.stringify(documents.map(document => [document.path, document.data]));
}

function buildSnapshot(documents, {projectId, env = process.env, now = Date.now} = {}) {
  assertIsolatedEnvironment(projectId, env);
  const sorted = [...documents].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  for (const document of sorted) {
    assertDocumentPath(document.path);
    if (!document.data || typeof document.data !== 'object' || Array.isArray(document.data)) throw Error('snapshot_document_invalid');
  }
  const canonical = canonicalDocuments(sorted);
  const patterns = {};
  for (const document of sorted) {
    const key = patternOf(document.path);
    patterns[key] = (patterns[key] || 0) + 1;
  }
  const createdAtMillis = now();
  return {
    format: FORMAT,
    projectId,
    createdAt: new Date(createdAtMillis).toISOString(),
    createdAtMillis,
    source: 'firestore-emulator',
    emulatorHost: env.FIRESTORE_EMULATOR_HOST,
    documents: sorted,
    manifest: {
      documentCount: sorted.length,
      patterns,
      sha256: crypto.createHash('sha256').update(canonical).digest('hex'),
      bytes: Buffer.byteLength(canonical),
    },
  };
}

function verifySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw Error('snapshot_object_required');
  if (snapshot.format !== FORMAT) throw Error('snapshot_format_unsupported');
  if (!Array.isArray(snapshot.documents)) throw Error('snapshot_documents_required');
  const seen = new Set();
  const patterns = {};
  for (const document of snapshot.documents) {
    if (!document || !document.data || typeof document.data !== 'object' || Array.isArray(document.data)) throw Error('snapshot_document_invalid');
    assertDocumentPath(document.path);
    if (seen.has(document.path)) throw Error('snapshot_duplicate_path');
    seen.add(document.path);
    const key = patternOf(document.path);
    patterns[key] = (patterns[key] || 0) + 1;
  }
  const manifest = snapshot.manifest;
  if (!manifest || typeof manifest !== 'object') throw Error('snapshot_manifest_missing');
  if (manifest.documentCount !== snapshot.documents.length) throw Error('snapshot_manifest_count_mismatch');
  if (JSON.stringify(manifest.patterns) !== JSON.stringify(patterns)) throw Error('snapshot_manifest_patterns_mismatch');
  const sha256 = crypto.createHash('sha256').update(canonicalDocuments(snapshot.documents)).digest('hex');
  if (sha256 !== manifest.sha256) throw Error('snapshot_hash_mismatch');
  return {ok: true, projectId: snapshot.projectId || null, documentCount: snapshot.documents.length, patterns, sha256};
}

function parseSnapshot(text) {
  if (typeof text !== 'string' || !text) throw Error('snapshot_text_required');
  if (Buffer.byteLength(text) > MAX_SNAPSHOT_BYTES) throw Error('snapshot_too_large');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    throw Error('snapshot_not_json');
  }
  verifySnapshot(parsed);
  return parsed;
}

// Subcollection IDs known to the Velnix schema. Implicit parent documents are
// not returned by collection queries, so their subcollection documents are
// discovered through collection-group reads instead. A new subcollection name
// must be added here (and is covered by the emulator test).
const KNOWN_SUBCOLLECTION_IDS = Object.freeze(['events']);

async function collectDocuments(db, {subcollectionIds = KNOWN_SUBCOLLECTION_IDS} = {}) {
  const documents = [];
  const seen = new Set();
  const push = doc => {
    if (seen.has(doc.ref.path)) return;
    seen.add(doc.ref.path);
    documents.push({path: doc.ref.path, data: encodeValue(doc.data())});
  };
  async function walkCollection(collectionRef) {
    const snapshot = await collectionRef.get();
    for (const doc of snapshot.docs) {
      push(doc);
      for (const sub of await doc.ref.listCollections()) await walkCollection(sub);
    }
  }
  for (const collection of await db.listCollections()) await walkCollection(collection);
  for (const id of subcollectionIds) {
    for (const doc of (await db.collectionGroup(id).get()).docs) {
      push(doc);
      for (const sub of await doc.ref.listCollections()) await walkCollection(sub);
    }
  }
  return documents;
}

async function createSnapshot(db, {projectId, env = process.env, now = Date.now, subcollectionIds} = {}) {
  assertIsolatedEnvironment(projectId, env);
  return buildSnapshot(await collectDocuments(db, {subcollectionIds}), {projectId, env, now});
}

async function verifyDatabase(db, documents) {
  const missing = [];
  const mismatched = [];
  for (const document of documents) {
    const snapshot = await db.doc(document.path).get();
    if (!snapshot.exists) {
      missing.push(document.path);
      continue;
    }
    if (JSON.stringify(encodeValue(snapshot.data())) !== JSON.stringify(document.data)) mismatched.push(document.path);
  }
  return {expected: documents.length, missing, mismatched};
}

async function listExtras(db, documents) {
  const expected = new Set(documents.map(document => document.path));
  const collectionPaths = new Set();
  for (const document of documents) {
    const segments = document.path.split('/');
    for (let index = 1; index < segments.length; index += 2) collectionPaths.add(segments.slice(0, index).join('/'));
  }
  let count = 0;
  const samplePaths = [];
  for (const collectionPath of collectionPaths) {
    const snapshot = await db.collection(collectionPath).get();
    for (const doc of snapshot.docs) {
      if (expected.has(doc.ref.path)) continue;
      count += 1;
      if (samplePaths.length < MAX_EXTRA_SAMPLES) samplePaths.push(doc.ref.path);
    }
  }
  return {count, samplePaths};
}

async function restoreSnapshot(db, snapshot, {projectId, env = process.env, apply = false, onBeforeWrite = null, batchSize = BATCH_SIZE} = {}) {
  assertIsolatedEnvironment(projectId, env);
  const verified = verifySnapshot(snapshot);
  if (snapshot.projectId && snapshot.projectId !== projectId) throw Error('snapshot_project_mismatch');
  if (snapshot.documents.length === 0) throw Error('empty_snapshot_refused');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 500) throw Error('batch_size_invalid');
  if (!apply) return {applied: false, dryRun: true, projectId, planned: snapshot.documents.length, sha256: verified.sha256};
  let written = 0;
  for (let offset = 0; offset < snapshot.documents.length; offset += batchSize) {
    const batch = db.batch();
    for (const document of snapshot.documents.slice(offset, offset + batchSize)) {
      if (onBeforeWrite) await onBeforeWrite(document);
      batch.set(db.doc(document.path), decodeValue(document.data, db));
    }
    await batch.commit();
    written += Math.min(batchSize, snapshot.documents.length - offset);
  }
  const check = await verifyDatabase(db, snapshot.documents);
  const extraInTarget = await listExtras(db, snapshot.documents);
  return {
    applied: true,
    dryRun: false,
    projectId,
    written,
    expected: check.expected,
    missing: check.missing,
    mismatched: check.mismatched,
    verified: check.missing.length === 0 && check.mismatched.length === 0,
    extraInTarget,
    sha256: verified.sha256,
  };
}

function parseArgs(argv) {
  const action = argv[0];
  const options = {};
  for (let index = 1; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--project') options.project = argv[++index];
    else if (argument === '--file') options.file = argv[++index];
    else if (argument === '--apply') options.apply = true;
    else if (argument === '--force') options.force = true;
    else throw Error('unknown_argument');
  }
  if (!['backup', 'verify', 'restore'].includes(action)) throw Error('action_required');
  if (!options.project) throw Error('project_id_required');
  if (!options.file) throw Error('file_required');
  return {action, options};
}

const STATIC_ERROR = /^[a-z][a-z0-9_]{2,60}$/;

async function main(argv, io = {log: console.log, error: console.error}, env = process.env) {
  const summary = {action: argv[0] || null, ok: false};
  try {
    const {action, options} = parseArgs(argv);
    summary.action = action;
    assertIsolatedEnvironment(options.project, env);
    summary.projectId = options.project;
    if (action === 'backup') {
      const db = createIsolatedDb(options.project, env);
      const snapshot = await createSnapshot(db, {projectId: options.project, env});
      if (fs.existsSync(options.file) && !options.force) throw Error('output_file_exists');
      fs.mkdirSync(path.dirname(path.resolve(options.file)), {recursive: true});
      fs.writeFileSync(options.file, JSON.stringify(snapshot));
      Object.assign(summary, {ok: true, file: options.file, documentCount: snapshot.documents.length, patterns: snapshot.manifest.patterns, sha256: snapshot.manifest.sha256});
      io.log(JSON.stringify(summary));
      return 0;
    }
    const text = fs.readFileSync(options.file, 'utf8');
    const snapshot = parseSnapshot(text);
    if (action === 'verify') {
      const report = verifySnapshot(snapshot);
      Object.assign(summary, {ok: true, file: options.file, documentCount: report.documentCount, patterns: report.patterns, sha256: report.sha256});
      io.log(JSON.stringify(summary));
      return 0;
    }
    if (!options.apply) {
      const plan = await restoreSnapshot(null, snapshot, {projectId: options.project, env, apply: false});
      Object.assign(summary, {ok: true, file: options.file, dryRun: true, planned: plan.planned, sha256: plan.sha256});
      io.log(JSON.stringify(summary));
      return 0;
    }
    const db = createIsolatedDb(options.project, env);
    const result = await restoreSnapshot(db, snapshot, {projectId: options.project, env, apply: true});
    Object.assign(summary, {file: options.file, dryRun: false, written: result.written, documentCount: result.expected, verified: result.verified, missing: result.missing.length, mismatched: result.mismatched.length, extraInTarget: result.extraInTarget, sha256: result.sha256});
    if (!result.verified) throw Error('restore_verification_failed');
    summary.ok = true;
    io.log(JSON.stringify(summary));
    return 0;
  } catch (error) {
    // Only static guard codes are surfaced; raw exception messages could
    // otherwise echo file paths or document content into logs.
    const message = error && typeof error.message === 'string' && STATIC_ERROR.test(error.message) ? error.message : 'operation_failed';
    summary.error = message;
    io.error(JSON.stringify(summary));
    return 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; });
}

module.exports = {FORMAT, KNOWN_SUBCOLLECTION_IDS, assertIsolatedEnvironment, createIsolatedDb, encodeValue, decodeValue, patternOf, buildSnapshot, verifySnapshot, parseSnapshot, collectDocuments, createSnapshot, restoreSnapshot, verifyDatabase, listExtras, main};
