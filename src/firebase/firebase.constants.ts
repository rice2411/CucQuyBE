/** Token DI cho Firebase Admin app — tách riêng để tránh circular import
 *  giữa firebase.module.ts và firestore.service.ts. */
export const FIREBASE_ADMIN = 'FIREBASE_ADMIN';
