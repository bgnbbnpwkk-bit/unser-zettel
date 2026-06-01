import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

/*
 * FIRESTORE SECURITY RULES
 * Firebase Console → Firestore Database → Regeln → Bearbeiten
 *
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /{document=**} {
 *       allow read, write: if request.auth != null;
 *     }
 *   }
 * }
 */

const firebaseConfig = {
  apiKey:            'AIzaSyBZbh9UjXGbTTPIO_jewU41sTKYe4pHvNY',
  authDomain:        'unser-einkaufszettel.firebaseapp.com',
  databaseURL:       'https://unser-einkaufszettel-default-rtdb.europe-west1.firebasedatabase.app',
  projectId:         'unser-einkaufszettel',
  storageBucket:     'unser-einkaufszettel.firebasestorage.app',
  messagingSenderId: '1091522338551',
  appId:             '1:1091522338551:web:20bbe0ed444691eebcbdf2',
}

const app = initializeApp(firebaseConfig)
export const db             = getFirestore(app)
export const auth           = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
