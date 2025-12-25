
import { initializeApp, getApps, getApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";
import { getFirestore, doc, setDoc, onSnapshot, collection, query, where, orderBy, limit } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAMJjeucsuWiIrOKJ19AK6VT9zLS7ZB6MY",
    authDomain: "medtrackmamdouh.firebaseapp.com",
    projectId: "medtrackmamdouh",
    storageBucket: "medtrackmamdouh.firebasestorage.app",
    messagingSenderId: "588115249832",
    appId: "1:588115249832:web:1e8a2f5dd57db68047909d"
};

// Initialize Firebase safely
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Services
export const db = getFirestore(app);
export const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

// Request notification permission and return FCM token
export const requestNotificationPermission = async () => {
  if (!messaging) return null;
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const baseUrl = (import.meta as any).env?.BASE_URL || '/';
      const swUrl = baseUrl + 'firebase-messaging-sw.js';
      const registration = await navigator.serviceWorker.register(swUrl);
      const token = await getToken(messaging, {
        vapidKey: 'BLzY0D83d0M5sWss4qGpmJ35KuzM25E3gSZb9stAYJDeEme8uVfxCJY_X5gSKOQ1woJaxjuDTB433e0M4Sw1Y1A',
        serviceWorkerRegistration: registration
      });
      return token;
    }
  } catch (error) {
    console.error("Error with notifications:", error);
  }
  return null;
};

// Sync patient state to Firestore
export const syncPatientData = async (patientId: string, data: any) => {
  try {
    const patientDoc = doc(db, "patients", patientId);
    await setDoc(patientDoc, {
      ...data,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  } catch (error) {
    console.error("Error syncing data:", error);
  }
};

// Listen to real-time updates for a patient document
export const listenToPatient = (patientId: string, callback: (data: any) => void) => {
  try {
    const patientDoc = doc(db, "patients", patientId);
    return onSnapshot(patientDoc, (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data());
      }
    }, (error) => {
      console.error("Firestore Listen Error:", error);
    });
  } catch (error) {
    console.error("Error setting up patient listener:", error);
    return () => {};
  }
};

/**
 * Listens for new notifications for a specific patient.
 * Fixes the missing export error in App.tsx.
 */
export const listenForNotifications = (patientId: string, callback: (notif: any) => void) => {
  try {
    const notificationsCol = collection(db, "notifications");
    const q = query(
      notificationsCol,
      where("patientId", "==", patientId),
      orderBy("timestamp", "desc"),
      limit(1)
    );
    
    return onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        // Only trigger callback for new additions to the collection
        if (change.type === "added") {
          callback(change.doc.data());
        }
      });
    }, (error) => {
      console.error("Notifications Listen Error:", error);
    });
  } catch (error) {
    console.error("Error setting up notifications listener:", error);
    return () => {};
  }
};
