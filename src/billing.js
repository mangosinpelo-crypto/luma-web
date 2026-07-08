import { apiFetch } from './auth.js';

/**
 * Fetches user's current billing status (tier).
 */
export async function getBillingStatus() {
  const res = await apiFetch('/api/user/me');
  if (!res.ok) return { tier: 'free' };
  return await res.json();
}

/**
 * Creates a Stripe Checkout session and redirects.
 */
export async function checkout(plan) {
  const res = await apiFetch('/api/billing/checkout', {
    method: 'POST',
    body: JSON.stringify({ plan })
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Error al crear checkout');
  }

  const { url } = await res.json();
  window.location.href = url;
}

/**
 * Opens Stripe Customer Portal for managing subscription.
 */
export async function openPortal() {
  const res = await apiFetch('/api/billing/portal', { method: 'POST' });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Error al abrir portal');
  }

  const { url } = await res.json();
  window.location.href = url;
}

/**
 * Initializes billing UI: plan cards + upgrade buttons.
 */
export function initBillingUI() {
  const modal = document.getElementById('billing-modal');
  if (!modal) return;

  const closeBtn = document.getElementById('billing-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  }

  // Upgrade buttons
  document.querySelectorAll('[data-upgrade-plan]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const plan = btn.dataset.upgradePlan;
      btn.disabled = true;
      btn.textContent = 'Redirigiendo...';
      try {
        await checkout(plan);
      } catch (err) {
        alert(err.message);
        btn.disabled = false;
        btn.textContent = plan === 'premium' ? 'Mejorar a Premium' : 'Mejorar a Obsesión';
      }
    });
  });

  // Manage subscription button
  const manageBtn = document.getElementById('billing-manage-btn');
  if (manageBtn) {
    manageBtn.addEventListener('click', async () => {
      try {
        await openPortal();
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // Open billing modal button (in config panel)
  const openBillingBtn = document.getElementById('open-billing-btn');
  if (openBillingBtn) {
    openBillingBtn.addEventListener('click', () => {
      modal.classList.remove('hidden');
    });
  }
}

/**
 * Updates the tier badge in the UI.
 */
export function updateTierBadge(tier) {
  const badge = document.getElementById('tier-badge');
  if (!badge) return;

  const labels = {
    free: '🆓 Free',
    premium: '💎 Premium',
    obsesion: '👑 Obsesión'
  };

  badge.textContent = labels[tier] || labels.free;
  badge.className = `tier-badge tier-${tier}`;
}
