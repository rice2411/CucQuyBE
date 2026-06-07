import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../../firebase/firestore.service';

const COL = 'customers';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  country?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly fs: FirestoreService) {}

  private mapCustomer(id: string, r: Record<string, unknown>): Customer {
    return {
      id,
      name: typeof r.name === 'string' ? r.name : '',
      phone: typeof r.phone === 'string' ? r.phone : '',
      email: typeof r.email === 'string' ? r.email : undefined,
      address: typeof r.address === 'string' ? r.address : undefined,
      city: typeof r.city === 'string' ? r.city : undefined,
      country: typeof r.country === 'string' ? r.country : undefined,
    };
  }

  async fetchCustomers(): Promise<Customer[]> {
    const snap = await this.fs.collection(COL).orderBy('createdAt', 'desc').get();
    return snap.docs.map((d) => this.mapCustomer(d.id, d.data() as Record<string, unknown>));
  }

  async addCustomer(data: Omit<Customer, 'id'>): Promise<{ id: string }> {
    const ref = await this.fs.collection(COL).add({
      ...data,
      createdAt: admin.firestore.Timestamp.now(),
    });
    return { id: ref.id };
  }

  async updateCustomer(id: string, data: Partial<Omit<Customer, 'id'>>): Promise<void> {
    const { id: _ignored, ...updateData } = data as Record<string, unknown>;
    await this.fs.collection(COL).doc(id).update(updateData);
  }

  async deleteCustomer(id: string): Promise<void> {
    await this.fs.collection(COL).doc(id).delete();
  }
}
