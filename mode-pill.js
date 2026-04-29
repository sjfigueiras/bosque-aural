// — mode-pill.js —
// Píldora de modo + popover de selección. Sólo renderiza; toda la lógica
// de modos sigue viviendo en movement-engine.

const SHORT_LABELS = {
  randomWalk: 'random',
  keyboardMouse: 'teclado',
  gyroscope: 'gyro'
};

export function createModePill({
  pillEl,
  popoverEl,
  availableMetas,
  initialModeId,
  onSelect,
  documentRef = document
}) {
  if (!pillEl || !popoverEl) {
    throw new Error('createModePill: pillEl and popoverEl are required');
  }

  let activeModeId = initialModeId;
  let activeStatus = 'walking';

  function renderPill() {
    const meta = availableMetas.find(m => m.id === activeModeId);
    const longLabel = meta?.label ?? activeModeId;
    const shortLabel = SHORT_LABELS[activeModeId] ?? longLabel;
    pillEl.dataset.modeId = activeModeId;
    pillEl.dataset.status = activeStatus;
    pillEl.innerHTML = `
      <span class="mode-pill-dot" aria-hidden="true"></span>
      <span class="mode-pill-label-long">${longLabel}</span>
      <span class="mode-pill-label-short">${shortLabel}</span>
    `;
  }

  function renderPopover() {
    popoverEl.innerHTML = '';
    for (const meta of availableMetas) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'popover-item';
      item.dataset.modeId = meta.id;
      if (meta.id === activeModeId) item.classList.add('active');
      item.textContent = meta.label + (meta.experimental ? ' · beta' : '');
      item.addEventListener('click', () => {
        closePopover();
        if (meta.id !== activeModeId) onSelect?.(meta.id);
      });
      popoverEl.appendChild(item);
    }
  }

  function openPopover() {
    popoverEl.hidden = false;
    pillEl.setAttribute('aria-expanded', 'true');
    documentRef.addEventListener('click', handleOutsideClick, true);
  }

  function closePopover() {
    popoverEl.hidden = true;
    pillEl.setAttribute('aria-expanded', 'false');
    documentRef.removeEventListener('click', handleOutsideClick, true);
  }

  function handleOutsideClick(event) {
    if (popoverEl.contains(event.target) || pillEl.contains(event.target)) return;
    closePopover();
  }

  pillEl.addEventListener('click', () => {
    if (popoverEl.hidden) openPopover();
    else closePopover();
  });

  renderPill();
  renderPopover();

  return {
    setActiveMode(modeId) {
      if (modeId === activeModeId) return;
      activeModeId = modeId;
      renderPill();
      renderPopover();
    },
    setStatus(status) {
      if (status === activeStatus) return;
      activeStatus = status;
      pillEl.dataset.status = status;
    },
    close: closePopover
  };
}
