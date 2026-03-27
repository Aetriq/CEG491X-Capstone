const { supabase } = require('../database/supabase');

class Timeline {
  static async create(userId, deviceId = null) {
    const { data, error } = await supabase
      .from('timelines')
      .insert({
        user_id: userId,
        device_id: deviceId,
        // date_generated, created_at, updated_at default to NOW() in DB
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('timelines')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  static async findByUserId(userId) {
    const { data, error } = await supabase
      .from('timelines')
      .select('*')
      .eq('user_id', userId)
      .order('date_generated', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async searchByDate(userId, date) {
    const { data, error } = await supabase
      .from('timelines')
      .select('*')
      .eq('user_id', userId)
      .gte('date_generated', `${date}T00:00:00.000Z`)
      .lte('date_generated', `${date}T23:59:59.999Z`)
      .order('date_generated', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async update(id, updates) {
    const payload = { ...updates, updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from('timelines')
      .update(payload)
      .eq('id', id);

    if (error) throw error;
    return { id, changes: 1 };
  }

  static async delete(id) {
    const { error } = await supabase
      .from('timelines')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { changes: 1 };
  }
}

module.exports = Timeline;
