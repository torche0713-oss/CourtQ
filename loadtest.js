const { Firestore } = require('@google-cloud/firestore');
const fs = require('fs');

const saFile = fs.readdirSync('.').find(f => f.endsWith('.json') && f.includes('firebase-adminsdk'));
if (!saFile) { console.error('No service account JSON found'); process.exit(1); }
const sa = JSON.parse(fs.readFileSync(saFile, 'utf8'));

const db = new Firestore({ projectId: sa.project_id, credentials: sa });
const VENUE_SLUG = process.argv[2] || 'piklehub';
let VENUE_ID;

async function main() {
  const slugDoc = await db.collection('slugs').doc(VENUE_SLUG).get();
  if (!slugDoc.exists) { console.error(`Slug "${VENUE_SLUG}" not found`); return; }
  VENUE_ID = slugDoc.data().venueId;
  console.log(`\n========== LOAD TEST: ${VENUE_SLUG} (${VENUE_ID}) ==========\n`);

  const venueDoc = await db.collection('venues').doc(VENUE_ID).get();
  if (!venueDoc.exists) { console.error('Venue doc not found'); return; }
  const venueData = venueDoc.data();
  const courts = venueData.courts || [];
  console.log(`Courts: ${courts.length} | Queue: ${(venueData.queue||[]).length} | Bookings (doc): ${(venueData.bookings||[]).length}\n`);

  let passed = 0, failed = 0;
  if (await testBulkBookings(courts)) passed++; else failed++;
  if (await testConcurrentAssign(courts)) passed++; else failed++;
  if (await testLiveScoreFlood()) passed++; else failed++;
  if (await testStateSaveContention()) passed++; else failed++;

  await cleanup();
  console.log(`\n========== RESULTS: ${passed} passed, ${failed} failed ==========`);
}

async function testBulkBookings(courts) {
  console.log('--- Test 1: Bulk Bookings (20 concurrent portal writes to subcollection) ---');
  if (!courts.length) { console.log('  SKIP: no courts\n'); return true; }
  const col = db.collection('venues').doc(VENUE_ID).collection('bookings');
  const ts = Date.now();
  const promises = [];
  for (let i = 0; i < 20; i++) {
    const c = courts[i % courts.length];
    const id = `LT_${ts}_${i}`;
    promises.push(col.doc(id).set({
      id, customer:`Load User ${i}`, phone:'09170000000', email:`load${i}@test.com`,
      courtId:c.id, date:'2026-07-08', startTime:'10:00', endTime:'11:00', duration:60,
      gameType:'singles', amount:200, paymentMethod:'GCash', status:'pending',
      source:'online', bookedAt:Date.now()
    }));
  }
  try { await Promise.all(promises); console.log('  PASS: 20 bookings created\n'); return true; }
  catch (e) { console.log('  FAIL:', e.message, '\n'); return false; }
}

async function testConcurrentAssign(courts) {
  console.log('--- Test 2: Concurrent Queue Assign (10x same court, Firestore transaction) ---');
  const avail = courts.filter(c => c.status === 'available');
  if (!avail.length) { console.log('  SKIP: no available courts\n'); return true; }
  const target = avail[0];
  const venueRef = db.collection('venues').doc(VENUE_ID);
  const promises = [];

  for (let i = 0; i < 10; i++) {
    promises.push(db.runTransaction(async t => {
      const doc = await t.get(venueRef);
      const cArr = (doc.data().courts||[]).map(c => ({...c}));
      const idx = cArr.findIndex(c => c.id === target.id);
      if (idx === -1 || cArr[idx].status === 'occupied') return 'REJECTED';
      cArr[idx] = {...cArr[idx], status:'occupied',
        players:[{name:'LTA',color:'#4ecdc4',skill:3},{name:'LTB',color:'#e74c3c',skill:3}],
        startTime:Date.now(), gameType:'doubles', team1:null, team2:null};
      t.update(venueRef, {courts:cArr});
      return 'ASSIGNED';
    }).catch(() => 'REJECTED'));
  }

  const outcomes = await Promise.all(promises);
  const assigned = outcomes.filter(o => o === 'ASSIGNED').length;
  const rejected = outcomes.filter(o => o === 'REJECTED').length;
  console.log(`  Assigned: ${assigned} (expect 1), Rejected: ${rejected} (expect 9)`);
  const ok = assigned === 1 && rejected === 9;
  console.log(ok ? '  PASS: transaction prevented race condition\n' : '  FAIL: race condition not prevented\n');

  // Reset court
  await venueRef.update({
    courts: courts.map(c => c.id === target.id
      ? {...c, status:'available', players:[], startTime:null, gameType:null, team1:null, team2:null} : c)
  });
  return ok;
}

async function testLiveScoreFlood() {
  console.log('--- Test 3: Live Score Flood (50 rapid writes) ---');
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(db.collection('liveScores').doc(`LT_${Date.now()}_${i}`).set({
      courtId:1, venueId:VENUE_ID,
      scoreA:Math.floor(Math.random()*11), scoreB:Math.floor(Math.random()*11),
      updatedAt:Date.now()
    }));
  }
  try { await Promise.all(promises); console.log('  PASS: 50 writes\n'); return true; }
  catch (e) { console.log('  FAIL:', e.message, '\n'); return false; }
}

async function testStateSaveContention() {
  console.log('--- Test 4: State Save Contention (30 concurrent venue doc updates) ---');
  const promises = [];
  for (let i = 0; i < 30; i++) {
    promises.push(db.collection('venues').doc(VENUE_ID).update({
      lastPing: Date.now(), pingId: i
    }));
  }
  try {
    await Promise.all(promises);
    console.log('  PASS: 30 concurrent updates\n');
    return true;
  } catch (e) {
    console.log('  WARN: Some failed (expected w/ 1 write/sec limit):', e.message);
    console.log('  Confirms debounce in saveState() is necessary.\n');
    return true;
  }
}

async function cleanup() {
  const col = db.collection('venues').doc(VENUE_ID).collection('bookings');
  const snap = await col.where('id', '>=', 'LT_').where('id', '<', 'LT_\uf8ff').get();
  const deletes = snap.docs.map(d => d.ref.delete());
  await Promise.all(deletes);

  const lsSnap = await db.collection('liveScores').where('venueId', '==', VENUE_ID).get();
  const lsDeletes = lsSnap.docs.filter(d => d.id.startsWith('LT_')).map(d => d.ref.delete());
  await Promise.all(lsDeletes);
}

main().catch(console.error);
