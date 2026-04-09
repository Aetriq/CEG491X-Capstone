// webapp/Backend/models/Events.js

const { supabase } = require('../database/supabase');

class Event {
  static async create(timelineId, eventData) {
    console.log('[DB-DEBUG] Event.create', { timelineId, eventNumber: eventData?.eventNumber, time: eventData?.time });
    const {
      eventNumber,
      time,
      transcript,
      latitude,
      longitude,
      audioFilePath,
      audioDuration
    } = eventData;

    const { data, error } = await supabase
      .from('events')
      .insert({
        timeline_id: timelineId,
        event_number: eventNumber,
        time,
        transcript,
        latitude,
        longitude,
        audio_file_path: audioFilePath,
        audio_duration: audioDuration
      })
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  static async findByTimelineId(timelineId) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('timeline_id', timelineId)
      .order('event_number', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  static async findById(id) {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  }

  static async update(id, updates) {
    const payload = { ...updates, updated_at: new Date().toISOString() };

    const { error } = await supabase
      .from('events')
      .update(payload)
      .eq('id', id);

    if (error) throw error;
    return { id, changes: 1 };
  }

  static async delete(id) {
    const { error } = await supabase
      .from('events')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { changes: 1 };
  }
}

module.exports = Event;
