import { Inject, Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FIREBASE_ADMIN } from './firebase.module';

/** Bọc Firestore Admin — chỗ duy nhất chạm DB. */
@Injectable()
export class FirestoreService {
  private readonly db: admin.firestore.Firestore;

  constructor(@Inject(FIREBASE_ADMIN) app: admin.app.App) {
    this.db = app.firestore();
  }

  get firestore(): admin.firestore.Firestore {
    return this.db;
  }

  collection(name: string) {
    return this.db.collection(name);
  }

  auth(): admin.auth.Auth {
    return admin.auth();
  }
}
