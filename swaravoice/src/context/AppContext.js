import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import {
  authAPI, patientsAPI, sessionsAPI, usersAPI, hospitalsAPI,
  setToken, clearToken, getToken,
} from '../services/api';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

// Safely extract hospital name regardless of whether hospitalID is a
// populated object { name, hospitalID } or a bare ObjectId string.
export function getHospitalName(user) {
  if (!user?.hospitalID) return '';
  if (typeof user.hospitalID === 'object' && user.hospitalID !== null) {
    return user.hospitalID.name || '';
  }
  return ''; // bare ID — name not available yet
}

// Calculate age from ISO date string
export function calcAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  const today = new Date();
  const dob   = new Date(dateOfBirth);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const initialState = {
  isAuthenticated:   false,
  authLoading:       true,   // true while bootstrapping from sessionStorage token
  currentUser:       null,   // full user object from /auth/me
  selectedPatient:   null,   // currently viewed patient object
  selectedSessions:  [],     // sessions for the selected patient
  toast:             null,
};

// ─────────────────────────────────────────────
// REDUCER
// ─────────────────────────────────────────────
function appReducer(state, action) {
  switch (action.type) {
    case 'AUTH_READY':
      return { ...state, authLoading: false };
    case 'LOGIN':
      return { ...state, isAuthenticated: true, authLoading: false, currentUser: action.user };
    case 'LOGOUT':
      return { ...initialState, authLoading: false };
    case 'UPDATE_USER':
      return { ...state, currentUser: { ...state.currentUser, ...action.updates } };
    case 'SET_SELECTED_PATIENT':
      return { ...state, selectedPatient: action.patient, selectedSessions: [] };
    case 'UPDATE_SELECTED_PATIENT':
      return { ...state, selectedPatient: { ...state.selectedPatient, ...action.updates } };
    case 'SET_SESSIONS':
      return { ...state, selectedSessions: action.sessions };
    case 'SHOW_TOAST':
      return { ...state, toast: action.toast };
    case 'CLEAR_TOAST':
      return { ...state, toast: null };
    default:
      return state;
  }
}

// ─────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const toastTimer = useRef(null);

  // ── Bootstrap: restore session from sessionStorage token on page refresh ──
  useEffect(() => {
    const token = getToken();
    if (!token) { dispatch({ type: 'AUTH_READY' }); return; }
    authAPI.me()
      .then(({ user }) => dispatch({ type: 'LOGIN', user }))
      .catch(() => { clearToken(); dispatch({ type: 'AUTH_READY' }); });
  }, []);

  const showToast = (message, type = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    dispatch({ type: 'SHOW_TOAST', toast: { message, type, id: Date.now() } });
    toastTimer.current = setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), 3500);
  };

  // ─────────────────────────────────────────────
  // ACTIONS
  // ─────────────────────────────────────────────
  const actions = {

    // ── Auth ────────────────────────────────────────────────────────────────
    login: async (email, password) => {
      const { token, user } = await authAPI.login(email, password);
      setToken(token);
      dispatch({ type: 'LOGIN', user });
      return user;
    },

    logout: () => {
      clearToken();
      dispatch({ type: 'LOGOUT' });
    },

    changePassword: async (currentPassword, newPassword) => {
      await authAPI.changePassword(currentPassword, newPassword);
      dispatch({ type: 'UPDATE_USER', updates: { mustChangePassword: false } });
    },

    // ── Profile ─────────────────────────────────────────────────────────────
    updateProfile: async (data) => {
      const { user } = await usersAPI.updateMe(data);
      dispatch({ type: 'UPDATE_USER', updates: user });
      showToast('Profile updated', 'success');
    },

    // ── Patient selection (sets selected patient in global state) ────────────
    selectPatient: (patient) => {
      dispatch({ type: 'SET_SELECTED_PATIENT', patient });
    },

    // ── Patients — return data directly, pages manage their own loading state ─
    fetchPatients: (all = false) => patientsAPI.list(all),

    addPatient: async (data) => {
      const { patient } = await patientsAPI.create(data);
      return patient;
    },

    updatePatientCondition: async (patientId, prevMedicalCond) => {
      await patientsAPI.update(patientId, { prevMedicalCond });
      dispatch({ type: 'UPDATE_SELECTED_PATIENT', updates: { prevMedicalCond } });
      showToast('Medical conditions updated', 'success');
    },

    addNote: async (patientId, text) => {
      const { notes } = await patientsAPI.addNote(patientId, text);
      dispatch({ type: 'UPDATE_SELECTED_PATIENT', updates: { doctorNotes: notes } });
      showToast('Note added', 'success');
    },

    // ── Sessions ─────────────────────────────────────────────────────────────
    fetchSessions: async (patientId) => {
      const { sessions } = await sessionsAPI.listForPatient(patientId);
      dispatch({ type: 'SET_SESSIONS', sessions });
      return sessions;
    },

    // tracks = [{ taskSuffix, blob, fileName }]
    submitSession: async (patientId, tracks) => {
      const { session } = await sessionsAPI.create(patientId, tracks);
      // Prepend new session to list so it appears at top
      dispatch({ type: 'SET_SESSIONS', sessions: [session, ...state.selectedSessions] });
      showToast('Session uploaded successfully', 'success');
      return session;  // full session object including analysis field
    },

    // ── Users (Admin) ────────────────────────────────────────────────────────
    fetchDoctors: (hospitalID) => usersAPI.listDoctors(hospitalID),

    createDoctor: async (data) => {
      const result = await usersAPI.createDoctor(data);
      showToast('Doctor account created', 'success');
      return result;
    },

    updateDoctor: async (id, data) => {
      const result = await usersAPI.updateDoctor(id, data);
      showToast('Doctor updated', 'success');
      return result;
    },

    deactivateDoctor: async (id) => {
      await usersAPI.deactivateDoctor(id);
      showToast('Doctor deactivated', 'success');
    },

    // ── Hospitals (SuperAdmin) ───────────────────────────────────────────────
    fetchHospitals: () => hospitalsAPI.list(),

    createHospital: async (data) => {
      const result = await hospitalsAPI.create(data);
      showToast('Hospital created successfully', 'success');
      return result;
    },

    updateHospitalAdmin: async (hospitalId, data) => {
      const result = await hospitalsAPI.updateAdmin(hospitalId, data);
      showToast('Admin details updated', 'success');
      return result;
    },

    // ── Toast ────────────────────────────────────────────────────────────────
    showToast,
  };

  const role = state.currentUser?.role ?? null;

  return (
    <AppContext.Provider value={{
      state,
      actions,
      role,
      currentUser:      state.currentUser,
      selectedPatient:  state.selectedPatient,
      selectedSessions: state.selectedSessions,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be inside AppProvider');
  return ctx;
};