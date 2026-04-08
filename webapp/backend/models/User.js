const bcrypt = require('bcryptjs');
const { supabase } = require('../database/supabase');

class User {
  static async create(username, email, password, options = {}) {
    const password_hash = await bcrypt.hash(password, 10);
    const is_admin = !!options.isAdmin;

    const { data, error } = await supabase
      .from('users')
      .insert({ username, email, password_hash, is_admin })
      .select('id, username, email, is_admin')
      .single();

    if (error) {
      const msg = String(error.message || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique')) {
        throw new Error('Username or email already exists');
      }
      throw error;
    }

    return data;
  }

  static async findByUsername(username) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    return data || null;
  }

  static async findByEmail(email) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    return data || null;
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, is_admin, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }
    return data || null;
  }

  static async verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
  }

  static async logSignInAttempt(userId, username, success, req) {
    const ip_address = req.ip || req.connection?.remoteAddress || null;
    const user_agent = req.get('user-agent') || '';

    const { error } = await supabase
      .from('sign_in_attempts')
      .insert({
        user_id: userId ?? null,
        username,
        success: !!success,
        ip_address,
        user_agent
      });

    if (error) {
      // Log but don't break auth flow
      console.error('[SUPABASE] logSignInAttempt error', error);
    }
  }

  static async allBasic() {
    const { data, error } = await supabase
      .from('users')
      .select('id, username, email, is_admin, created_at')
      .order('id', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async timelinesBasicByUserId(userId) {
    const { data, error } = await supabase
      .from('timelines')
      .select('id, user_id, device_id, date_generated, created_at, updated_at')
      .eq('user_id', userId)
      .order('id', { ascending: false });

    if (error) throw error;
    return data || [];
  }
}

module.exports = User;
