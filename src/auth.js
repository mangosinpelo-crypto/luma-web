import { createClient } from '@supabase/supabase-js';

// These are public (anon) keys — safe to expose in frontend
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let supabase = null;

function getClient() {
  if (!supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return supabase;
}

/**
 * Get current session (null if not logged in).
 */
export async function getSession() {
  const client = getClient();
  if (!client) return null;
  const { data: { session } } = await client.auth.getSession();
  return session;
}

/**
 * Get auth token for API calls.
 */
export async function getToken() {
  const session = await getSession();
  return session?.access_token || null;
}

/**
 * Sign up with email/password.
 */
export async function signUp(email, password) {
  const client = getClient();
  if (!client) throw new Error('Supabase no configurado');
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Sign in with email/password.
 */
export async function signIn(email, password) {
  const client = getClient();
  if (!client) throw new Error('Supabase no configurado');
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/**
 * Sign in with Google OAuth.
 */
export async function signInWithGoogle() {
  const client = getClient();
  if (!client) throw new Error('Supabase no configurado');
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) throw error;
  return data;
}

/**
 * Sign out.
 */
export async function signOut() {
  const client = getClient();
  if (!client) return;
  await client.auth.signOut();
}

/**
 * Listen for auth state changes.
 */
export function onAuthStateChange(callback) {
  const client = getClient();
  if (!client) return { data: { subscription: { unsubscribe: () => {} } } };
  return client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

/**
 * Helper: make authenticated API calls.
 */
export async function apiFetch(path, options = {}) {
  const token = await getToken();
  const headers = {
    ...options.headers,
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(path, { ...options, headers });
  return res;
}

/**
 * Renders auth UI and handles login/register flow.
 */
export function initAuthUI() {
  const modal = document.getElementById('auth-modal');
  if (!modal) return;

  const loginForm = document.getElementById('auth-login-form');
  const registerForm = document.getElementById('auth-register-form');
  const switchToRegister = document.getElementById('auth-switch-register');
  const switchToLogin = document.getElementById('auth-switch-login');
  const googleBtn = document.getElementById('auth-google-btn');
  const authError = document.getElementById('auth-error');
  const loginSection = document.getElementById('auth-login-section');
  const registerSection = document.getElementById('auth-register-section');

  function showError(msg) {
    if (authError) {
      authError.textContent = msg;
      authError.classList.remove('hidden');
    }
  }

  function hideError() {
    if (authError) authError.classList.add('hidden');
  }

  if (switchToRegister) {
    switchToRegister.addEventListener('click', (e) => {
      e.preventDefault();
      hideError();
      loginSection.classList.add('hidden');
      registerSection.classList.remove('hidden');
    });
  }

  if (switchToLogin) {
    switchToLogin.addEventListener('click', (e) => {
      e.preventDefault();
      hideError();
      registerSection.classList.add('hidden');
      loginSection.classList.remove('hidden');
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();
      const email = document.getElementById('auth-login-email').value.trim();
      const password = document.getElementById('auth-login-password').value;
      try {
        await signIn(email, password);
        modal.classList.add('hidden');
        window.dispatchEvent(new Event('authChanged'));
      } catch (err) {
        showError(err.message || 'Error al iniciar sesión');
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      hideError();
      const email = document.getElementById('auth-register-email').value.trim();
      const password = document.getElementById('auth-register-password').value;
      if (password.length < 6) {
        return showError('La contraseña debe tener al menos 6 caracteres');
      }
      try {
        await signUp(email, password);
        showError('');
        if (authError) {
          authError.textContent = '¡Cuenta creada! Revisa tu email para confirmar.';
          authError.style.color = '#10b981';
          authError.classList.remove('hidden');
        }
      } catch (err) {
        showError(err.message || 'Error al crear cuenta');
      }
    });
  }

  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      hideError();
      try {
        await signInWithGoogle();
      } catch (err) {
        showError(err.message || 'Error con Google');
      }
    });
  }
}
