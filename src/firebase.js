import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyBZbh9UjXGbTTPIO_jewU41sTKYe4pHvNY",
  authDomain: "unser-einkaufszettel.firebaseapp.com",
  projectId: "unser-einkaufszettel",
  storageBucket: "unser-einkaufszettel.firebasestorage.app",
  messagingSenderId: "1091522338551",
  appId: "1:1091522338551:web:20bbe0ed444691eebcbdf2"
}

const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
