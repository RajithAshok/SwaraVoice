const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

let _token = sessionStorage.getItem('vs_token') || null;

export function setToken(t)  { _token = t; if (t) sessionStorage.setItem('vs_token', t); else sessionStorage.removeItem('vs_token'); }
export function getToken()   { return _token; }
export function clearToken() { setToken(null); }

async function request(method, path, body = null, isForm = false) {
  const headers = {};
  if (_token)          headers['Authorization'] = `Bearer ${_token}`;
  if (body && !isForm) headers['Content-Type']  = 'application/json';

  const res  = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    const msg = data.error
      || (data.errors && data.errors.map(e => e.msg).join(', '))
      || `Request failed (${res.status})`;
    const err  = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

const get    = (path)       => request('GET',    path);
const post   = (path, body) => request('POST',   path, body);
const patch  = (path, body) => request('PATCH',  path, body);
const del    = (path)       => request('DELETE', path);
const upload = (path, fd)   => request('POST',   path, fd, true);

export const authAPI = {
  login:          (email, password)              => post('/auth/login', { email, password }),
  me:             ()                             => get('/auth/me'),
  changePassword: (currentPassword, newPassword) => post('/auth/change-password', { currentPassword, newPassword }),
};

export const hospitalsAPI = {
  list:        ()         => get('/hospitals'),
  get:         (id)       => get(`/hospitals/${id}`),
  create:      (data)     => post('/hospitals', data),
  update:      (id, data) => patch(`/hospitals/${id}`, data),
  // Update the admin user linked to a hospital (name, specialisation, resetPassword)
  updateAdmin: (id, data) => patch(`/hospitals/${id}/admin`, data),
};

export const usersAPI = {
  listDoctors:      (hospitalID) => get(`/users/doctors${hospitalID ? `?hospitalID=${hospitalID}` : ''}`),
  createDoctor:     (data)       => post('/users/doctors', data),
  updateDoctor:     (id, data)   => patch(`/users/doctors/${id}`, data),
  updateMe:         (data)       => patch('/users/me', data),
  deactivateDoctor: (id)         => del(`/users/doctors/${id}`),
  updateAdmin:      (hospitalId, data) => patch(`/users/admin/${hospitalId}`, data),
};

export const patientsAPI = {
  list:    (all = false) => get(`/patients${all ? '?all=true' : ''}`),
  get:     (id)          => get(`/patients/${id}`),
  create:  (data)        => post('/patients', data),
  update:  (id, data)    => patch(`/patients/${id}`, data),
  addNote: (id, text)    => post(`/patients/${id}/notes`, { text }),
};

export const sessionsAPI = {
  listForPatient: (patientId) => get(`/sessions/patient/${patientId}`),
  create: (patientId, tracks) => {
    const fd = new FormData();
    fd.append('patientId', patientId);
    tracks.forEach(({ taskSuffix, blob, fileName }) => fd.append(taskSuffix, blob, fileName));
    return upload('/sessions', fd);
  },
};
