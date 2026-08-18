(function () {
    const overlay = document.getElementById('aboutOverlay');
    const open = () => overlay.classList.add('open');
    const close = () => overlay.classList.remove('open');
    document.getElementById('aboutClose').addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  })();

