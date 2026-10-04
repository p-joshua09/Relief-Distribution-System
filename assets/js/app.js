(() => {
  const tabs = document.querySelectorAll('.capture-tab');
  const scanner = document.querySelector('#scanner');
  const label = document.querySelector('#scanner-label');
  const captureButton = document.querySelector('#capture-button');
  const deviceState = document.querySelector('#device-state');
  const toastElement = document.querySelector('#app-toast');
  const toast = window.bootstrap?.Toast
    ? new window.bootstrap.Toast(toastElement, { delay: 3500 })
    : {
        show() {
          toastElement.classList.add('show');
          window.setTimeout(() => toastElement.classList.remove('show'), 3500);
        },
      };
  const navigationItems = document.querySelectorAll('.nav-item');

  function showToast(message) {
    document.querySelector('#toast-message').textContent = message;
    toast.show();
  }

  function setActiveNavigation(id) {
    navigationItems.forEach((item) => {
      const isActive = item.getAttribute('href') === id;
      item.classList.toggle('active', isActive);
      if (isActive) {
        item.setAttribute('aria-current', 'page');
      } else {
        item.removeAttribute('aria-current');
      }
    });
  }

  function reveal(id, updateUrl = false) {
    const section = document.querySelector(id);
    if (!section) return;
    section.classList.remove('hidden');
    setActiveNavigation(id);
    if (updateUrl) history.replaceState(null, '', id);
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  navigationItems.forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      reveal(item.getAttribute('href'), true);
    });
  });

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const fingerprint = tab.dataset.capture === 'fingerprint';
      tabs.forEach((item) => {
        item.classList.toggle('active', item === tab);
        item.setAttribute('aria-selected', item === tab ? 'true' : 'false');
      });
      scanner.classList.toggle('fingerprint-mode', fingerprint);
      label.textContent = fingerprint ? 'Place right thumb on the scanner' : 'Position face inside the guide';
      captureButton.textContent = fingerprint ? 'Capture fingerprint' : 'Capture face scan';
      deviceState.innerHTML = `<i></i> ${fingerprint ? 'Scanner ready' : 'Camera ready'}`;
    });
  });

  captureButton.addEventListener('click', () => {
    const original = captureButton.textContent;
    captureButton.disabled = true;
    captureButton.textContent = 'Checking capture…';
    window.setTimeout(() => {
      captureButton.disabled = false;
      captureButton.textContent = original;
      reveal('#match-result');
      showToast('Biometric capture passed quality check');
    }, 700);
  });

  document.querySelector('#manual-button').addEventListener('click', () => {
    reveal('#beneficiary');
    showToast('Open an existing beneficiary record to continue');
  });
  document.querySelector('#create-record-button').addEventListener('click', () => reveal('#beneficiary'));
  document.querySelector('#beneficiary-form').addEventListener('submit', (event) => {
    event.preventDefault();
    reveal('#eligibility');
    showToast('Beneficiary record saved');
  });
  document.querySelector('#release-button').addEventListener('click', () => reveal('#distribution'));
  document.querySelector('#confirm-release').addEventListener('click', () => {
    document.querySelector('#confirm-release').textContent = 'Release recorded';
    document.querySelector('#confirm-release').disabled = true;
    showToast('Relief goods release recorded for this batch');
    reveal('#claim-history');
  });
  document.querySelector('#add-person-button').addEventListener('click', () => showToast('Link a person after completing their identity check'));

  if (window.location.hash && document.querySelector(window.location.hash)) {
    reveal(window.location.hash);
  } else {
    setActiveNavigation('#registration');
  }
})();
