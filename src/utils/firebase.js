import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyAZCE6MMeEbJLtfFBJPTbW6SpiMLIfzT38",
    authDomain: "fir-app-6567b.firebaseapp.com",
    projectId: "fir-app-6567b",
    storageBucket: "fir-app-6567b.firebasestorage.app",
    messagingSenderId: "1019026455111",
    appId: "1:1019026455111:web:39a20699f420a869564f62",
    measurementId: "G-94GV08M9LJ"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        console.error("Auth Error:", error);
        throw error;
    }
};

export const logout = () => signOut(auth);
