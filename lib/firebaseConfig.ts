import { initializeApp } from "firebase/app";
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyBKBt-qxrxz1JOudYvXwrhnmLBflRS06NQ",
  authDomain: "infinity-834e5.firebaseapp.com",
  projectId: "infinity-834e5",
  storageBucket: "infinity-834e5.firebasestorage.app",
  messagingSenderId: "564739557621",
  appId: "1:564739557621:web:81813b31402a044a7f5dbc",
  measurementId: "G-T3MHYR4NNF"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, auth, db };
