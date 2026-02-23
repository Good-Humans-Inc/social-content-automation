// Popup script

document.addEventListener('DOMContentLoaded', async () => {
  const statusDiv = document.getElementById('status');
  const jobInfoDiv = document.getElementById('jobInfo');
  const openOptionsBtn = document.getElementById('openOptions');
  const openDashboardLink = document.getElementById('openDashboard');

  // Get config
  const config = await chrome.storage.sync.get(['dashboardUrl', 'apiKey']);
  
  if (config.dashboardUrl) {
    openDashboardLink.href = config.dashboardUrl;
  } else {
    openDashboardLink.style.display = 'none';
  }

  // Check if scraping is active
  chrome.runtime.sendMessage({ action: 'getStatus' }, (response) => {
    if (response && response.isScraping) {
      statusDiv.textContent = 'Scraping Active';
      statusDiv.className = 'status active';
      jobInfoDiv.textContent = 'Currently scraping images...';
    } else {
      statusDiv.textContent = 'Ready';
      statusDiv.className = 'status inactive';
      jobInfoDiv.textContent = 'Extension is ready. Click "Start Scraping" in the dashboard to begin.';
    }
  });

  // Open options page
  openOptionsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});
