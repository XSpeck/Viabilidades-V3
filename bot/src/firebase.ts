import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { FIREBASE } from "./config";

initializeApp({
  credential: cert({
    projectId:   FIREBASE.projectId,
    clientEmail: FIREBASE.clientEmail,
    privateKey:  FIREBASE.privateKey,
  }),
});

export const db = getFirestore();
