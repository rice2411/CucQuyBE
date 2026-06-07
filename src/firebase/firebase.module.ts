import { Global, Module } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { loadConfig } from '../config/configuration';
import { FirestoreService } from './firestore.service';
import { FIREBASE_ADMIN } from './firebase.constants';

export { FIREBASE_ADMIN };

/**
 * Khởi tạo Firebase Admin 1 lần (singleton) từ service account env.
 * Global → mọi module dùng FirestoreService / auth không cần import lại.
 */
@Global()
@Module({
  providers: [
    {
      provide: FIREBASE_ADMIN,
      useFactory: (): admin.app.App => {
        if (admin.apps.length) return admin.app();
        const { firebase } = loadConfig();
        return admin.initializeApp({
          credential: admin.credential.cert({
            projectId: firebase.projectId,
            clientEmail: firebase.clientEmail,
            privateKey: firebase.privateKey,
          }),
          storageBucket: firebase.storageBucket,
        });
      },
    },
    FirestoreService,
  ],
  exports: [FIREBASE_ADMIN, FirestoreService],
})
export class FirebaseModule {}
