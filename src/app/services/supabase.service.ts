import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as CryptoJS from 'crypto-js';
@Injectable({
  providedIn: 'root',
})
export class SupabaseService {

  public supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      'https://erknyrsdkhwvjlpgsdtu.supabase.co',
      'sb_publishable_z-HrXWdrJAKIaUE5dpe7QA_zZBL4epD'
    );
  }

  // 🔐 LOGIN
  async login(email: string, password: string) {
    return await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
  }

  // 📤 UPLOAD FILE (SECURE)
// 📤 UPLOAD FILE (SECURE)

async uploadFile(
  file: File
) {

  const {
    data: userData
  } =
    await this.supabase
      .auth
      .getUser();

  const userId =
    userData.user?.id;

  if (!userId) {

    throw new Error(
      'User not logged in'
    );
  }

  // ✅ KEEP ORIGINAL ENCRYPTED NAME
  const filePath =
    `${userId}/${file.name}`;

  console.log(
    '☁️ UPLOADING:',
    filePath
  );

  const {
    error
  } =
    await this.supabase
      .storage
      .from('documents')
      .upload(
        filePath,
        file,
        {

          // ✅ overwrite same file safely
          upsert: true
        }
      );

  if (error) {

    console.error(
      'Upload error:',
      error
    );

    throw error;
  }

  return filePath;
}

  // 🔗 SIGNED URL (SECURE ACCESS)
  async getSignedUrl(path: string) {
    const { data, error } = await this.supabase.storage
      .from('documents')
      .createSignedUrl(path, 60); // expires in 60 seconds

    if (error) {
      console.error('Signed URL error:', error);
      return null;
    }

    return data?.signedUrl;
  }

  // 📄 SAVE METADATA (DB)
  async saveRecord(record: any) {
 return await this.supabase
  .from('records')
  .insert([record])
  .select()
  .single();
  }

  // 📥 GET DOCUMENTS
async getDocuments(
  lastSync?: string
) {

  let query =
    this.supabase
      .from('records')
      .select(`
        id,
        file_url,
        created_at,
        members(name),
        categories(name),
        file_type,
        types(name)
      `);

  // ✅ fetch only newer docs
  if (lastSync) {

    query =
      query.gt(
        'created_at',
        lastSync
      );
  }

  return await query.order(
    'created_at',
    { ascending: false }
  );
}

  // 📦 DELETE FILE FROM STORAGE
  async deleteFile(path: string) {
    return await this.supabase.storage
      .from('documents')
      .remove([path]);
  }

  // 🗑 DELETE RECORD FROM DB
  async deleteRecord(id: string) {
    return await this.supabase
      .from('records')
      .delete()
      .eq('id', id);
  }

  // 📋 MASTER DATA APIs
  async getMembers() {
    return await this.supabase
      .from('members')
      .select('*');
  }

  async getCategories() {
    return await this.supabase
      .from('categories')
      .select('*');
  }

  async getTypes(categoryId: string) {
    return await this.supabase
      .from('types')
      .select('*')
      .eq('category_id', categoryId);
  }

  getAllTypes() {
    return this.supabase
      .from('types')
      .select('*')
      .order('name', { ascending: true });
  }

async ensureVault(loginPassword: string) {
  const { data: userData, error } = await this.getCurrentUser();

  if (error || !userData.user) {
    console.error('User not found');
    return;
  }

  const userId = userData.user.id;

  // 🔍 check if vault exists
  const { data: existing, error: checkError } = await this.supabase
    .from('user_vaults')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (checkError) {
    console.error('Vault check failed', checkError);
    return;
  }

  // 🆕 create if not exists
if (!existing) {

  // 🔐 random salt
  const salt =
    CryptoJS.lib.WordArray
      .random(128 / 8)
      .toString();

  // 🔐 derive key from LOGIN password
  const key = CryptoJS.PBKDF2(
    loginPassword,
    salt,
    {
      keySize: 256 / 32,
      iterations: 100000
    }
  ).toString();

  // 🔥 vault validation token
  const vaultCheck =
    CryptoJS.AES.encrypt(
      'vault-check',
      key
    ).toString();

  // 💾 save vault
  const { error: insertError } =
    await this.supabase
      .from('user_vaults')
      .insert({
        user_id: userId,
        salt: salt,
        vault_check: vaultCheck
      });

  if (insertError) {

    console.error(
      'Vault creation failed',
      insertError
    );

  } else {

    console.log('Vault created');

  }
}
}

async getCurrentUser() {
  return await this.supabase.auth.getUser();
}

async getVaultData(userId: string) {

  return await this.supabase
    .from('user_vaults')
    .select('salt, vault_check')
    .eq('user_id', userId)
    .single();
}

async getVaultSalt(userId: string) {
  return await this.supabase
    .from('user_vaults')
    .select('salt')
    .eq('user_id', userId)
    .maybeSingle(); // ✅ safer
}

}