import React, { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import './Toast.css';

export default function Toast() {
  const { state } = useApp();
  const { toast } = state;

  if (!toast) return null;

  const icons = {
    success: '✓',
    error: '✕',
    info: 'ℹ',
    warning: '⚠',
  };

  return (
    <div className={`toast toast-${toast.type}`} key={toast.id}>
      <span className="toast-icon">{icons[toast.type] || icons.info}</span>
      <span className="toast-message">{toast.message}</span>
    </div>
  );
}
