// services/api.js
const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? ''
    : `${window.location.protocol}//${window.location.hostname}:5000`);

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    credentials: 'include',
    cache: method === 'GET' ? 'no-store' : 'default',
    ...options,
    headers: {
      ...DEFAULT_HEADERS,
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message = data?.error || `HTTP ${response.status}: ${response.statusText}`;
    throw new Error(message);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data;
}

export class TimetableAPI {
  static async generateTimetable(inputData) {
    return request('/generate_timetable', {
      method: 'POST',
      body: JSON.stringify(inputData),
    });
  }

  static async validateInput(inputData) {
    return request('/validate_input', {
      method: 'POST',
      body: JSON.stringify(inputData),
    });
  }

  static async resetTeacher(inputData, timetable, teacher, day, slot) {
    return request('/reset_teacher', {
      method: 'POST',
      body: JSON.stringify({
        teacher,
        day,
        slot,
        inputData,
        timetable,
      }),
    });
  }

  static async generateMultipleTimetables(inputData, count = 3) {
    const results = [];
    const errors = [];

    for (let i = 0; i < count; i++) {
      try {
        const modifiedInputData = {
          ...inputData,
          _generation_seed: Math.random() * 1000,
          _variation: i + 1,
        };

        const result = await this.generateTimetable(modifiedInputData);
        results.push({
          id: i + 1,
          name: `Version ${i + 1}`,
          data: result,
          generated_at: new Date().toISOString(),
        });

        if (i < count - 1) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        errors.push({
          variation: i + 1,
          error: error.message,
        });
      }
    }

    return { results, errors };
  }

  static async login(username, password) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  static async logout() {
    return request('/auth/logout', { method: 'POST' });
  }

  static async me() {
    return request('/auth/me', { method: 'GET' });
  }

  static async registerStart(payload) {
    return request('/auth/register/start', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  static async registerVerify(registrationId, code) {
    return request('/auth/register/verify', {
      method: 'POST',
      body: JSON.stringify({ registration_id: registrationId, code }),
    });
  }

  static async publishTimetable(inputData, timetableData) {
    return request('/admin/publish_timetable', {
      method: 'POST',
      body: JSON.stringify({ inputData, timetableData }),
    });
  }

  static async getPublishedTimetable() {
    return request('/admin/published_timetable', { method: 'GET' });
  }

  static async deletePublishedTimetable() {
    return request('/admin/published_timetable', { method: 'DELETE' });
  }

  static async getTeacherTimetable() {
    return request('/teacher/timetable', { method: 'GET' });
  }

  static async getAvailableTheorySlots(day, slot) {
    return request('/teacher/available_theory_slots', {
      method: 'POST',
      body: JSON.stringify({ day, slot }),
    });
  }

  static async requestTeacherReschedule(day, slot, requestType = 'unavailable', preferredSlot = null) {
    return request('/teacher/request_reschedule', {
      method: 'POST',
      body: JSON.stringify({
        day,
        slot,
        request_type: requestType,
        preferred_slot: preferredSlot,
      }),
    });
  }

  static async getStudentTimetable() {
    return request('/student/timetable', { method: 'GET' });
  }

  static async getRescheduleRequests() {
    return request('/admin/reschedule_requests', { method: 'GET' });
  }

  static async approveRescheduleRequest(requestId) {
    return request(`/admin/reschedule_requests/${requestId}/approve`, { method: 'POST' });
  }

  static async rejectRescheduleRequest(requestId, adminNote = '') {
    return request(`/admin/reschedule_requests/${requestId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ admin_note: adminNote }),
    });
  }

  static async getTeacherRegistrationRequests() {
    return request('/admin/registration_requests', { method: 'GET' });
  }

  static async getActivityFeed() {
    return request('/admin/activity_feed', { method: 'GET' });
  }

  static async approveTeacherRegistration(registrationId) {
    return request(`/admin/registration_requests/${registrationId}/approve`, { method: 'POST' });
  }

  static async rejectTeacherRegistration(registrationId, reason = '') {
    return request(`/admin/registration_requests/${registrationId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }
}
