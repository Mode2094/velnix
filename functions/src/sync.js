'use strict';
// Real-time sync revision counters.
//
// firestore.rules denies every direct client read of orders/companies/members/
// notices/settings, so real-time updates cannot use Firestore listeners on the
// business data itself. Instead this module keeps ONE tiny revision document
// (`sync/global`) and bumps the matching counter from a Firestore trigger on
// each relevant write. The client holds a single listener on that document and,
// when a counter changes, re-runs the same authorized callable queries it
// already uses for the visible segment — no polling, no listener per page, and
// no direct access to the protected collections.
//
// Cost: one trigger invocation and one single-field merge write per changed
// document. The triggers never read the changed data, so they are cheap and
// cannot leak anything: `sync/global` carries counters only.
const logger=require('firebase-functions/logger');

const REGION='europe-west1';
const SYNC_DOC='sync/global';

// Increment one counter. Safe to retry: a duplicate increment only ever makes a
// client re-read data it is already authorized to read, so it can never corrupt
// business state or leak information.
async function bumpSync(db, FieldValue, kind) {
  try {
    await db.doc(SYNC_DOC).set(
      {[kind]: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp()},
      {merge: true},
    );
  } catch (e) {
    // A revision bump must never fail the write that triggered it.
    logger.warn('sync_bump_failed', {kind, code: e?.code});
  }
}

module.exports = {bumpSync, SYNC_DOC, REGION};
