// ============================================================
// PICKLESPOT PH - FIREBASE CONFIG & SERVICES
// ============================================================
// STEP 1: Create a Firebase project at https://console.firebase.google.com
// STEP 2: Enable Authentication (Email/Password), Firestore, and Storage
// STEP 3: Replace the config below with your own Firebase project config
// STEP 4: In Firebase Console > Authentication > Sign-in method > Enable Email/Password
// STEP 5: In Firestore > Create database > Start in test mode (or production)
// STEP 6: In Storage > Set up > Start in test mode

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC33FcO7YxNVpJE7pt8QrNfBVaQ0R6XOps",
  authDomain: "picklespotph-8553a.firebaseapp.com",
  projectId: "picklespotph-8553a",
  storageBucket: "picklespotph-8553a.firebasestorage.app",
  messagingSenderId: "847121039089",
  appId: "1:847121039089:web:b4cda36838300d33b83350"
};
// ============================================================
// EMAIL NOTIFICATIONS (via EmailJS - free tier: 200/mo)

// ============================================================
// MAILING LIST / SUBSCRIBERS
// ============================================================
const PickleMailing = {
  async subscribe(email, name) {
    if (!email) return;
    const existing = await db.collection(COLLECTIONS.SUBSCRIBERS)
      .where('email', '==', email)
      .get();
    if (!existing.empty) return;
    await db.collection(COLLECTIONS.SUBSCRIBERS).add({
      email,
      name,
      subscribedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  async getAll() {
    const snapshot = await db.collection(COLLECTIONS.SUBSCRIBERS).get();
    const subs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    subs.sort((a, b) => {
      const aT = a.subscribedAt?.toDate?.() || 0;
      const bT = b.subscribedAt?.toDate?.() || 0;
      return bT - aT;
    });
    return subs;
  }
};

// ============================================================
// EMAIL NOTIFICATIONS (via EmailJS - free tier: 200/mo)
// ============================================================
// To set up:
//   1. Sign up at https://emailjs.com (free)
//   2. Go to Email Services → Add New Service → connect Gmail
//   3. Go to Email Templates → Create Template with variables:
//      {{to_email}} {{to_name}} {{subject}} {{body}}
//   4. Copy Service ID, Template ID, and Public Key below
// ============================================================
const EMAILJS_CONFIG = {
  PUBLIC_KEY: 'ZqwVgBW5afMAIEWtS',
  SERVICE_ID: 'service_xh12jr3',
  TEMPLATE_ID: 'template_zbaoqpb'
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

const auth = firebase.auth();
const db = firebase.firestore();
let storage = null;
try { if (firebase.storage) storage = firebase.storage(); } catch {}
const googleProvider = new firebase.auth.GoogleAuthProvider();

// ============================================================
// FIRESTORE COLLECTIONS
// ============================================================
const COLLECTIONS = {
  COURTS: 'courts',
  USERS: 'users',
  BOOKINGS: 'bookings',
  REVIEWS: 'reviews',
  PAYMENTS: 'payments',
  CHATS: 'chats',
  MESSAGES: 'messages',
  SUBSCRIBERS: 'subscribers',
  TOURNAMENTS: 'tournaments',
  CLAIMS: 'claims',
  SCHEDULES: 'schedules',
  FAVORITES: 'favorites'
};

// ============================================================
// AUTH SERVICE
// ============================================================
const PickleAuth = {
  // Register new owner
  async register(email, password, displayName) {
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    await cred.user.updateProfile({ displayName });
    await db.collection(COLLECTIONS.USERS).doc(cred.user.uid).set({
      displayName,
      email,
      role: 'owner',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      plan: 'basic', // 'basic' or 'pro'
      stripeCustomerId: null
    });
    return cred.user;
  },

  // Login
  async login(email, password) {
    const cred = await auth.signInWithEmailAndPassword(email, password);
    return cred.user;
  },

  // Sign in with Google
  async signInWithGoogle() {
    try {
      const cred = await auth.signInWithPopup(googleProvider);
      const doc = await db.collection(COLLECTIONS.USERS).doc(cred.user.uid).get();
      if (!doc.exists) {
        await db.collection(COLLECTIONS.USERS).doc(cred.user.uid).set({
          displayName: cred.user.displayName,
          email: cred.user.email,
          role: 'owner',
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          plan: 'basic'
        });
      }
      return cred.user;
    } catch (popupErr) {
      if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/popup-closed-by-user') {
        await auth.signInWithRedirect(googleProvider);
        return;
      }
      throw popupErr;
    }
  },

  // Handle redirect result (call on page load to process redirect auth)
  async handleRedirectResult() {
    try {
      const cred = await auth.getRedirectResult();
      if (cred && cred.user) {
        const doc = await db.collection(COLLECTIONS.USERS).doc(cred.user.uid).get();
        if (!doc.exists) {
          await db.collection(COLLECTIONS.USERS).doc(cred.user.uid).set({
            displayName: cred.user.displayName,
            email: cred.user.email,
            role: 'owner',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            plan: 'basic'
          });
        }
        return cred.user;
      }
    } catch (err) {
      if (err.code !== 'auth/credential-already-in-use') throw err;
    }
  },

  // Logout
  logout() {
    return auth.signOut();
  },

  // Listen to auth state
  onAuthChanged(callback) {
    auth.onAuthStateChanged(callback);
  },

  // Get current user
  getCurrentUser() {
    return auth.currentUser;
  },

  // Get user profile from Firestore
  async getUserProfile(uid) {
    const doc = await db.collection(COLLECTIONS.USERS).doc(uid).get();
    return doc.exists ? doc.data() : null;
  },

  // Upgrade to Pro
  async upgradeToPro(uid) {
    await db.collection(COLLECTIONS.USERS).doc(uid).update({
      plan: 'pro',
      upgradedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  // Downgrade to Basic
  async downgradeToBasic(uid) {
    await db.collection(COLLECTIONS.USERS).doc(uid).update({
      plan: 'basic',
      upgradedAt: null,
      stripeCustomerId: null
    });
  }
};

// ============================================================
// COURTS SERVICE
// ============================================================
const PickleCourts = {
  // Get all courts
  async getAll() {
    const snapshot = await db.collection(COLLECTIONS.COURTS)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Get a single court
  async getById(courtId) {
    const doc = await db.collection(COLLECTIONS.COURTS).doc(courtId).get();
    return doc.exists ? { id: doc.id, ...doc.data() } : null;
  },

  // Get courts owned by a specific user
  async getByOwner(ownerId) {
    const snapshot = await db.collection(COLLECTIONS.COURTS)
      .where('ownerId', '==', ownerId)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Add a new court
  async add(courtData, ownerId) {
    const docRef = await db.collection(COLLECTIONS.COURTS).add({
      ...courtData,
      ownerId,
      verified: false,
      approved: true,
      featured: courtData.featured === true,
      photos: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  },

  // Update court
  async update(courtId, data) {
    await db.collection(COLLECTIONS.COURTS).doc(courtId).update(data);
  },

  // Delete court
  async delete(courtId) {
    await db.collection(COLLECTIONS.COURTS).doc(courtId).delete();
  },

  // Toggle verified badge (admin or pro feature)
  async setVerified(courtId, verified) {
    await db.collection(COLLECTIONS.COURTS).doc(courtId).update({ verified });
  },

  // Toggle featured
  async setFeatured(courtId, featured) {
    await db.collection(COLLECTIONS.COURTS).doc(courtId).update({ featured });
  },

  // Get courts by region
  async getByRegion(region) {
    const snapshot = await db.collection(COLLECTIONS.COURTS)
      .where('region', '==', region)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }
};

// ============================================================
// CLOUDINARY STORAGE (Free, no credit card needed)
// ============================================================
// 1. Sign up free at https://cloudinary.com
// 2. Copy your Cloud Name from the dashboard
// 3. Go to Settings > Upload > Enable unsigned uploading
// 4. Create an Upload Preset (unsigned) and copy the name
// 5. Paste both below:

const CLOUDINARY_CLOUD = 'dfjswmnx9';
const CLOUDINARY_PRESET = 'picklespot_ph';

const PickleStorage = {
  async uploadPhoto(courtId, file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_PRESET);
    formData.append('public_id', `courts/${courtId}/${Date.now()}`);

    const res = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD}/image/upload`,
      { method: 'POST', body: formData }
    );
    const data = await res.json();
    if (!data.secure_url) throw new Error('Upload failed: ' + (data.error?.message || 'unknown'));
    return data.secure_url;
  },

  async uploadMultiple(courtId, files) {
    const urls = [];
    for (const file of files) {
      const url = await this.uploadPhoto(courtId, file);
      urls.push(url);
    }
    return urls;
  }
};

// ============================================================
// BOOKINGS / INQUIRIES SERVICE
// ============================================================
const PickleBookings = {
  // Create a booking inquiry
  async create(data) {
    const docRef = await db.collection(COLLECTIONS.BOOKINGS).add({
      ...data,
      status: 'pending', // pending, confirmed, cancelled
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  },

  // Get bookings for a court (owner view)
  async getByCourt(courtId) {
    const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
      .where('courtId', '==', courtId)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Get bookings by a user (player view)
  async getByUser(userId) {
    const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
      .where('userId', '==', userId)
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Update booking status
  async updateStatus(bookingId, status) {
    await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).update({ status });
  },

  // Get a single booking by ID
  async getById(bookingId) {
    const doc = await db.collection(COLLECTIONS.BOOKINGS).doc(bookingId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }
};

// ============================================================
// REVIEWS SERVICE
// ============================================================
const PickleReviews = {
  // Add a review
  async add(data) {
    const docRef = await db.collection(COLLECTIONS.REVIEWS).add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  },

  // Get reviews for a court
  async getByCourt(courtId) {
    const snapshot = await db.collection(COLLECTIONS.REVIEWS)
      .where('courtId', '==', courtId)
      .get();
    const reviews = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    reviews.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return reviews;
  },

  // Get average rating for a court
  async getAverageRating(courtId) {
    const reviews = await this.getByCourt(courtId);
    if (reviews.length === 0) return { average: 0, count: 0 };
    const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
    return { average: Math.round((sum / reviews.length) * 10) / 10, count: reviews.length };
  }
};

// ============================================================
// PAYMENTS SERVICE (Pro Upgrade)
// ============================================================
const PicklePayments = {
  // Record a payment record (manual GCash/PayMaya for now)
  async recordPayment(uid, data) {
    const docRef = await db.collection(COLLECTIONS.PAYMENTS).add({
      userId: uid,
      amount: data.amount,
      method: data.method, // 'gcash', 'paymaya', 'bank'
      reference: data.reference,
      plan: 'pro',
      status: 'pending', // pending, verified, failed
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  },

  // Verify payment (admin)
  async verifyPayment(paymentId) {
    await db.collection(COLLECTIONS.PAYMENTS).doc(paymentId).update({
      status: 'verified',
      verifiedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  },

  // Get user's payments
  async getByUser(uid) {
    const snapshot = await db.collection(COLLECTIONS.PAYMENTS)
      .where('userId', '==', uid)
      .get();
    const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    payments.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return payments;
  },

  // Get all payments (admin view)
  async getAll() {
    const snapshot = await db.collection(COLLECTIONS.PAYMENTS)
      .get();
    const payments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    payments.sort((a, b) => {
      const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return payments;
  }
};

// ============================================================
// CHAT SERVICE (Real-time)
// ============================================================
const PickleChat = {
  // Create a chat room (from a booking inquiry)
  async createRoom(data) {
    const chatRef = await db.collection(COLLECTIONS.CHATS).add({
      courtId: data.courtId,
      courtName: data.courtName,
      ownerId: data.ownerId,
      customerName: data.customerName,
      customerContact: data.customerContact,
      customerEmail: data.customerEmail || '',
      lastMessage: data.lastMessage || '',
      lastSender: data.lastSender || '',
      unreadOwner: 0,
      unreadCustomer: 0,
      status: 'active',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return chatRef.id;
  },

  // Send a message in a chat room
  async sendMessage(chatId, senderId, senderName, text) {
    const msgRef = await db.collection(COLLECTIONS.MESSAGES).add({
      chatId,
      senderId,
      senderName,
      text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    // Update last message on the chat room
    const updateData = {
      lastMessage: text,
      lastSender: senderName,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (senderId === 'customer') updateData.unreadOwner = firebase.firestore.FieldValue.increment(1);
    else if (senderId === 'owner') updateData.unreadCustomer = firebase.firestore.FieldValue.increment(1);
    await db.collection(COLLECTIONS.CHATS).doc(chatId).update(updateData);
    return msgRef.id;
  },

  // Real-time listener for messages in a chat room
  onMessages(chatId, callback) {
    return db.collection(COLLECTIONS.MESSAGES)
      .where('chatId', '==', chatId)
      .onSnapshot(snapshot => {
        const msgs = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort client-side to avoid needing a composite index
        msgs.sort((a, b) => {
          const ta = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
          const tb = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
          return ta - tb;
        });
        callback(msgs);
      }, err => {
        console.error('Chat listener error:', err);
      });
  },

  // Get all chats for an owner (real-time)
  onOwnerChats(ownerId, callback) {
    return db.collection(COLLECTIONS.CHATS)
      .where('ownerId', '==', ownerId)
      .onSnapshot(snapshot => {
        const chats = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort client-side to avoid needing a composite index
        chats.sort((a, b) => {
          const ta = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
          const tb = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
          return tb - ta;
        });
        callback(chats);
      }, err => {
        console.error('Owner chats listener error:', err);
      });
  },

  // Mark messages as read for owner
  async markOwnerRead(chatId) {
    await db.collection(COLLECTIONS.CHATS).doc(chatId).update({
      unreadOwner: 0
    });
  },

  // Mark messages as read for customer
  async markCustomerRead(chatId) {
    await db.collection(COLLECTIONS.CHATS).doc(chatId).update({
      unreadCustomer: 0
    });
  },

  // Increment unread count for owner
  async incrementUnreadOwner(chatId) {
    const chat = await db.collection(COLLECTIONS.CHATS).doc(chatId).get();
    const data = chat.data();
    await db.collection(COLLECTIONS.CHATS).doc(chatId).update({
      unreadOwner: (data.unreadOwner || 0) + 1
    });
  },

  // Get all chats as list (non-realtime)
  async getOwnerChats(ownerId) {
    const snapshot = await db.collection(COLLECTIONS.CHATS)
      .where('ownerId', '==', ownerId)
      .orderBy('updatedAt', 'desc')
      .get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },

  // Get a single chat room by ID
  async getById(chatId) {
    const doc = await db.collection(COLLECTIONS.CHATS).doc(chatId).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }
};

// ============================================================
// EMAIL NOTIFICATION SERVICE
// ============================================================
function generateCalendarUrl(title, dateStr, timeStr, location) {
  if (!dateStr || !timeStr) return '';
  let startTime, endTime;
  if (timeStr.includes('-')) {
    const [s, e] = timeStr.split('-');
    startTime = s;
    endTime = e;
  } else {
    startTime = timeStr;
    const [h, m] = timeStr.split(':').map(Number);
    const endM = h * 60 + m + 60;
    endTime = `${String(Math.floor(endM / 60)).padStart(2,'0')}:${String(endM % 60).padStart(2,'0')}`;
  }
  const d = dateStr.replace(/-/g, '');
  const start = `${d}T${startTime.replace(':', '')}00`;
  const end = `${d}T${endTime.replace(':', '')}00`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    location: location || '',
    sf: 'true',
    output: 'xml'
  });
  return `https://www.google.com/calendar/render?${params.toString()}`;
}

const PickleNotifications = {
  async send(toEmail, toName, subject, body) {
    if (typeof emailjs === 'undefined') return;
    if (!EMAILJS_CONFIG.PUBLIC_KEY || !EMAILJS_CONFIG.SERVICE_ID || !EMAILJS_CONFIG.TEMPLATE_ID) return;
    try {
      await emailjs.send(EMAILJS_CONFIG.SERVICE_ID, EMAILJS_CONFIG.TEMPLATE_ID, {
        to_email: toEmail,
        to_name: toName,
        subject: subject,
        body: body
      });
    } catch (err) {
      console.error('Email send failed:', err);
    }
  },

  async notifyOwnerNewBooking(ownerId, bookingData, courtName) {
    try {
      const owner = await PickleAuth.getUserProfile(ownerId);
      if (!owner || !owner.email) return;
      const body = `New booking inquiry at ${courtName}!\n\nCustomer: ${bookingData.name}\nContact: ${bookingData.contact}\nDate: ${bookingData.date}\nTime: ${bookingData.time}\nPlayers: ${bookingData.players}\nMessage: ${bookingData.message || 'None'}`;
      await this.send(owner.email, owner.displayName || 'Owner', `New Booking: ${courtName}`, body);
    } catch (err) {
      console.error('[PickleSpot] Failed to notify owner of booking:', err);
    }
  },

  async notifyAdminNewPayment(userEmail, userName, paymentData) {
    const body = `New Pro upgrade payment!\n\nUser: ${userName}\nEmail: ${userEmail}\nAmount: ₱${paymentData.amount}\nMethod: ${paymentData.method}\nReference: ${paymentData.reference}`;
    await this.send('torche0713@gmail.com', 'Admin', 'New Pro Upgrade Payment', body);
  },

  async notifyCustomerBookingStatus(customerEmail, customerName, courtName, status, date, time, location) {
    if (!customerEmail) return;
    const emoji = status === 'confirmed' ? '✅' : status === 'rejected' ? '❌' : '⏳';
    const label = status.charAt(0).toUpperCase() + status.slice(1);
    let body = `${emoji} Your booking at ${courtName} has been ${label}.\n\nCourt: ${courtName}\nStatus: ${label}`;
    if (status === 'confirmed' && date && time) {
      const calUrl = generateCalendarUrl(`Pickleball at ${courtName}`, date, time, location);
      body += `\n\nAdd to Google Calendar: ${calUrl}`;
    }
    await this.send(customerEmail, customerName, `Booking ${label}: ${courtName}`, body);
  },

  async notifyOwnerNewMessage(chatId, senderName, text) {
    try {
      const chat = await PickleChat.getById(chatId);
      if (!chat || !chat.ownerId) return;
      const owner = await PickleAuth.getUserProfile(chat.ownerId);
      if (!owner || !owner.email) return;
      const courtName = chat.courtName || 'Court';
      const body = `New message from ${senderName} regarding ${courtName}:\n\n"${text}"\n\nOpen your dashboard to reply.`;
      await this.send(owner.email, owner.displayName || 'Owner', `New Message: ${courtName}`, body);
    } catch {}
  },

  async notifyAdminNewCourt(courtData, owner) {
    const body = `New court added by ${owner.displayName || 'Unknown'} (${owner.email || 'No email'})!\n\nCourt: ${courtData.name}\nLocation: ${courtData.city}, ${courtData.region}\nType: ${courtData.type}\nAccess: ${courtData.access}\nRate: ${courtData.rate || 'N/A'}\nContact: ${courtData.contact || 'N/A'}`;
    await this.send('torche0713@gmail.com', 'Admin', `New Court Added: ${courtData.name}`, body);
  },

  async notifyOwnerCourtAdded(ownerEmail, ownerName, courtName) {
    const body = `Hi ${ownerName || 'there'},\n\nThank you for adding "${courtName}" to PickleSpotPH! Your court listing is now live and visible to all players searching for pickleball courts.\n\nYou can manage your listing from your dashboard at any time.\n\nHappy playing!\n- The PickleSpotPH Team`;
    await this.send(ownerEmail, ownerName, `Your court "${courtName}" is now live! 🎉`, body);
  },

  async notifyAdminNewClaim(claimData, courtName) {
    const body = `New court claim request!\n\nClaimant: ${claimData.name}\nEmail: ${claimData.email}\nContact: ${claimData.contact || 'N/A'}\nMessage: ${claimData.message || 'N/A'}\nCourt: ${courtName}`;
    await this.send('torche0713@gmail.com', 'Admin', `Court Claim Request: ${courtName}`, body);
  },

  async notifyClaimantApproved(email, name, courtName) {
    const body = `Hi ${name || 'there'},\n\nYour claim for "${courtName}" has been approved! You can now manage this court from your dashboard.\n\nPlease log in at https://picklespotph.site/dashboard.html with the email you used to claim. Once logged in, you can edit your court, manage bookings, and more.\n\nHappy playing!\n- The PickleSpotPH Team`;
    await this.send(email, name, `Your claim for "${courtName}" is approved! ✅`, body);
  }
};

// Init EmailJS if configured
if (typeof emailjs !== 'undefined' && EMAILJS_CONFIG.PUBLIC_KEY) {
  emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
}

// ============================================================
// TOURNAMENTS SERVICE
// ============================================================
const PickleTournaments = {
  async add(data) {
    const docRef = await db.collection(COLLECTIONS.TOURNAMENTS).add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  },
  async getAll() {
    const snapshot = await db.collection(COLLECTIONS.TOURNAMENTS).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  async getByOwner(ownerId) {
    const all = await this.getAll();
    return all.filter(t => t.ownerId === ownerId);
  },
  async update(id, data) {
    await db.collection(COLLECTIONS.TOURNAMENTS).doc(id).update(data);
  },
  async delete(id) {
    await db.collection(COLLECTIONS.TOURNAMENTS).doc(id).delete();
  },
  async getUpcoming() {
    const all = await this.getAll();
    const now = new Date();
    return all.filter(t => {
      const d = new Date(t.date);
      return d >= now || isNaN(d.getTime());
    }).sort((a, b) => new Date(a.date) - new Date(b.date));
  }
};

// ============================================================
// OPEN PLAY SCHEDULES SERVICE
// ============================================================
const PickleSchedules = {
  async add(data) {
    const docRef = await db.collection(COLLECTIONS.SCHEDULES).add({
      ...data,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  },
  async getAll() {
    const snapshot = await db.collection(COLLECTIONS.SCHEDULES).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  async getByOwner(ownerId) {
    const all = await this.getAll();
    return all.filter(s => s.ownerId === ownerId);
  },
  async getByCourt(courtId) {
    const all = await this.getAll();
    return all.filter(s => s.courtId === courtId);
  },
  async update(id, data) {
    await db.collection(COLLECTIONS.SCHEDULES).doc(id).update(data);
  },
  async delete(id) {
    await db.collection(COLLECTIONS.SCHEDULES).doc(id).delete();
  }
};

// ============================================================
// CLAIMS SERVICE
// ============================================================
const PickleClaims = {
  async add(data) {
    const docRef = await db.collection(COLLECTIONS.CLAIMS).add({
      ...data,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return docRef.id;
  },
  async getAll() {
    const snapshot = await db.collection(COLLECTIONS.CLAIMS).get();
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  },
  async approve(claimId, userId) {
    const claim = await db.collection(COLLECTIONS.CLAIMS).doc(claimId).get();
    const data = claim.data();
    if (data.courtId) {
      if (isNaN(data.courtId)) {
        const updateData = { ownerId: userId, verified: true };
        if (data.courtLat && data.courtLng) {
          updateData.lat = data.courtLat;
          updateData.lng = data.courtLng;
        }
        await db.collection(COLLECTIONS.COURTS).doc(data.courtId).update(updateData);
      } else {
        await db.collection(COLLECTIONS.COURTS).add({
          name: data.courtName || 'Claimed Court',
          city: data.courtCity || '',
          province: data.courtProvince || '',
          region: data.courtRegion || '',
          type: data.courtType || '',
          access: data.courtAccess || '',
          rate: data.courtRate || '',
          contact: data.courtContact || '',
          address: data.courtAddress || '',
          hours: data.courtHours || '',
          lat: data.courtLat || null,
          lng: data.courtLng || null,
          courts: data.courtCourts || 1,
          amenities: data.courtAmenities || [],
          ownerId: userId,
          verified: true,
          approved: true,
          featured: false,
          photos: [],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    await db.collection(COLLECTIONS.CLAIMS).doc(claimId).update({ status: 'approved' });
  },
  async reject(claimId) {
    await db.collection(COLLECTIONS.CLAIMS).doc(claimId).update({ status: 'rejected' });
  }
};

// ============================================================
// HELPER: Check if user is Pro
// ============================================================
async function isProUser(uid) {
  const profile = await PickleAuth.getUserProfile(uid);
  return profile?.plan === 'pro';
}

// ============================================================
// FAVORITES SERVICE
// ============================================================
const PickleFavorites = {
  async toggle(userId, courtId, courtName) {
    const existing = await db.collection(COLLECTIONS.FAVORITES)
      .where('userId', '==', userId)
      .where('courtId', '==', String(courtId))
      .get();
    if (!existing.empty) {
      await db.collection(COLLECTIONS.FAVORITES).doc(existing.docs[0].id).delete();
      return false;
    }
    await db.collection(COLLECTIONS.FAVORITES).add({
      userId,
      courtId: String(courtId),
      courtName,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    return true;
  },

  async getByUser(userId) {
    const snapshot = await db.collection(COLLECTIONS.FAVORITES)
      .where('userId', '==', userId)
      .get();
    return snapshot.docs.map(doc => doc.data().courtId);
  }
};

// ============================================================
// ANALYTICS
// ============================================================
const PickleAnalytics = {
  async trackView(courtId) {
    if (!courtId || typeof courtId !== 'string') return;
    try {
      await db.collection(COLLECTIONS.COURTS).doc(courtId).update({
        views: firebase.firestore.FieldValue.increment(1)
      });
    } catch (e) {
      try {
        await db.collection(COLLECTIONS.COURTS).doc(courtId).set({
          views: 1
        }, { merge: true });
      } catch {}
    }
  },

  async getViews(courtId) {
    try {
      const doc = await db.collection(COLLECTIONS.COURTS).doc(courtId).get();
      return doc.exists ? (doc.data().views || 0) : 0;
    } catch { return 0; }
  },

  async getBookingCount(courtId) {
    try {
      const snapshot = await db.collection(COLLECTIONS.BOOKINGS)
        .where('courtId', '==', courtId)
        .get();
      return snapshot.docs.length;
    } catch { return 0; }
  }
};
