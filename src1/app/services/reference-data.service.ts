import { Injectable } from '@angular/core';
import { OfflineVaultService } from './offline-vault.service';

interface SeedCategory {
  id: string;
  name: string;
}

interface SeedType {
  id: string;
  category_id: string;
  name: string;
}

interface SeedMember {
  id: string;
  name: string;
}

const DEFAULT_CATEGORIES: SeedCategory[] = [
  { id: 'cat_medical', name: 'Medical' },
  { id: 'cat_financial', name: 'Financial' },
  { id: 'cat_legal', name: 'Legal' },
  { id: 'cat_identity', name: 'Identity' },
  { id: 'cat_insurance', name: 'Insurance' },
  { id: 'cat_other', name: 'Other' }
];

const DEFAULT_TYPES: SeedType[] = [
  { id: 'type_med_prescription', category_id: 'cat_medical', name: 'Prescription' },
  { id: 'type_med_lab', category_id: 'cat_medical', name: 'Lab Report' },
  { id: 'type_med_vaccine', category_id: 'cat_medical', name: 'Vaccination Record' },
  { id: 'type_fin_statement', category_id: 'cat_financial', name: 'Bank Statement' },
  { id: 'type_fin_tax', category_id: 'cat_financial', name: 'Tax Document' },
  { id: 'type_fin_receipt', category_id: 'cat_financial', name: 'Receipt' },
  { id: 'type_legal_contract', category_id: 'cat_legal', name: 'Contract' },
  { id: 'type_legal_court', category_id: 'cat_legal', name: 'Court Document' },
  { id: 'type_id_passport', category_id: 'cat_identity', name: 'Passport' },
  { id: 'type_id_license', category_id: 'cat_identity', name: 'Driver\'s License' },
  { id: 'type_id_birth', category_id: 'cat_identity', name: 'Birth Certificate' },
  { id: 'type_ins_health', category_id: 'cat_insurance', name: 'Health Insurance' },
  { id: 'type_ins_vehicle', category_id: 'cat_insurance', name: 'Vehicle Insurance' },
  { id: 'type_other_misc', category_id: 'cat_other', name: 'Miscellaneous' }
];

/**
 * Replaces the old Supabase-backed members/categories/types lookups.
 * Fully local — no network, no auth dependency. Categories/types are
 * sensible defaults seeded once; members are user-created, seeded
 * with a single "Myself" entry so uploads aren't blocked on a fresh install.
 */
@Injectable({
  providedIn: 'root'
})
export class ReferenceDataService {

  constructor(
    private readonly offlineVault: OfflineVaultService
  ) {}

  async ensureDefaultCategories(): Promise<void> {

    const existing = await this.offlineVault.getCategories();

    if (existing.length > 0) {
      return;
    }

    await this.offlineVault.saveCategories(DEFAULT_CATEGORIES);
    await this.offlineVault.saveTypes(DEFAULT_TYPES);

    console.log('✅ Seeded default categories & types locally');

  }

  async ensureDefaultMember(): Promise<void> {

    const existing = await this.offlineVault.getMembers();

    if (existing.length > 0) {
      return;
    }

    const defaultMember: SeedMember = {
      id: 'member_self',
      name: 'Myself'
    };

    await this.offlineVault.saveMembers([defaultMember]);

    console.log('✅ Seeded default member locally');

  }

  async addMember(name: string): Promise<SeedMember> {

    const member: SeedMember = {
      id: `member_${Date.now()}`,
      name: name.trim()
    };

    const existing = await this.offlineVault.getMembers();

    await this.offlineVault.saveMembers([...existing, member]);

    return member;

  }

}