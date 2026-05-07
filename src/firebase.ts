import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  enableIndexedDbPersistence,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBaECMN4pNnUi-VRHnz-IKGy5jU9zsaW6c",
  authDomain: "evotrain-ce1fa.firebaseapp.com",
  projectId: "evotrain-ce1fa",
  storageBucket: "evotrain-ce1fa.firebasestorage.app",
  messagingSenderId: "907925871767",
  appId: "1:907925871767:web:967e254382d5abd8fa9dd2",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

enableIndexedDbPersistence(db).catch((error) => {
  console.log(
    "Persistência offline do Firestore não ativada:",
    error.code
  );
});