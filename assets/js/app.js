(() => {
  const tabs = document.querySelectorAll('.capture-tab');
  const scanner = document.querySelector('#scanner');
  const label = document.querySelector('#scanner-label');
  const captureButton = document.querySelector('#capture-button');
  const deviceState = document.querySelector('#device-state');
  const toastElement = document.querySelector('#app-toast');
  const toast = new bootstrap.Toast(toastElement, { delay: 3500 });

  function showToast(message) {
    document.querySelector('#toast-message').textContent = message;
    toast.show();
  }

  function reveal(id) {
    const section = document.querySelector(id);
    section.classList.remove('hidden');
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

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
})();
