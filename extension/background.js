// Background service worker for Chrome extension
// Debug mode: All operations are logged with [DEBUG], [ERROR], [SUCCESS] prefixes

let isScraping = false;
const POLL_FAST = 2000;      // 2s when dashboard is likely active
const POLL_SLOW = 15000;     // 15s when idle for a while
const BACKOFF_AFTER = 60000; // switch to slow after 1 min of no triggers
let lastTriggerTime = Date.now();

console.log('[DEBUG] Background script loaded');

// Helper functions to extract fandom and character (fallback if content script doesn't set them)
function extractFandom(text) {
  if (!text) return null;
  
  const lowerText = text.toLowerCase();
  
  // Check for "love and deep space" or "lads" first (most common)
  if (lowerText.includes('love') && lowerText.includes('deep') && lowerText.includes('space')) {
    return 'lads';
  }
  if (lowerText.includes('lads')) {
    return 'lads';
  }
  
  // Check for chainsaw man
  if (lowerText.includes('chainsaw') || lowerText.includes('csm')) {
    return 'chainsawman';
  }
  
  return null;
}

function extractCharacterName(text, fandom) {
  if (!text) return null;
  
  const lowerText = text.toLowerCase();
  
  // Character lists by fandom
  const characterLists = {
    'lads': {
      characters: [
        // Main characters
        'xavier', 'zayne', 'rafayel', 'caleb', 'sylus',
        // Supporting characters
        'aislinn', 'andrew', 'benedict', 'carter', 'dimitri', 'noah', 'gideon', 'greyson',
        'jenna', 'jeremiah', 'josephine', 'kevi', 'leon', 'luke', 'kieran', 'lumiere',
        'mephisto', 'nero', 'otto', 'philip', 'player', 'lucius', 'raymond', 'riley',
        'simone', 'soren', 'talia', 'tara', 'thomas', 'ulysses', 'viper', 'yvonne'
      ],
      aliases: {
        'xavier': ['xavier', 'xav'],
        'zayne': ['zayne', 'zane'],
        'rafayel': ['rafayel', 'rafael', 'raf'],
        'caleb': ['caleb'],
        'sylus': ['sylus', 'sylas'],
        'aislinn': ['aislinn'],
        'andrew': ['andrew'],
        'benedict': ['benedict'],
        'carter': ['carter'],
        'dimitri': ['dimitri'],
        'noah': ['noah', 'dr noah', 'dr. noah', 'professor noah'],
        'gideon': ['gideon'],
        'greyson': ['greyson'],
        'jenna': ['jenna'],
        'jeremiah': ['jeremiah'],
        'josephine': ['josephine'],
        'kevi': ['kevi'],
        'leon': ['leon'],
        'luke': ['luke'],
        'kieran': ['kieran'],
        'lumiere': ['lumiere'],
        'mephisto': ['mephisto'],
        'nero': ['nero'],
        'otto': ['otto', 'OTTO'],
        'philip': ['philip'],
        'player': ['player', 'mc', 'main character'],
        'lucius': ['lucius', 'professor lucius', 'prof. lucius'],
        'raymond': ['raymond'],
        'riley': ['riley'],
        'simone': ['simone'],
        'soren': ['soren'],
        'talia': ['talia'],
        'tara': ['tara'],
        'thomas': ['thomas'],
        'ulysses': ['ulysses'],
        'viper': ['viper'],
        'yvonne': ['yvonne']
      }
    },
    'chainsawman': {
      characters: ['pochita', 'denji', 'power', 'aki', 'makima', 'reze', 'kobeni', 'fakesaw man'],
      aliases: {
        'pochita': ['pochita', 'pochi'],
        'denji': ['denji'],
        'power': ['power'],
        'aki': ['aki'],
        'makima': ['makima'],
        'reze': ['reze'],
        'kobeni': ['kobeni'],
        'fakesaw man': ['fakesaw', 'fakesaw man', 'fake saw']
      }
    },
    'jjk': {
      characters: [
        'gojo satoru', 'sukuna', 'megumi fushiguro', 'yuji itadori', 'nobara kugisaki',
        'nanami', 'todo', 'yuta okkotsu', 'toji fushiguro', 'geto suguru', 'panda', 'toge inumaki',
        'maki zenin', 'kasumi miwa', 'yuki tsukumo', 'kenjaku', 'mahito', 'jogo', 'hanami', 'dagon'
      ],
      aliases: {
        'gojo satoru': ['gojo', 'satoru gojo', 'satoru', 'gojo satoru'],
        'sukuna': ['sukuna', 'ryomen sukuna'],
        'megumi fushiguro': ['megumi', 'fushiguro', 'megumi fushiguro'],
        'yuji itadori': ['yuji', 'itadori', 'yuji itadori'],
        'nobara kugisaki': ['nobara', 'kugisaki', 'nobara kugisaki'],
        'nanami': ['nanami', 'kento nanami'],
        'todo': ['todo', 'aoi todo'],
        'yuta okkotsu': ['yuta', 'okkotsu', 'yuta okkotsu'],
        'toji fushiguro': ['toji', 'toji fushiguro'],
        'geto suguru': ['geto', 'suguru geto', 'suguru'],
        'panda': ['panda'],
        'toge inumaki': ['toge', 'inumaki', 'toge inumaki'],
        'maki zenin': ['maki', 'zenin', 'maki zenin'],
        'kasumi miwa': ['miwa', 'kasumi miwa', 'kasumi'],
        'yuki tsukumo': ['yuki', 'tsukumo', 'yuki tsukumo'],
        'kenjaku': ['kenjaku'],
        'mahito': ['mahito'],
        'jogo': ['jogo'],
        'hanami': ['hanami'],
        'dagon': ['dagon']
      }
    }
  };
  
  // Determine fandom if not provided
  let detectedFandom = fandom;
  if (!detectedFandom) {
    if ((lowerText.includes('love') && lowerText.includes('deep') && lowerText.includes('space')) || lowerText.includes('lads')) {
      detectedFandom = 'lads';
    } else if (lowerText.includes('chainsaw') || lowerText.includes('csm')) {
      detectedFandom = 'chainsawman';
    } else if (lowerText.includes('jjk') || lowerText.includes('jujutsu')) {
      detectedFandom = 'jjk';
    }
  }
  
  if (!detectedFandom || !characterLists[detectedFandom]) {
    return null;
  }
  
  const charList = characterLists[detectedFandom];
  
  // Check aliases first (more specific) - sort by length descending to match most specific first
  // Collect all (charName, alias) pairs and sort by alias length
  const allAliases = [];
  for (const [charName, aliases] of Object.entries(charList.aliases || {})) {
    for (const alias of aliases) {
      allAliases.push([charName, alias]);
    }
  }
  // Sort by alias length (longest first) to match most specific aliases first
  allAliases.sort((a, b) => b[1].length - a[1].length);
  
  for (const [charName, alias] of allAliases) {
    if (lowerText.includes(alias)) {
      return charName;
    }
  }
  
  // Check direct character names
  for (const charName of charList.characters || []) {
    if (lowerText.includes(charName.toLowerCase())) {
      return charName;
    }
  }
  
  return null;
}

// Get dashboard URL and API key from storage
async function getConfig() {
  const result = await chrome.storage.sync.get(['dashboardUrl', 'apiKey']);
  return {
    dashboardUrl: result.dashboardUrl || 'http://localhost:3000',
    apiKey: result.apiKey || ''
  };
}

// Poll for new scraping triggers (simplified - no job queue)
async function pollForTriggers() {
  if (isScraping) return;

  try {
    const config = await getConfig();
    
    // Check if dashboard URL is configured (allow localhost:3000 for local development)
    if (!config.dashboardUrl) {
      // Only log once per minute to avoid spam
      const lastLog = await chrome.storage.local.get(['lastPollErrorLog']);
      const now = Date.now();
      if (!lastLog.lastPollErrorLog || now - lastLog.lastPollErrorLog > 60000) {
        console.log('[DEBUG] Dashboard URL not configured. Please set it in extension options.');
        await chrome.storage.local.set({ lastPollErrorLog: now });
      }
      return;
    }
    
    // Build headers - API key is optional for local development
    const headers = {};
    if (config.apiKey) {
      headers['x-api-key'] = config.apiKey;
    }

    const url = `${config.dashboardUrl}/api/scraping/trigger`;

    const response = await fetch(url, {
      method: 'GET',
      headers,
      // Add mode and credentials for CORS
      mode: 'cors',
      credentials: 'omit'
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 200) {
        // 404 or 200 with no data is fine - just means no trigger yet
        console.log('[DEBUG] No trigger yet (status:', response.status, ')');
        return;
      }
      console.error('[ERROR] Failed to fetch triggers:', response.status, response.statusText);
      return;
    }

    const data = await response.json();
    console.log('[DEBUG] Poll response:', JSON.stringify(data, null, 2));
    
    if (!data.data) {
      console.log('[DEBUG] No trigger data in response');
      return;
    }
    
    if (!data.data.target_urls || data.data.target_urls.length === 0) {
      console.log('[DEBUG] No target URLs in trigger data');
      return;
    }
    
    console.log('[DEBUG] Trigger found! Starting scraping...', {
      urlCount: data.data.target_urls.length,
      sourceType: data.data.source_type,
      maxPosts: data.data.max_posts,
      templateId: data.data.template_id || null
    });
    lastTriggerTime = Date.now();
    isScraping = true;
    
    // Show notification
    try {
      const notifMsg = data.data.template_id
        ? `Template scrape: ${data.data.template_id} (${data.data.max_posts} images)`
        : `Starting scraping! Opening ${data.data.target_urls.length} tab(s)...`;
      chrome.notifications.create({
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icon48.png'),
        title: 'GeeLark Scraper',
        message: notifMsg
      }).catch((err) => {
        console.log('Notification failed (non-critical):', err);
      });
    } catch (e) {
      console.log('Notifications not available:', e);
    }
    
    // Start scraping immediately
    startScrapingDirectly(data.data);
  } catch (error) {
    // Only log network errors occasionally to avoid spam
    if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
      const lastErrorLog = await chrome.storage.local.get(['lastNetworkErrorLog']);
      const now = Date.now();
      if (!lastErrorLog.lastNetworkErrorLog || now - lastErrorLog.lastNetworkErrorLog > 60000) {
        console.error('Network error polling for triggers. Make sure:', {
          error: error.message,
          dashboardUrl: (await getConfig()).dashboardUrl,
          hint: '1) Dashboard is running, 2) URL is correct, 3) CORS is enabled'
        });
        await chrome.storage.local.set({ lastNetworkErrorLog: now });
      }
    } else {
      console.error('Error polling for triggers:', error);
    }
  }
}

// Wait for tab to load completely
async function waitForTabLoad(tabId, timeout = 10000) {
  console.log(`[DEBUG] Waiting for tab ${tabId} to load (timeout: ${timeout}ms)`);
  return new Promise((resolve) => {
    let resolved = false;
    
    // Check if tab exists periodically
    const checkTabExists = async () => {
      if (resolved) return;
      const exists = await tabExists(tabId);
      if (!exists) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(checkComplete);
        chrome.tabs.onRemoved.removeListener(tabRemoved);
        clearTimeout(timeoutId);
        console.warn(`[WARN] Tab ${tabId} was closed while waiting for load`);
        resolve();
      }
    };
    
    const tabRemoved = (removedTabId) => {
      if (removedTabId === tabId && !resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(checkComplete);
        chrome.tabs.onRemoved.removeListener(tabRemoved);
        clearTimeout(timeoutId);
        clearInterval(existenceCheck);
        console.warn(`[WARN] Tab ${tabId} was removed while waiting for load`);
        resolve();
      }
    };
    
    const checkComplete = async (id, changeInfo) => {
      if (id === tabId && changeInfo.status === 'complete' && !resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(checkComplete);
        chrome.tabs.onRemoved.removeListener(tabRemoved);
        clearTimeout(timeoutId);
        clearInterval(existenceCheck);
        console.log(`[DEBUG] Tab ${tabId} loaded, waiting 2s for dynamic content...`);
        // Additional wait for dynamic content
        setTimeout(() => {
          console.log(`[DEBUG] Tab ${tabId} ready`);
          resolve();
        }, 2000);
      }
    };
    
    chrome.tabs.onUpdated.addListener(checkComplete);
    chrome.tabs.onRemoved.addListener(tabRemoved);
    
    // Check tab existence every 500ms
    const existenceCheck = setInterval(checkTabExists, 500);
    
    // Fallback timeout
    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        chrome.tabs.onUpdated.removeListener(checkComplete);
        chrome.tabs.onRemoved.removeListener(tabRemoved);
        clearInterval(existenceCheck);
        console.log(`[DEBUG] Tab ${tabId} load timeout reached`);
        resolve();
      }
    }, timeout);
  });
}

// Check if tab exists
async function tabExists(tabId) {
  try {
    await chrome.tabs.get(tabId);
    return true;
  } catch (error) {
    return false;
  }
}

// Ensure content script is injected and ready
async function ensureContentScript(tabId, retries = 3) {
  console.log(`[DEBUG] Ensuring content script in tab ${tabId}`);
  
  // First check if tab still exists
  if (!(await tabExists(tabId))) {
    console.error(`[ERROR] Tab ${tabId} does not exist`);
    return false;
  }
  
  for (let i = 0; i < retries; i++) {
    try {
      // Check tab exists before each attempt
      if (!(await tabExists(tabId))) {
        console.error(`[ERROR] Tab ${tabId} was closed during content script injection`);
        return false;
      }
      
      // Try to send a ping message
      const response = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
      if (response && response.pong) {
        console.log(`[DEBUG] Content script ready in tab ${tabId}`);
        return true;
      }
    } catch (error) {
      console.log(`[DEBUG] Content script not ready (attempt ${i + 1}/${retries}):`, error.message);
      if (i < retries - 1) {
        // Check tab exists before injecting
        if (!(await tabExists(tabId))) {
          console.error(`[ERROR] Tab ${tabId} was closed before injection`);
          return false;
        }
        
        // Try injecting content script manually
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
          });
          console.log(`[DEBUG] Injected content script into tab ${tabId}`);
          await new Promise(resolve => setTimeout(resolve, 1500)); // Longer wait
        } catch (injectError) {
          console.error(`[DEBUG] Failed to inject content script:`, injectError);
          // If tab doesn't exist, stop retrying
          if (injectError.message.includes('No tab with id')) {
            console.error(`[ERROR] Tab ${tabId} was closed`);
            return false;
          }
        }
      }
    }
  }
  return false;
}

// Start scraping directly (no job queue)
async function startScrapingDirectly(triggerData) {
  try {
    console.log('Starting scraping directly. Source type:', triggerData.source_type);
    
    const config = await getConfig();
    let progress = 0;
    const totalUrls = triggerData.target_urls?.length || 0;
    const sourceType = triggerData.source_type || 'pinterest';
    const maxPosts = triggerData.max_posts || 50; // Default to 50 if not provided
    const templateId = triggerData.template_id || null; // Template ID for template-based scraping
    
    if (templateId) {
      console.log(`[DEBUG] Template-based scraping for template: ${templateId}`);
    }

    if (sourceType === 'pinterest') {
    // Pinterest: Get pin links first, then open each pin individually
    for (const url of triggerData.target_urls || []) {
      try {
        // Extract search query from URL for better categorization
        let searchQuery = '';
        try {
          const urlObj = new URL(url);
          const qParam = urlObj.searchParams.get('q');
          if (qParam) {
            searchQuery = decodeURIComponent(qParam);
            console.log(`[DEBUG] Extracted search query from URL: "${searchQuery}"`);
          }
        } catch (urlError) {
          console.log(`[DEBUG] Could not parse URL for search query:`, urlError);
        }
        
        // Open Pinterest page
        const mainTab = await chrome.tabs.create({ 
          url, 
          active: true
        });
        
        // Add tab close listener
        const mainTabCloseListener = (closedTabId) => {
          if (closedTabId === mainTab.id) {
            console.warn(`[WARN] Main tab ${mainTab.id} was closed externally`);
            chrome.tabs.onRemoved.removeListener(mainTabCloseListener);
          }
        };
        chrome.tabs.onRemoved.addListener(mainTabCloseListener);
        
        // Wait for page to load with longer timeout
        await waitForTabLoad(mainTab.id, 12000);
        
        // Remove listener
        chrome.tabs.onRemoved.removeListener(mainTabCloseListener);
        
        // Check tab still exists
        if (!(await tabExists(mainTab.id))) {
          console.error(`[ERROR] Main tab ${mainTab.id} was closed during load`);
          continue;
        }
        
        // Ensure content script is ready
        const scriptReady = await ensureContentScript(mainTab.id);
        if (!scriptReady) {
          console.error(`[ERROR] Content script not ready in tab ${mainTab.id}`);
          if (await tabExists(mainTab.id)) {
            await chrome.tabs.remove(mainTab.id).catch(() => {});
          }
          continue;
        }
        
        // Get all pin links from the page
        let pinLinks = [];
        try {
          // Check tab exists before sending message
          if (!(await tabExists(mainTab.id))) {
            console.error(`[ERROR] Main tab ${mainTab.id} was closed before getting links`);
            continue;
          }
          
          console.log(`[DEBUG] Requesting pin links from tab ${mainTab.id} (max posts: ${maxPosts})`);
          const linkResults = await chrome.tabs.sendMessage(mainTab.id, {
            action: 'scrapePinLinks',
            maxPosts: maxPosts
          });
          
          console.log(`[DEBUG] Received response:`, linkResults);
          if (linkResults && linkResults.links) {
            pinLinks = linkResults.links;
            console.log(`[SUCCESS] Found ${pinLinks.length} pin links on page`);
          } else {
            console.warn(`[WARN] No links in response:`, linkResults);
          }
        } catch (error) {
          if (error.message.includes('No tab with id')) {
            console.error(`[ERROR] Main tab ${mainTab.id} was closed:`, error);
            continue;
          }
          console.error(`[ERROR] Error getting pin links from tab ${mainTab.id}:`, error);
          // Fallback: try regular scrape
          if (await tabExists(mainTab.id)) {
            try {
              const fallbackResults = await chrome.tabs.sendMessage(mainTab.id, {
                action: 'scrape',
                sourceType: 'pinterest'
              });
              if (fallbackResults && fallbackResults.links) {
                pinLinks = fallbackResults.links;
                console.log(`[FALLBACK] Found ${pinLinks.length} links via fallback`);
              }
            } catch (fallbackError) {
              console.error(`[ERROR] Fallback also failed:`, fallbackError);
            }
          }
        }
        
        // Close main tab if it still exists
        if (await tabExists(mainTab.id)) {
          await chrome.tabs.remove(mainTab.id).catch(err => {
            console.log(`[DEBUG] Main tab ${mainTab.id} already closed:`, err);
          });
        }
        
        // Limit pin links to maxPosts
        const limitedPinLinks = pinLinks.slice(0, maxPosts);
        console.log(`[DEBUG] Limiting to ${limitedPinLinks.length} pins (from ${pinLinks.length} found, max: ${maxPosts})`);
        
        // Now open each pin link individually
        for (let i = 0; i < limitedPinLinks.length; i++) {
          const pinUrl = limitedPinLinks[i];
          let pinTab = null;
          let keepAliveInterval = null;
          let tabCloseListener = null;
          let tabClosed = false;
          
          try {
            // Open pin in new tab - keep it active to prevent Chrome from closing it
            console.log(`[DEBUG] Opening pin ${i + 1}/${limitedPinLinks.length}: ${pinUrl}`);
            pinTab = await chrome.tabs.create({ 
              url: pinUrl,
              active: true  // Keep active to prevent Chrome from closing inactive tabs
            });
            
            console.log(`[DEBUG] Created pin tab ${pinTab.id}`);
            
            // Add tab close listener to detect premature closures
            tabCloseListener = (closedTabId) => {
              if (closedTabId === pinTab.id) {
                tabClosed = true;
                console.warn(`[WARN] Pin tab ${pinTab.id} was closed externally`);
                if (tabCloseListener) {
                  chrome.tabs.onRemoved.removeListener(tabCloseListener);
                }
                if (keepAliveInterval) {
                  clearInterval(keepAliveInterval);
                }
              }
            };
            chrome.tabs.onRemoved.addListener(tabCloseListener);
            
            // Longer delay to ensure tab is stable and not closed by Chrome
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            // Check tab still exists
            if (!(await tabExists(pinTab.id)) || tabClosed) {
              console.error(`[ERROR] Pin tab ${pinTab.id} was closed immediately after creation`);
              chrome.tabs.onRemoved.removeListener(tabCloseListener);
              continue;
            }
            
            // Keep tab active and alive by updating it periodically during load AND scraping
            keepAliveInterval = setInterval(async () => {
              if (tabClosed || !(await tabExists(pinTab.id))) {
                clearInterval(keepAliveInterval);
                chrome.tabs.onRemoved.removeListener(tabCloseListener);
                return;
              }
              // Update tab to keep it alive and active - this prevents Chrome from closing it
              try {
                await chrome.tabs.update(pinTab.id, { active: true });
              } catch (e) {
                // Tab might be closing, ignore
                tabClosed = true;
                clearInterval(keepAliveInterval);
                chrome.tabs.onRemoved.removeListener(tabCloseListener);
              }
            }, 1000); // Check more frequently to keep tab alive
            
            // Wait for pin page to load
            await waitForTabLoad(pinTab.id, 15000); // Increased timeout
            
            // DON'T clear keep-alive yet - keep it running during scraping too
            
            // Check tab still exists after load
            if (!(await tabExists(pinTab.id)) || tabClosed) {
              console.error(`[ERROR] Pin tab ${pinTab.id} was closed during load`);
              continue;
            }
            
            // Ensure content script is ready
            const pinScriptReady = await ensureContentScript(pinTab.id);
            if (!pinScriptReady) {
              console.error(`[ERROR] Content script not ready in pin tab ${pinTab.id}`);
              if (await tabExists(pinTab.id)) {
                await chrome.tabs.remove(pinTab.id).catch(() => {});
              }
              continue;
            }
            
            // Check tab exists before scraping
            if (!(await tabExists(pinTab.id))) {
              console.error(`[ERROR] Pin tab ${pinTab.id} was closed before scraping`);
              continue;
            }
            
            // Retry mechanism for content script communication with timeout
            let imageResults = null;
            let retries = 3;
            const SCRAPE_TIMEOUT_MS = 30000; // 30 seconds timeout for scraping
            
            while (retries > 0 && !imageResults) {
              try {
                // Check tab exists before each attempt
                if (!(await tabExists(pinTab.id))) {
                  console.error(`[ERROR] Pin tab ${pinTab.id} was closed during scraping`);
                  break;
                }
                
                console.log(`[DEBUG] Requesting pin image from tab ${pinTab.id} (attempt ${4 - retries}/3)`);
                
                // Wrap sendMessage in a timeout
                const scrapePromise = chrome.tabs.sendMessage(pinTab.id, {
                  action: 'scrapePinImage',
                  searchQuery: searchQuery  // Pass search query to content script
                });
                
                const timeoutPromise = new Promise((_, reject) => 
                  setTimeout(() => reject(new Error('Scrape timeout')), SCRAPE_TIMEOUT_MS)
                );
                
                imageResults = await Promise.race([scrapePromise, timeoutPromise]);
                console.log(`[DEBUG] Received image results:`, imageResults);
              } catch (error) {
                retries--;
                if (error.message.includes('No tab with id')) {
                  console.error(`[ERROR] Tab ${pinTab.id} was closed:`, error);
                  break;
                }
                if (error.message.includes('Scrape timeout') || error.message.includes('timeout')) {
                  console.warn(`[TIMEOUT] Scraping timed out after ${SCRAPE_TIMEOUT_MS}ms, skipping this pin:`, pinUrl);
                  break; // Skip this pin and continue
                }
                if (retries > 0) {
                  console.log(`[RETRY] Retrying pin image scrape (${3 - retries}/3)... Error:`, error.message);
                  await new Promise(resolve => setTimeout(resolve, 1000));
                } else {
                  console.error(`[ERROR] Failed to scrape pin image after retries:`, pinUrl, error);
                }
              }
            }
            
            // Skip if no images found (could be video post or timeout)
            if (!imageResults || !imageResults.images || imageResults.images.length === 0) {
              console.warn(`[SKIP] No images found for pin ${i + 1}/${limitedPinLinks.length}, skipping:`, pinUrl);
              // Clean up and continue to next pin
              clearInterval(keepAliveInterval);
              chrome.tabs.onRemoved.removeListener(tabCloseListener);
              if (await tabExists(pinTab.id) && !tabClosed) {
                setTimeout(async () => {
                  if (await tabExists(pinTab.id)) {
                    await chrome.tabs.remove(pinTab.id).catch(() => {});
                  }
                }, 500);
              }
              await new Promise(resolve => setTimeout(resolve, 1000));
              continue;
            }
            
            if (imageResults && imageResults.images && imageResults.images.length > 0) {
              // Upload each image
              for (const image of imageResults.images) {
                image.sourceType = 'pinterest';
                if (templateId) {
                  image.templateId = templateId;
                }
                // Use search query from URL, or fallback to triggerData.search_terms
                if (searchQuery) {
                  image.searchTerms = [searchQuery];
                  image.searchQuery = searchQuery;
                  // Re-extract fandom and character from search query if not already set
                  // This ensures we get the correct values even if the pin description doesn't have them
                  if (!image.fandom || image.fandom === 'unknown') {
                    // Re-extract from search query
                    const extractedFandom = extractFandom(searchQuery);
                    if (extractedFandom) {
                      image.fandom = extractedFandom;
                    }
                  }
                  if (!image.character || image.character === null) {
                    // Re-extract character from search query
                    const extractedCharacter = extractCharacterName(searchQuery, image.fandom);
                    if (extractedCharacter) {
                      image.character = extractedCharacter;
                    }
                  }
                } else if (triggerData.search_terms && triggerData.search_terms.length > 0) {
                  image.searchTerms = triggerData.search_terms;
                }
                console.log(`[DEBUG] Image metadata before upload:`, { 
                  fandom: image.fandom, 
                  character: image.character, 
                  searchQuery: image.searchQuery,
                  templateId: image.templateId || null
                });
                await uploadAsset(image, config);
                progress++;
              }
              console.log(`[SUCCESS] Scraped pin ${i + 1}/${limitedPinLinks.length}: ${imageResults.images.length} image(s)`);
            } else {
              console.warn(`[WARN] No images found in pin ${i + 1}/${limitedPinLinks.length}`);
            }
            
            // NOW clear keep-alive interval and close listener after scraping is complete
            clearInterval(keepAliveInterval);
            chrome.tabs.onRemoved.removeListener(tabCloseListener);
            
            // Only close pin tab if it still exists and wasn't closed externally
            // Add a small delay before closing to ensure all operations are complete
            if (await tabExists(pinTab.id) && !tabClosed) {
              setTimeout(async () => {
                if (await tabExists(pinTab.id)) {
                  await chrome.tabs.remove(pinTab.id).catch(err => {
                    console.log(`[DEBUG] Tab ${pinTab.id} already closed or error removing:`, err);
                  });
                }
              }, 1000); // Wait 1 second before closing
            }
            
            // Small delay between pins to avoid overwhelming Pinterest
            await new Promise(resolve => setTimeout(resolve, 1500));
          } catch (error) {
            console.error(`[ERROR] Error scraping pin:`, pinUrl, error);
            // Clean up keep-alive interval if it exists
            if (keepAliveInterval) {
              clearInterval(keepAliveInterval);
            }
            if (tabCloseListener) {
              chrome.tabs.onRemoved.removeListener(tabCloseListener);
            }
            // Try to close tab if it exists
            if (pinTab && await tabExists(pinTab.id)) {
              await chrome.tabs.remove(pinTab.id).catch(() => {});
            }
          }
        }
      } catch (error) {
        console.error('Error scraping Pinterest page:', url, error);
      }
    }
  } else {
    // Google Images: Use scroll flow similar to Pinterest
    for (const url of triggerData.target_urls || []) {
      let keepAliveInterval = null; // Declare outside try block for cleanup in catch
      try {
        // Extract search query from URL for better categorization
        let searchQuery = '';
        try {
          const urlObj = new URL(url);
          const qParam = urlObj.searchParams.get('q');
          if (qParam) {
            searchQuery = decodeURIComponent(qParam);
            console.log(`[DEBUG] Extracted search query from URL: "${searchQuery}"`);
          }
        } catch (urlError) {
          console.log(`[DEBUG] Could not parse URL for search query:`, urlError);
        }
        
        // Open Google Images page
        const mainTab = await chrome.tabs.create({ 
          url, 
          active: true
        });
        
        // Add tab close listener
        const mainTabCloseListener = (closedTabId) => {
          if (closedTabId === mainTab.id) {
            console.warn(`[WARN] Main tab ${mainTab.id} was closed externally`);
            chrome.tabs.onRemoved.removeListener(mainTabCloseListener);
          }
        };
        chrome.tabs.onRemoved.addListener(mainTabCloseListener);
        
        // Wait for page to load
        await waitForTabLoad(mainTab.id, 12000);
        
        // Remove listener
        chrome.tabs.onRemoved.removeListener(mainTabCloseListener);
        
        // Check tab still exists
        if (!(await tabExists(mainTab.id))) {
          console.error(`[ERROR] Main tab ${mainTab.id} was closed during load`);
          continue;
        }
        
        // Wait 3 seconds for images to load before starting to scrape
        console.log(`[DEBUG] [GOOGLE IMAGES] Waiting 3 seconds for images to load...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
        console.log(`[DEBUG] [GOOGLE IMAGES] Wait complete, starting scraping...`);
        
        // Ensure content script is ready
        const scriptReady = await ensureContentScript(mainTab.id);
        if (!scriptReady) {
          console.error(`[ERROR] Content script not ready in tab ${mainTab.id}`);
          if (await tabExists(mainTab.id)) {
            await chrome.tabs.remove(mainTab.id).catch(() => {});
          }
          continue;
        }
        
        // Get all images with scroll
        let imageResults = null;
        try {
          // Check tab exists before sending message
          if (!(await tabExists(mainTab.id))) {
            console.error(`[ERROR] Main tab ${mainTab.id} was closed before getting images`);
            continue;
          }
          
          console.log(`[DEBUG] [GOOGLE IMAGES] Requesting Google Images with scroll from tab ${mainTab.id}`);
          console.log(`[DEBUG] [GOOGLE IMAGES] URL: ${url}`);
          console.log(`[DEBUG] [GOOGLE IMAGES] Search query: "${searchQuery}"`);
          console.log(`[DEBUG] [GOOGLE IMAGES] Max posts: ${maxPosts}`);
          
          imageResults = await chrome.tabs.sendMessage(mainTab.id, {
            action: 'scrapeGoogleImagesWithScroll',
            maxPosts: maxPosts
          });
          
          console.log(`[DEBUG] [GOOGLE IMAGES] Received response from content script`);
          console.log(`[DEBUG] [GOOGLE IMAGES] Response has images: ${!!(imageResults && imageResults.images)}`);
          if (imageResults && imageResults.images) {
            console.log(`[SUCCESS] [GOOGLE IMAGES] Found ${imageResults.images.length} images on page`);
            if (imageResults.error) {
              console.warn(`[WARN] [GOOGLE IMAGES] Content script reported error: ${imageResults.error}`);
            }
          } else {
            console.warn(`[WARN] [GOOGLE IMAGES] No images in response:`, imageResults);
          }
        } catch (error) {
          if (error.message.includes('No tab with id')) {
            console.error(`[ERROR] [GOOGLE IMAGES] Main tab ${mainTab.id} was closed:`, error);
            continue;
          }
          console.error(`[ERROR] [GOOGLE IMAGES] Error getting images from tab ${mainTab.id}:`, error);
          console.error(`[ERROR] [GOOGLE IMAGES] Error details:`, error.message, error.stack);
        }
        
        // Don't close the tab - keep it open for user inspection
        // Keep tab active to prevent Chrome from closing it
        console.log(`[DEBUG] [GOOGLE IMAGES] Keeping tab ${mainTab.id} open for inspection`);
        
        // Keep tab active during upload to prevent Chrome from closing it
        keepAliveInterval = setInterval(async () => {
          if (!(await tabExists(mainTab.id))) {
            clearInterval(keepAliveInterval);
            return;
          }
          try {
            await chrome.tabs.update(mainTab.id, { active: false }); // Don't make it active, just update it
          } catch (e) {
            // Tab might be closing, ignore
            clearInterval(keepAliveInterval);
          }
        }, 2000); // Update every 2 seconds
        
        // Upload images
        if (imageResults && imageResults.images && imageResults.images.length > 0) {
          console.log(`[DEBUG] [GOOGLE IMAGES] Starting upload of ${imageResults.images.length} images`);
          let uploadCount = 0;
          for (const image of imageResults.images) {
            image.sourceType = sourceType;
            if (templateId) {
              image.templateId = templateId;
            }
            // Use search query from URL, or fallback to triggerData.search_terms
            if (searchQuery) {
              image.searchTerms = [searchQuery];
              image.searchQuery = searchQuery;
              // Re-extract fandom and character from search query if not already set
              if (!image.fandom || image.fandom === 'unknown') {
                const extractedFandom = extractFandom(searchQuery);
                if (extractedFandom) {
                  image.fandom = extractedFandom;
                }
              }
              if (!image.character || image.character === null) {
                const extractedCharacter = extractCharacterName(searchQuery, image.fandom);
                if (extractedCharacter) {
                  image.character = extractedCharacter;
                }
              }
            } else if (triggerData.search_terms && triggerData.search_terms.length > 0) {
              image.searchTerms = triggerData.search_terms;
            }
            console.log(`[DEBUG] [GOOGLE IMAGES] Image ${uploadCount + 1}/${imageResults.images.length} metadata before upload:`, { 
              url: image.url?.substring(0, 100) + '...',
              fandom: image.fandom, 
              character: image.character, 
              searchQuery: image.searchQuery,
              templateId: image.templateId || null,
              description: image.description?.substring(0, 50) + '...'
            });
            await uploadAsset(image, config);
            uploadCount++;
            progress++;
            console.log(`[DEBUG] [GOOGLE IMAGES] Uploaded ${uploadCount}/${imageResults.images.length} images`);
          }
          console.log(`[SUCCESS] [GOOGLE IMAGES] Scraped and uploaded ${uploadCount} image(s) from ${imageResults.images.length} found`);
        } else {
          console.warn(`[WARN] [GOOGLE IMAGES] No images found for Google Images search`);
          console.warn(`[WARN] [GOOGLE IMAGES] Search query: "${searchQuery}"`);
          console.warn(`[WARN] [GOOGLE IMAGES] URL: ${url}`);
        }
        
        // Clear keep-alive interval after scraping is complete
        // But keep the tab open - don't close it
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
          console.log(`[DEBUG] [GOOGLE IMAGES] Cleared keep-alive interval, tab ${mainTab.id} will remain open`);
        }
        
        // Ensure tab is still open and visible
        if (await tabExists(mainTab.id)) {
          try {
            await chrome.tabs.update(mainTab.id, { active: false }); // Keep it in background but don't close
            console.log(`[DEBUG] [GOOGLE IMAGES] Tab ${mainTab.id} kept open for inspection`);
          } catch (e) {
            console.log(`[DEBUG] [GOOGLE IMAGES] Could not update tab (may have been closed):`, e);
          }
        }
      } catch (error) {
        console.error('Error scraping Google Images page:', url, error);
        // Clear keep-alive on error too
        if (keepAliveInterval) {
          clearInterval(keepAliveInterval);
        }
      }
    }
  }

    // Show completion notification
    try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icon48.png'),
      title: 'GeeLark Scraper',
      message: `Scraping completed! Processed ${progress} image(s).`
    }).catch((err) => {
      console.log('Notification failed (non-critical):', err);
    });
    } catch (e) {
      console.log('Notifications not available:', e);
    }
  } catch (err) {
    console.error('[ERROR] Scraping failed:', err);
  } finally {
    isScraping = false;
    // Immediately poll for next task (e.g. next template in queue) instead of waiting for interval
    pollForTriggers();
  }
}

// Supported image MIME types for scraping (formats the dashboard can display/process)
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const MIN_IMAGE_SIZE_BYTES = 500; // Skip tiny blobs (placeholders, error pages)

// Validate that a blob is a supported, decodable image; returns false if we should skip
async function isSupportedImage(blob) {
  if (!blob || blob.size < MIN_IMAGE_SIZE_BYTES) {
    console.log(`[SKIP] Unsupported image: too small or empty (${blob?.size ?? 0} bytes)`);
    return false;
  }
  const type = (blob.type || '').toLowerCase().split(';')[0].trim();
  if (type && !SUPPORTED_IMAGE_TYPES.includes(type)) {
    console.log(`[SKIP] Unsupported image type: "${blob.type}" (supported: ${SUPPORTED_IMAGE_TYPES.join(', ')})`);
    return false;
  }
  try {
    const bitmap = await createImageBitmap(blob);
    if (bitmap) bitmap.close();
    return true;
  } catch (e) {
    console.log(`[SKIP] Image could not be decoded (corrupt or unsupported format):`, e?.message || e);
    return false;
  }
}

// Upload asset to dashboard with timeout fallback
async function uploadAsset(imageData, config) {
  const UPLOAD_TIMEOUT_MS = 60000; // 60 seconds timeout per image
  const imageUrl = imageData.url;
  
  console.log(`[DEBUG] Starting upload for image:`, imageUrl);
  
  // Create abort controllers for fetch requests
  const downloadAbortController = new AbortController();
  const uploadAbortController = new AbortController();
  
  // Set up timeout to abort requests
  const timeoutId = setTimeout(() => {
    downloadAbortController.abort();
    uploadAbortController.abort();
  }, UPLOAD_TIMEOUT_MS);
  
  try {
    // Download image with timeout
    console.log(`[DEBUG] Fetching image from:`, imageUrl);
    const response = await fetch(imageUrl, {
      signal: downloadAbortController.signal
    });
    
    if (!response.ok) {
      console.error(`[ERROR] Failed to fetch image: ${imageUrl} - Status: ${response.status}`);
      clearTimeout(timeoutId);
      return;
    }
    
    const blob = await response.blob();
    console.log(`[DEBUG] Image blob size: ${blob.size} bytes, type: ${blob.type}`);

    // Skip unsupported or invalid images (wrong type, too small, or won't decode)
    const supported = await isSupportedImage(blob);
    if (!supported) {
      clearTimeout(timeoutId);
      return;
    }

    const file = new File([blob], imageData.filename || 'image.jpg', { type: blob.type });

    // Upload to dashboard
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fandom', imageData.fandom || '');
    formData.append('tags', JSON.stringify(imageData.tags || []));
    
    // Extract search query from search terms
    const searchQuery = imageData.searchTerms && imageData.searchTerms.length > 0 
      ? imageData.searchTerms[0] 
      : '';
    
    const metadataObj = {
      source_url: imageData.sourceUrl,
      original_image_url: imageData.url,
      image_url: imageData.url,
      description: imageData.description,
      source_type: imageData.sourceType || 'pinterest',
      search_terms: imageData.searchTerms || [],
      search_query: searchQuery,
      character: imageData.character || null
    };
    if (imageData.templateId) {
      metadataObj.template_id = imageData.templateId;
    }
    formData.append('metadata', JSON.stringify(metadataObj));

    // Build headers - API key is optional for local development
    const headers = {};
    if (config.apiKey) {
      headers['x-api-key'] = config.apiKey;
    }

    const uploadUrl = `${config.dashboardUrl}/api/assets/upload`;
    console.log(`[DEBUG] Uploading to:`, uploadUrl);
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers,
      body: formData,
      signal: uploadAbortController.signal
    });

    // Clear timeout on success
    clearTimeout(timeoutId);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.unsupported || (uploadResponse.status === 400 && errorJson.error)) {
          console.log(`[SKIP] Unsupported image (server rejected):`, errorJson.error);
          return;
        }
        if (errorJson.error && errorJson.error.includes('Bucket not found')) {
          console.error(`[ERROR] Supabase Storage bucket 'assets' not found!`);
          console.error(`[ERROR] Please create a bucket named 'assets' in your Supabase Storage.`);
          console.error(`[ERROR] Go to: Supabase Dashboard > Storage > Create Bucket > Name: 'assets'`);
        }
      } catch (e) {
        // Not JSON, that's okay
      }
      console.error(`[ERROR] Failed to upload asset (${uploadResponse.status}):`, errorText);
      return;
    }
    
    const uploadResult = await uploadResponse.json();
    
    // Handle duplicate response (status 200 with duplicate flag)
    if (uploadResult.duplicate) {
      console.log(`[SKIP] Duplicate asset detected, skipped upload:`, uploadResult.message);
      return;
    }
    
    console.log(`[SUCCESS] Asset uploaded successfully:`, uploadResult);
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError' || error.message && error.message.includes('aborted')) {
      console.warn(`[TIMEOUT] Upload timed out after ${UPLOAD_TIMEOUT_MS}ms, skipping:`, imageUrl);
      console.warn(`[TIMEOUT] Continuing with next image...`);
      return; // Skip this image and continue
    }
    console.error(`[ERROR] Error uploading asset:`, error);
    console.error(`[ERROR] Stack:`, error.stack);
  }
}

// Removed job progress/error functions - no longer needed without job queue

// Listen for messages from popup
// Track which tabs have the debugger attached to avoid double-attach
const debuggerAttachedTabs = new Set();

// Perform a trusted click on a tab using chrome.debugger API
// This produces isTrusted=true events that Google's JS will respond to
async function performTrustedClick(tabId, x, y) {
  const target = { tabId };
  let wasAlreadyAttached = debuggerAttachedTabs.has(tabId);
  
  try {
    // Attach debugger if not already attached
    if (!wasAlreadyAttached) {
      await chrome.debugger.attach(target, '1.3');
      debuggerAttachedTabs.add(tabId);
      console.log(`[DEBUG] [TRUSTED CLICK] Debugger attached to tab ${tabId}`);
    }
    
    // Dispatch mousePressed
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mousePressed',
      x: Math.round(x),
      y: Math.round(y),
      button: 'left',
      clickCount: 1
    });
    
    // Dispatch mouseReleased
    await chrome.debugger.sendCommand(target, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased',
      x: Math.round(x),
      y: Math.round(y),
      button: 'left',
      clickCount: 1
    });
    
    console.log(`[DEBUG] [TRUSTED CLICK] Clicked at (${Math.round(x)}, ${Math.round(y)}) on tab ${tabId}`);
    return { success: true };
  } catch (error) {
    console.error(`[ERROR] [TRUSTED CLICK] Failed:`, error.message);
    debuggerAttachedTabs.delete(tabId);
    throw error;
  }
}

// Detach debugger from a tab (call when done with all clicks on that tab)
async function detachDebugger(tabId) {
  if (debuggerAttachedTabs.has(tabId)) {
    try {
      await chrome.debugger.detach({ tabId });
      debuggerAttachedTabs.delete(tabId);
      console.log(`[DEBUG] [TRUSTED CLICK] Debugger detached from tab ${tabId}`);
    } catch (e) {
      debuggerAttachedTabs.delete(tabId);
    }
  }
}

// Clean up debugger when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  debuggerAttachedTabs.delete(tabId);
});

// Clean up when debugger is detached externally (user dismissed banner, etc.)
chrome.debugger.onDetach.addListener((source) => {
  if (source.tabId) {
    debuggerAttachedTabs.delete(source.tabId);
    console.log(`[DEBUG] [TRUSTED CLICK] Debugger externally detached from tab ${source.tabId}`);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'trustedClick') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: 'No tab ID available' });
      return true;
    }
    
    performTrustedClick(tabId, request.x, request.y)
      .then((result) => sendResponse(result))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (request.action === 'detachDebugger') {
    const tabId = sender.tab?.id;
    if (tabId) {
      detachDebugger(tabId)
        .then(() => sendResponse({ success: true }))
        .catch((error) => sendResponse({ success: false, error: error.message }));
    } else {
      sendResponse({ success: false, error: 'No tab ID' });
    }
    return true;
  }
  
  if (request.action === 'pollNow') {
    lastTriggerTime = Date.now();
    pollForTriggers().then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  
  if (request.action === 'getStatus') {
    sendResponse({
      isScraping
    });
    return true;
  }
});

// Adaptive polling: fast when dashboard is active, slow when idle
async function startPolling() {
  await pollForTriggers();
  const idleTime = Date.now() - lastTriggerTime;
  const nextInterval = idleTime > BACKOFF_AFTER ? POLL_SLOW : POLL_FAST;
  setTimeout(startPolling, nextInterval);
}

chrome.runtime.onInstalled.addListener(() => {
  console.log('GeeLark Scraper extension installed');
});

startPolling();
