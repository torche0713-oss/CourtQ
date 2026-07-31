// Paste this into the admin browser console (F12) while on admin.html?venue=dev
(async () => {
    const ref = db.collection('venues').doc(VENUE_ID);
    
    // 1. Delete old bookings field from venue doc (already migrated to subcollection)
    await ref.update({bookings: firebase.firestore.FieldValue.delete()});
    console.log('✓ Deleted bookings field from venue doc');
    
    // 2. Delete all documents from bookings subcollection (stale demo data)
    const snap = await bkCol().get();
    let count = 0;
    const batch = db.batch();
    snap.forEach(d => { batch.delete(d.ref); count++; });
    await batch.commit();
    console.log('✓ Deleted ' + count + ' booking documents from subcollection');
    
    // 3. Delete devFees field (demo data not used by the app)
    await ref.update({devFees: firebase.firestore.FieldValue.delete()});
    console.log('✓ Deleted devFees field');
    
    console.log('✅ Cleanup complete! Refresh the page.');
})();
