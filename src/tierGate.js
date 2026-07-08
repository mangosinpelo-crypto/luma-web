/**
 * Client-side tier gating.
 * Mirrors server-side TIER_FEATURES for instant UI feedback.
 */
const TIER_FEATURES = {
  free: {
    maxMessagesPerDay: 15,
    arquetipos: ['mejorAmigo'],
    autonomousMessages: false,
    evolution: false,
    multipleCharacters: false,
    customArchetype: false,
    realLifeMode: false,
    exportHistory: false
  },
  premium: {
    maxMessagesPerDay: Infinity,
    arquetipos: ['pareja', 'amigaToxica', 'rival', 'ex', 'mejorAmigo'],
    autonomousMessages: true,
    evolution: true,
    multipleCharacters: false,
    customArchetype: false,
    realLifeMode: false,
    exportHistory: false
  },
  obsesion: {
    maxMessagesPerDay: Infinity,
    arquetipos: ['pareja', 'amigaToxica', 'rival', 'ex', 'mejorAmigo'],
    autonomousMessages: true,
    evolution: true,
    multipleCharacters: true,
    customArchetype: true,
    realLifeMode: true,
    exportHistory: true
  }
};

let currentTier = 'free';

export function setTier(tier) {
  currentTier = tier;
  applyTierGating();
}

export function getTier() {
  return currentTier;
}

export function getFeatures() {
  return TIER_FEATURES[currentTier] || TIER_FEATURES.free;
}

export function canUse(feature) {
  const features = getFeatures();
  return !!features[feature];
}

export function canUseArchetype(archetypeId) {
  const features = getFeatures();
  return features.arquetipos.includes(archetypeId);
}

export function getRemainingMessages(usedToday) {
  const features = getFeatures();
  if (features.maxMessagesPerDay === Infinity) return Infinity;
  return Math.max(0, features.maxMessagesPerDay - usedToday);
}

/**
 * Applies visual gating: adds lock overlays on blocked features.
 */
function applyTierGating() {
  const features = getFeatures();

  // Gate archetype cards
  document.querySelectorAll('.archetype-card').forEach(card => {
    const id = card.dataset.id;
    if (id && !features.arquetipos.includes(id)) {
      card.classList.add('locked');
      if (!card.querySelector('.lock-overlay')) {
        const overlay = document.createElement('div');
        overlay.className = 'lock-overlay';
        overlay.innerHTML = '🔒 Premium';
        overlay.addEventListener('click', (e) => {
          e.stopPropagation();
          const billingModal = document.getElementById('billing-modal');
          if (billingModal) billingModal.classList.remove('hidden');
        });
        card.appendChild(overlay);
      }
    } else {
      card.classList.remove('locked');
      const overlay = card.querySelector('.lock-overlay');
      if (overlay) overlay.remove();
    }
  });

  // Gate archetype select options
  const select = document.getElementById('arquetipo-select');
  if (select) {
    Array.from(select.options).forEach(opt => {
      if (!features.arquetipos.includes(opt.value)) {
        opt.disabled = true;
        opt.textContent = opt.textContent.replace(' 🔒', '') + ' 🔒';
      } else {
        opt.disabled = false;
        opt.textContent = opt.textContent.replace(' 🔒', '');
      }
    });
  }

  // Gate evolution checkbox
  const evoCheckbox = document.getElementById('evolucion-checkbox');
  if (evoCheckbox && !features.evolution) {
    evoCheckbox.disabled = true;
    evoCheckbox.checked = false;
    const label = evoCheckbox.closest('label');
    if (label && !label.querySelector('.lock-tag')) {
      const tag = document.createElement('span');
      tag.className = 'lock-tag';
      tag.textContent = '🔒 Premium';
      label.appendChild(tag);
    }
  }

  // Update message counter display
  const counterEl = document.getElementById('msg-counter');
  if (counterEl) {
    if (features.maxMessagesPerDay === Infinity) {
      counterEl.classList.add('hidden');
    } else {
      counterEl.classList.remove('hidden');
    }
  }
}

export { TIER_FEATURES, applyTierGating };
