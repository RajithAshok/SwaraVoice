// ─────────────────────────────────────────────
// api.js — Central API client
//
// All backend communication goes through here.
// JWT token is stored in module-level memory (not React state, not localStorage)
// so it's never exposed to the DOM and is cleared on page refresh.
// ─────────────────────────────────────────────

const BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Module-level token store — lives in JS memory only
let _token = null;

export function setToken(token) { _token = token; }
export function getToken()      { return _token;  }
export function clearToken()    { _token = null;  }

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function request(method, path, body = null, isMultipart = false) {
  const headers = {};

  if (_token) {
    headers['Authorization'] = `Bearer ${_token}`;
  }

  if (!isMultipart && body) {
    headers['Content-Type'] = 'application/json';
  }

  const options = {
    method,
    headers,
    body: isMultipart ? body : body ? JSON.stringify(body) : undefined,
  };

  const res = await fetch(`${BASE_URL}${path}`, options);

  // Handle empty responses (e.g. 204 No Content)
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    // Throw a structured error so callers can read error.message
    const message = data.error || data.errors?.[0]?.msg || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }

  return data;
}

const get    = (path)         => request('GET',    path);
const post   = (path, body)   => request('POST',   path, body);
const patch  = (path, body)   => request('PATCH',  path, body);
const del    = (path)         => request('DELETE', path);
const upload = (path, formData) => request('POST', path, formData, true);

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authAPI = {
  login:          (email, password)             => post('/auth/login', { email, password }),
  me:             ()                            => get('/auth/me'),
  changePassword: (currentPassword, newPassword) => post('/auth/change-password', { currentPassword, newPassword }),
};

// ── Hospitals (SuperAdmin only) ───────────────────────────────────────────────

export const hospitalsAPI = {
  list:   ()                => get('/hospitals'),
  get:    (id)              => get(`/hospitals/${id}`),
  create: (data)            => post('/hospitals', data),
  update: (id, data)        => patch(`/hospitals/${id}`, data),
};

// ── Users ─────────────────────────────────────────────────────────────────────

export const usersAPI = {
  getDoctors:   (hospitalID) => get(`/users/doctors${hospitalID ? `?hospitalID=${hospitalID}` : ''}`),
  createDoctor: (data)       => post('/users/doctors', data),
  updateMe:     (data)       => patch('/users/me', data),
  deleteDoctor: (id)         => del(`/users/doctors/${id}`),
};

// ── Patients ──────────────────────────────────────────────────────────────────

export const patientsAPI = {
  // Doctor: own patients. Admin: pass all=true for hospital-wide
  list:      (all = false)  => get(`/patients${all ? '?all=true' : ''}`),
  get:       (id)           => get(`/patients/${id}`),
  create:    (data)         => post('/patients', data),
  update:    (id, data)     => patch(`/patients/${id}`, data),
  addNote:   (id, text)     => post(`/patients/${id}/notes`, { text }),
};

// ── Sessions ──────────────────────────────────────────────────────────────────

export const sessionsAPI = {
  // Fetch all sessions for a patient (returns with presigned R2 URLs)
  listForPatient: (patientId) => get(`/sessions/patient/${patientId}`),

  // Submit a completed session — 4 WAV blobs as multipart/form-data
  // taskRecordings: [{ task: { suffix }, blob }]
  create: (patientId, taskRecordings) => {
    const formData = new FormData();
    formData.append('patientId', patientId);
    taskRecordings.forEach(({ task, blob }) => {
      // Field name must match the multer field names on the backend: aa, glide, mpt, text
      formData.append(task.suffix, blob, `${task.suffix}.wav`);
    });
    return upload('/sessions', formData);
  },
};
