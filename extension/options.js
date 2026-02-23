// Options page script

document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('configForm');
  const radioLocal = document.getElementById('radioLocal');
  const radioProduction = document.getElementById('radioProduction');
  const modeLocal = document.getElementById('modeLocal');
  const modeProduction = document.getElementById('modeProduction');
  const localUrlGroup = document.getElementById('localUrlGroup');
  const productionUrlGroup = document.getElementById('productionUrlGroup');
  const apiKeyGroup = document.getElementById('apiKeyGroup');
  const localUrlInput = document.getElementById('localUrl');
  const productionUrlInput = document.getElementById('productionUrl');
  const apiKeyInput = document.getElementById('apiKey');
  const successDiv = document.getElementById('success');
  const errorDiv = document.getElementById('error');
  const currentStatusDiv = document.getElementById('currentStatus');
  const statusText = document.getElementById('statusText');

  // Load saved configuration
  const config = await chrome.storage.sync.get([
    'dashboardUrl', 
    'apiKey', 
    'mode', 
    'localUrl', 
    'productionUrl'
  ]);

  // Determine current mode
  let currentMode = config.mode || 'local';
  if (!config.mode && config.dashboardUrl) {
    // Migrate old config: if URL contains localhost, it's local, otherwise production
    currentMode = config.dashboardUrl.includes('localhost') ? 'local' : 'production';
  }

  // Set mode
  if (currentMode === 'production') {
    radioProduction.checked = true;
    modeProduction.classList.add('active');
    modeLocal.classList.remove('active');
    localUrlGroup.style.display = 'none';
    productionUrlGroup.style.display = 'block';
    apiKeyGroup.style.display = 'block';
  } else {
    radioLocal.checked = true;
    modeLocal.classList.add('active');
    modeProduction.classList.remove('active');
    localUrlGroup.style.display = 'block';
    productionUrlGroup.style.display = 'none';
    apiKeyGroup.style.display = 'none';
  }

  // Load URLs
  if (config.localUrl) {
    localUrlInput.value = config.localUrl;
  }
  if (config.productionUrl) {
    productionUrlInput.value = config.productionUrl;
  }
  if (config.apiKey) {
    apiKeyInput.value = config.apiKey;
  }

  // Update current status display
  function updateStatusDisplay() {
    const activeUrl = currentMode === 'local' 
      ? localUrlInput.value || 'http://localhost:3000'
      : productionUrlInput.value || 'Not set';
    statusText.textContent = `${currentMode === 'local' ? 'Local' : 'Production'} mode: ${activeUrl}`;
    currentStatusDiv.style.display = 'block';
  }
  updateStatusDisplay();

  // Mode change handlers
  function handleModeChange() {
    if (radioLocal.checked) {
      currentMode = 'local';
      modeLocal.classList.add('active');
      modeProduction.classList.remove('active');
      localUrlGroup.style.display = 'block';
      productionUrlGroup.style.display = 'none';
      apiKeyGroup.style.display = 'none';
    } else {
      currentMode = 'production';
      modeProduction.classList.add('active');
      modeLocal.classList.remove('active');
      localUrlGroup.style.display = 'none';
      productionUrlGroup.style.display = 'block';
      apiKeyGroup.style.display = 'block';
    }
    updateStatusDisplay();
  }

  radioLocal.addEventListener('change', handleModeChange);
  radioProduction.addEventListener('change', handleModeChange);
  
  // Click handlers for mode options
  modeLocal.addEventListener('click', () => {
    radioLocal.checked = true;
    handleModeChange();
  });
  modeProduction.addEventListener('click', () => {
    radioProduction.checked = true;
    handleModeChange();
  });

  // Update status when URLs change
  localUrlInput.addEventListener('input', updateStatusDisplay);
  productionUrlInput.addEventListener('input', updateStatusDisplay);

  // Save configuration
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const localUrl = localUrlInput.value.trim() || 'http://localhost:3000';
    const productionUrl = productionUrlInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    
    // Determine active URL based on mode
    const activeUrl = currentMode === 'local' ? localUrl : productionUrl;

    if (!activeUrl) {
      errorDiv.textContent = currentMode === 'local' 
        ? 'Please enter a local dashboard URL'
        : 'Please enter a production dashboard URL';
      errorDiv.style.display = 'block';
      successDiv.style.display = 'none';
      return;
    }

    if (currentMode === 'production' && !productionUrl) {
      errorDiv.textContent = 'Please enter a production dashboard URL';
      errorDiv.style.display = 'block';
      successDiv.style.display = 'none';
      return;
    }

    try {
      const configToSave = {
        mode: currentMode,
        dashboardUrl: activeUrl, // Active URL for extension to use
        localUrl: localUrl,
        productionUrl: productionUrl
      };
      
      if (apiKey) {
        configToSave.apiKey = apiKey;
      } else {
        // Clear API key if empty
        await chrome.storage.sync.remove('apiKey');
      }
      
      await chrome.storage.sync.set(configToSave);

      successDiv.style.display = 'block';
      errorDiv.style.display = 'none';
      updateStatusDisplay();
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        successDiv.style.display = 'none';
      }, 3000);
    } catch (error) {
      errorDiv.textContent = 'Error saving configuration: ' + error.message;
      errorDiv.style.display = 'block';
      successDiv.style.display = 'none';
    }
  });
});
