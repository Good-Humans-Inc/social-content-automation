// Content script for scraping images from pages

// Listen for scrape command from background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[CONTENT] Received message:', request.action);
  
  if (request.action === 'ping') {
    // Ping/pong for connection check
    sendResponse({ pong: true });
    return true;
  }
  
  if (request.action === 'scrape') {
    scrapeImages(request.sourceType).then(result => {
      console.log('[CONTENT] Scrape result:', result);
      sendResponse(result);
    }).catch(error => {
      console.error('[CONTENT] Scrape error:', error);
      sendResponse({ error: error.message });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'scrapePinLinks') {
    // Special action to get pin links from Pinterest page with auto-scroll
    console.log('[CONTENT] Scraping pin links with auto-scroll...');
    const maxPosts = request.maxPosts || 50;
    scrapePinterestWithScroll(maxPosts).then(result => {
      console.log('[CONTENT] Found pin links:', result.links.length);
      sendResponse(result);
    }).catch(error => {
      console.error('[CONTENT] Error scraping with scroll:', error);
      sendResponse({ links: [], error: error.message });
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'scrapePinImage') {
    // Special action to get image from individual pin page
    console.log('[CONTENT] Scraping pin image...');
    const searchQuery = request.searchQuery || '';  // Get search query from request
    const images = scrapePinterestPin(searchQuery);
    console.log('[CONTENT] Found images:', images.length);
    sendResponse({ images });
    return true;
  }
  
  if (request.action === 'scrapeGoogleImagesWithScroll') {
    // Special action to scrape Google Images with auto-scroll
    console.log('[CONTENT] Scraping Google Images with auto-scroll...');
    const maxPosts = request.maxPosts || 200;
    scrapeGoogleImagesWithScroll(maxPosts).then(result => {
      console.log('[CONTENT] Found images:', result.images.length);
      sendResponse(result);
    }).catch(error => {
      console.error('[CONTENT] Error scraping Google Images with scroll:', error);
      sendResponse({ images: [], error: error.message });
    });
    return true; // Keep channel open for async response
  }
  
  return false;
});

// Scrape images from current page
async function scrapeImages(sourceType) {
  const images = [];
  const url = window.location.href;

  // Use sourceType from message if provided, otherwise detect from URL
  const detectedType = sourceType || 
    (url.includes('pinterest.com') ? 'pinterest' : 
     url.includes('google.com/search') ? 'google_images' : null);

  if (detectedType === 'pinterest') {
    // For Pinterest, return pin links (not images directly)
    // The background script will handle opening each pin
    return { links: scrapePinterest() };
  } else if (detectedType === 'google_images') {
    return { images: scrapeGoogleImages() };
  }

  return { images: [] };
}

// Scrape Pinterest - get all pin links from the page (without scroll)
function scrapePinterest() {
  const pinLinks = [];
  console.log('[CONTENT] Starting Pinterest link scraping...');
  
  try {
    // Use XPath to find all pin links: //div[contains(@role,'listitem')]//a
    const xpath = "//div[contains(@role,'listitem')]//a";
    console.log('[CONTENT] Executing XPath:', xpath);
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    console.log(`[CONTENT] XPath found ${result.snapshotLength} elements`);
    for (let i = 0; i < result.snapshotLength; i++) {
      const link = result.snapshotItem(i);
      if (!link) continue; // Prevent stale element errors
      const href = link.href;
      
      // Only include Pinterest pin URLs
      if (href && href.includes('/pin/') && !pinLinks.includes(href)) {
        pinLinks.push(href);
        console.log(`[CONTENT] Found pin link ${pinLinks.length}:`, href);
      }
    }
  } catch (error) {
    console.error('[CONTENT] Error finding pin links with XPath:', error);
    // Fallback to querySelector if XPath fails
    console.log('[CONTENT] Trying fallback method...');
    try {
      // Fresh query to prevent stale elements
      const fallbackLinks = document.querySelectorAll('a[href*="/pin/"]');
      console.log(`[CONTENT] Fallback found ${fallbackLinks.length} links`);
      fallbackLinks.forEach(link => {
        if (!link) return; // Skip if element is stale
        const href = link.href;
        if (href && !pinLinks.includes(href)) {
          pinLinks.push(href);
        }
      });
    } catch (fallbackError) {
      console.error('[CONTENT] Fallback method also failed:', fallbackError);
    }
  }

  console.log(`[CONTENT] Total unique pin links found: ${pinLinks.length}`);
  return pinLinks;
}

// Scrape Pinterest with auto-scroll to load more posts
async function scrapePinterestWithScroll(maxPosts = 50) {
  const pinLinks = new Set(); // Use Set to avoid duplicates - this accumulates ALL links found
  const maxScrollAttempts = 100; // Increased attempts for incremental scrolling
  const scrollIncrement = 800; // Scroll 800px at a time instead of all the way
  const scrollDelay = 800; // Wait between scroll increments
  const loadWaitTime = 1500; // Wait for content to load after scroll
  
  console.log(`[CONTENT] Starting Pinterest scraping with incremental scroll (target: ${maxPosts} posts)...`);
  
  // Helper function to capture all current links and add to Set
  // This gets ALL links in the DOM, not just visible ones
  const captureCurrentLinks = () => {
    const currentLinks = getFreshPinLinks();
    let newLinksCount = 0;
    currentLinks.forEach(href => {
      if (href && href.includes('/pin/')) {
        // Normalize the URL to avoid duplicates with query params
        const normalizedHref = href.split('?')[0]; // Remove query params
        const beforeSize = pinLinks.size;
        pinLinks.add(normalizedHref);
        if (pinLinks.size > beforeSize) {
          newLinksCount++;
        }
      }
    });
    return newLinksCount;
  };
  
  // Initial capture before any scrolling
  captureCurrentLinks();
  console.log(`[CONTENT] Initial capture: Found ${pinLinks.size} unique links`);
  
  let scrollAttempts = 0;
  let lastLinkCount = pinLinks.size;
  let noNewLinksCount = 0;
  let currentScrollPosition = 0;
  
  while (pinLinks.size < maxPosts && scrollAttempts < maxScrollAttempts) {
    try {
      // Capture links at current position before scrolling
      const beforeScrollCount = captureCurrentLinks();
      
      // If we have enough links, stop scrolling
      if (pinLinks.size >= maxPosts) {
        console.log(`[CONTENT] Reached target of ${maxPosts} links, stopping scroll`);
        break;
      }
      
      // Scroll incrementally (not all the way to bottom)
      const previousHeight = document.documentElement.scrollHeight;
      currentScrollPosition += scrollIncrement;
      
      // Scroll to the new position
      window.scrollTo({
        top: currentScrollPosition,
        behavior: 'smooth'
      });
      
      // Wait a bit for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Wait for new content to load
      await new Promise(resolve => setTimeout(resolve, loadWaitTime));
      
      // Capture links after scrolling
      const afterScrollCount = captureCurrentLinks();
      console.log(`[CONTENT] Scroll ${scrollAttempts + 1} (pos: ${currentScrollPosition}px): Total ${pinLinks.size} unique links (${afterScrollCount} new this scroll)`);
      
      // Check if page height increased (new content loaded)
      const newHeight = document.documentElement.scrollHeight;
      if (newHeight > previousHeight) {
        noNewLinksCount = 0; // Reset if page height increased
      }
      
      // If we're near the bottom, scroll to actual bottom to trigger more loading
      const scrollPercentage = (currentScrollPosition / newHeight) * 100;
      if (scrollPercentage > 80) {
        // Near bottom, scroll all the way to trigger Pinterest's infinite scroll
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'smooth'
        });
        await new Promise(resolve => setTimeout(resolve, loadWaitTime));
        captureCurrentLinks();
        // Reset position tracking
        currentScrollPosition = window.scrollY;
      }
      
      // Check if we got new links
      if (pinLinks.size === lastLinkCount) {
        noNewLinksCount++;
        // If no new links for 5 consecutive scrolls, we might have reached the end
        if (noNewLinksCount >= 5) {
          console.log('[CONTENT] No new links found after 5 scrolls, trying to scroll to bottom...');
          // Try scrolling to absolute bottom one more time
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
          });
          await new Promise(resolve => setTimeout(resolve, loadWaitTime * 2));
          captureCurrentLinks();
          if (pinLinks.size === lastLinkCount) {
            console.log('[CONTENT] Still no new links, stopping...');
            break;
          } else {
            noNewLinksCount = 0; // Reset if we found new links
          }
        }
      } else {
        noNewLinksCount = 0; // Reset counter if we found new links
      }
      
      lastLinkCount = pinLinks.size;
      scrollAttempts++;
      
      // Small delay between scroll attempts
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
    } catch (error) {
      console.error(`[CONTENT] Error during scroll attempt ${scrollAttempts + 1}:`, error);
      // Still capture links even if there's an error
      captureCurrentLinks();
      scrollAttempts++;
      // Continue trying even if one attempt fails
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
    }
  }
  
  // Final capture to get any remaining links
  captureCurrentLinks();
  
  // Try one final scroll to bottom to catch any remaining links
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: 'smooth'
  });
  await new Promise(resolve => setTimeout(resolve, loadWaitTime * 2));
  captureCurrentLinks();
  
  const linksArray = Array.from(pinLinks).slice(0, maxPosts); // Limit to maxPosts
  console.log(`[CONTENT] Auto-scroll complete: Found ${linksArray.length} unique pin links (from ${pinLinks.size} total captured)`);
  return { links: linksArray };
}

// Get fresh pin links (prevents stale element errors)
// This gets ALL links in the DOM, including ones that might be off-screen
function getFreshPinLinks() {
  const links = [];
  const seenHrefs = new Set(); // Track seen hrefs to avoid duplicates in this call
  
  try {
    // Method 1: XPath (more reliable) - get ALL links, not just visible ones
    const xpath = "//a[contains(@href, '/pin/')]";
    const result = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );
    
    for (let i = 0; i < result.snapshotLength; i++) {
      try {
        const link = result.snapshotItem(i);
        if (link && link.href) {
          const href = link.href.split('?')[0]; // Normalize by removing query params
          if (!seenHrefs.has(href)) {
            seenHrefs.add(href);
            links.push(link.href); // Keep original href with query params for now
          }
        }
      } catch (e) {
        // Skip stale elements
        continue;
      }
    }
  } catch (error) {
    console.log('[CONTENT] XPath method failed, trying fallback...');
  }
  
  // Method 2: QuerySelector fallback - get ALL links with /pin/ in href
  try {
    const fallbackLinks = document.querySelectorAll('a[href*="/pin/"]');
    fallbackLinks.forEach(link => {
      try {
        if (link && link.href) {
          const href = link.href.split('?')[0]; // Normalize
          if (!seenHrefs.has(href)) {
            seenHrefs.add(href);
            links.push(link.href);
          }
        }
      } catch (e) {
        // Skip stale elements
      }
    });
  } catch (error) {
    console.error('[CONTENT] Fallback method failed:', error);
  }
  
  return links;
}

// Extract image from individual pin page (with stale element prevention)
function scrapePinterestPin(searchQuery = '') {
  const images = [];
  console.log('[CONTENT] Starting Pinterest pin image extraction...');
  if (searchQuery) {
    console.log('[CONTENT] Using search query from URL:', searchQuery);
  }
  
  // Check if this is a video post - skip videos
  const videoElement = document.querySelector('video');
  if (videoElement) {
    console.log('[CONTENT] Video post detected, skipping (no image to extract)');
    return images; // Return empty array
  }
  
  // Check for video indicators in the page
  const hasVideoIndicator = document.querySelector('[data-test-id="video-player"]') || 
                           document.querySelector('video') ||
                           document.body.textContent.includes('Video') && document.querySelector('button[aria-label*="Play"]');
  if (hasVideoIndicator) {
    console.log('[CONTENT] Video post detected via indicators, skipping');
    return images;
  }
  
  // Retry mechanism to handle stale elements
  let img = null;
  let retries = 3;
  
  while (!img && retries > 0) {
    try {
      // Get the main pin image using XPath: //img[contains(@elementtiming,'MainPinImage')]
      const xpath = "//img[contains(@elementtiming,'MainPinImage')]";
      console.log('[CONTENT] Executing XPath for pin image (attempts remaining: ' + retries + '):', xpath);
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
      );

      img = result.singleNodeValue;
      
      // Verify element is still attached to DOM (not stale)
      if (img) {
        try {
          // Try to access a property to check if element is stale
          const test = img.tagName;
          if (!document.contains(img)) {
            console.log('[CONTENT] Element found but not in DOM, retrying...');
            img = null;
            retries--;
            continue;
          }
        } catch (e) {
          console.log('[CONTENT] Stale element detected, retrying...');
          img = null;
          retries--;
          continue;
        }
      }
      
      if (img) break; // Success, exit retry loop
    } catch (error) {
      console.error('[CONTENT] Error finding image element:', error);
      retries--;
    }
  }
  
  console.log('[CONTENT] Found image element:', !!img);

  // If no image found after retries, check if it's a video or unsupported content
  if (!img) {
    // Final check for video or other unsupported content
    const hasVideo = document.querySelector('video') || 
                     document.querySelector('[data-test-id="video-player"]');
    if (hasVideo) {
      console.log('[CONTENT] No image found and video detected, skipping');
      return images;
    }
    console.log('[CONTENT] No image element found after retries, may be unsupported content type');
    return images; // Return empty array to skip this pin
  }

  if (img) {
    try {
      // Try to get the highest quality image URL (with stale element protection)
      let imageUrl = null;
      try {
        imageUrl = img.src || img.getAttribute('srcset')?.split(' ')[0];
      } catch (e) {
        console.log('[CONTENT] Error accessing img.src, element may be stale');
      }
      
      // Pinterest often uses data-src for lazy loading
      if (!imageUrl || imageUrl.includes('data:image')) {
        try {
          imageUrl = img.getAttribute('data-src') || 
                     img.getAttribute('data-lazy-src') ||
                     img.getAttribute('src');
        } catch (e) {
          console.log('[CONTENT] Error accessing img attributes');
        }
      }

      // Get the original/high-res version if available
      if (imageUrl && imageUrl.includes('236x')) {
        // Replace with larger size (564x is common, or try 736x)
        imageUrl = imageUrl.replace(/236x/g, '736x').replace(/564x/g, '736x');
      }

      if (imageUrl && !imageUrl.includes('avatar') && !imageUrl.includes('logo')) {
        // Get caption using XPath: //h1 (with stale element protection)
        let caption = '';
        try {
          const h1Result = document.evaluate(
            "//h1",
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          );
          const h1Element = h1Result.singleNodeValue;
          if (h1Element) {
            try {
              // Verify element is not stale
              if (document.contains(h1Element)) {
                caption = h1Element.textContent?.trim() || '';
                console.log('[CONTENT] Found h1 caption:', caption);
              }
            } catch (e) {
              console.log('[CONTENT] Error accessing h1 textContent');
            }
          }
        } catch (error) {
          console.log('[CONTENT] Error extracting h1 caption:', error);
        }
        
        // Get description/alt text (fallback if no h1) - with fresh query
        let description = caption;
        if (!description) {
          try {
            const altText = img.alt || '';
            const titleElement = document.querySelector('[data-test-id="pin-title"]');
            const titleText = titleElement ? (titleElement.textContent?.trim() || '') : '';
            description = altText || titleText || '';
          } catch (e) {
            console.log('[CONTENT] Error getting description fallback');
          }
        }
        
        // Combine description with search query for better extraction
        // Search query from URL is more reliable for categorization
        const combinedText = searchQuery ? `${searchQuery} ${description}` : description;
        
        // Try to extract fandom/tags/character from search query (preferred) or description
        // Use search query first as it's more reliable (e.g., "love and deep space xavier")
        const fandom = extractFandom(searchQuery || description);
        const tags = extractTags(searchQuery || description);
        const character = extractCharacterName(searchQuery || description, fandom);

        console.log('[CONTENT] Extracted metadata:', { fandom, character, tags });

        // Basic face detection - skip if description suggests faces
        if (!containsFaceKeywords(description)) {
          images.push({
            url: imageUrl,
            sourceUrl: window.location.href,
            description,
            fandom,
            tags,
            character,
            searchQuery: searchQuery || null,  // Store search query for upload
            filename: `pinterest_${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`
          });
        }
      }
    } catch (error) {
      console.error('Error scraping pin image:', error);
    }
  }

  return images;
}

// Scrape Google Images
function scrapeGoogleImages() {
  const images = [];
  
  // Google Images uses multiple possible selectors
  // Try different selectors as Google changes their structure
  let imageContainers = document.querySelectorAll('div[data-ri]');
  
  // Fallback selectors if the primary one doesn't work
  if (imageContainers.length === 0) {
    imageContainers = document.querySelectorAll('div[jsname] img[data-src], div[jsname] img[src]');
  }
  
  if (imageContainers.length === 0) {
    // Try finding images in the main content area
    const mainContent = document.querySelector('#search') || document.body;
    imageContainers = mainContent.querySelectorAll('img[data-src], img[src]');
  }
  
  imageContainers.forEach((container, index) => {
    try {
      // Handle both container divs and direct img elements
      const img = container.tagName === 'IMG' ? container : container.querySelector('img');
      if (!img) return;

      // Get image URL - try data-src first (lazy loaded), then src
      const imageUrl = img.getAttribute('data-src') || img.src;
      if (!imageUrl || 
          imageUrl.startsWith('data:') || 
          imageUrl.includes('logo') ||
          imageUrl.includes('googleusercontent.com/logo') ||
          imageUrl.includes('gstatic.com')) {
        return;
      }

      // Get alt text or parent text
      const description = img.alt || 
                         container.getAttribute('aria-label') || 
                         container.textContent?.trim() || 
                         '';
      
      // Extract fandom/tags/character from description or search query
      const searchQuery = new URLSearchParams(window.location.search).get('q') || '';
      const fandom = extractFandom(description || searchQuery);
      const tags = extractTags(description || searchQuery);
      const character = extractCharacterName(description || searchQuery, fandom);

      // Basic face detection
      if (containsFaceKeywords(description)) {
        return;
      }

      images.push({
        url: imageUrl,
        sourceUrl: window.location.href,
        description: description || searchQuery,
        fandom,
        tags,
        character,
        filename: `google_${Date.now()}_${index}_${Math.random().toString(36).substring(7)}.jpg`
      });
    } catch (error) {
      console.error('Error scraping Google image:', error);
    }
  });

  // Limit to first 50 images to avoid overwhelming the system
  return images.slice(0, 50);
}

// Scrape Google Images with auto-scroll to load all images
async function scrapeGoogleImagesWithScroll(maxPosts = 200) {
  const images = [];
  const imageUrls = new Set(); // Use Set to avoid duplicates
  const maxScrollAttempts = 100;
  const scrollIncrement = 1000; // Scroll 1000px at a time
  const scrollDelay = 500; // Wait between scroll increments
  const loadWaitTime = 2000; // Wait for content to load after scroll
  
  console.log(`[CONTENT] [GOOGLE IMAGES] ========================================`);
  console.log(`[CONTENT] [GOOGLE IMAGES] Starting Google Images scraping with incremental scroll`);
  console.log(`[CONTENT] [GOOGLE IMAGES] Target: ${maxPosts} images`);
  console.log(`[CONTENT] [GOOGLE IMAGES] Current URL: ${window.location.href}`);
  
  // Get search query from URL
  const searchQuery = new URLSearchParams(window.location.search).get('q') || '';
  console.log(`[CONTENT] [GOOGLE IMAGES] Search query: "${searchQuery}"`);
  console.log(`[CONTENT] [GOOGLE IMAGES] Page title: ${document.title}`);
  
  // Helper: request a trusted click from background.js via chrome.debugger
  const requestTrustedClick = (x, y) => {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: 'trustedClick', x, y },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response);
          } else {
            reject(new Error(response?.error || 'Trusted click failed'));
          }
        }
      );
    });
  };

  // Helper function to click on images and extract URLs using trusted clicks via chrome.debugger
  const clickAndExtractImageUrls = async (maxToExtract) => {
    const extractedUrls = [];
    
    try {
      // Use XPath to find all h3/a links
      const xpath = "//h3/a";
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      
      const totalLinks = result.snapshotLength;
      const linksToProcess = Math.min(maxToExtract, totalLinks);
      
      console.log(`[CONTENT] [GOOGLE IMAGES] Found ${totalLinks} h3/a elements, processing first ${linksToProcess}...`);
      console.log(`[CONTENT] [GOOGLE IMAGES] Using chrome.debugger trusted clicks for reliable href generation`);
      
      for (let i = 0; i < linksToProcess; i++) {
        try {
          const link = result.snapshotItem(i);
          if (!link) continue;
          
          // Find the image or clickable element inside the link
          let elementToClick = null;
          
          const img = link.querySelector('img');
          if (img) {
            elementToClick = img;
          } else {
            const buttonDiv = link.querySelector('div[role="button"]');
            if (buttonDiv) {
              elementToClick = buttonDiv;
            } else {
              const imageDiv = link.querySelector('div.q1MG4e, div.tb08Pd, div.H8Rx8c');
              if (imageDiv) {
                elementToClick = imageDiv;
              }
            }
          }
          
          if (!elementToClick) {
            console.log(`[CONTENT] [GOOGLE IMAGES] No clickable element found for link ${i + 1}, skipping`);
            continue;
          }
          
          // Scroll element into view first
          elementToClick.scrollIntoView({ behavior: 'auto', block: 'center' });
          await new Promise(resolve => setTimeout(resolve, 150));
          
          // Get element coordinates for trusted click
          const rect = elementToClick.getBoundingClientRect();
          const clickX = rect.left + rect.width / 2;
          const clickY = rect.top + rect.height / 2;
          
          // Perform trusted click via chrome.debugger (background script)
          try {
            await requestTrustedClick(clickX, clickY);
            console.log(`[CONTENT] [GOOGLE IMAGES] Trusted click on element ${i + 1} at (${Math.round(clickX)}, ${Math.round(clickY)})`);
          } catch (clickErr) {
            console.log(`[CONTENT] [GOOGLE IMAGES] Trusted click failed for element ${i + 1}: ${clickErr.message}, falling back to .click()`);
            elementToClick.click();
          }
          
          // Wait for Google's JS to process the click and generate the href
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Check if the link now has an href after trusted click
          const hrefAfterClick = link.getAttribute('href');
          const hasHref = !!hrefAfterClick;
          let hrefImageUrl = null;
          
          if (hrefAfterClick) {
            // Try to extract the image URL from the href
            if (hrefAfterClick.startsWith('/imgres') || hrefAfterClick.includes('imgurl=')) {
              try {
                const urlObj = new URL(hrefAfterClick, window.location.origin);
                hrefImageUrl = urlObj.searchParams.get('imgurl');
              } catch (e) {
                const match = hrefAfterClick.match(/imgurl=([^&]+)/);
                if (match) hrefImageUrl = decodeURIComponent(match[1]);
              }
            } else if (hrefAfterClick.startsWith('http') && hrefAfterClick.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i)) {
              hrefImageUrl = hrefAfterClick;
            }
          }
          
          console.log(`[CONTENT] [GOOGLE IMAGES] [DEBUG] After trusted click ${i + 1}: href=${hasHref ? 'yes' : 'no'}${hrefAfterClick ? ', hrefPreview=' + hrefAfterClick.substring(0, 100) + (hrefAfterClick.length > 100 ? '...' : '') : ''}${hrefImageUrl ? ', extractedImageUrl=' + hrefImageUrl.substring(0, 100) : ''}`);
          
          // If we got an image URL from the href, use it (preferred - full resolution)
          if (hrefImageUrl && !imageUrls.has(hrefImageUrl)) {
            imageUrls.add(hrefImageUrl);
            extractedUrls.push(hrefImageUrl);
            console.log(`[CONTENT] [GOOGLE IMAGES] Extracted URL ${extractedUrls.length} from href imgurl: ${hrefImageUrl.substring(0, 80)}...`);
          } else {
            // Fallback: use //a/img XPath to find image from the opened panel
            const imgXPath = "//a/img";
            const imgResult = document.evaluate(
              imgXPath,
              document,
              null,
              XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
              null
            );
            
            console.log(`[CONTENT] [GOOGLE IMAGES] [DEBUG] Fallback: Found ${imgResult.snapshotLength} img elements in //a/img after click ${i + 1}`);
            
            // Log all available URLs for debugging
            const allImgUrls = [];
            for (let j = 0; j < imgResult.snapshotLength; j++) {
              const imgEl = imgResult.snapshotItem(j);
              if (imgEl) {
                const url = imgEl.currentSrc || imgEl.src || imgEl.getAttribute('src') || imgEl.getAttribute('data-src') || '';
                allImgUrls.push(url ? url.substring(0, 120) + (url.length > 120 ? '...' : '') : '(empty)');
              }
            }
            console.log(`[CONTENT] [GOOGLE IMAGES] [DEBUG] All //a/img URLs after click ${i + 1} (${allImgUrls.length} total):`, allImgUrls);
            
            // Get the 5th image element (index 4, 0-based)
            if (imgResult.snapshotLength > 4) {
              const fifthImg = imgResult.snapshotItem(4);
              if (fifthImg) {
                const imageUrl = fifthImg.currentSrc || fifthImg.src;
                
                if (imageUrl && 
                    !imageUrl.startsWith('data:') && 
                    !imageUrl.includes('logo') &&
                    !imageUrl.includes('favicon') &&
                    !imageUrls.has(imageUrl)) {
                  imageUrls.add(imageUrl);
                  extractedUrls.push(imageUrl);
                  console.log(`[CONTENT] [GOOGLE IMAGES] Extracted URL ${extractedUrls.length} from 5th img element (fallback): ${imageUrl.substring(0, 80)}...`);
                } else {
                  console.log(`[CONTENT] [GOOGLE IMAGES] 5th img element has invalid URL or duplicate: ${imageUrl?.substring(0, 80)}...`);
                }
              }
            } else {
              console.log(`[CONTENT] [GOOGLE IMAGES] Not enough img elements found (${imgResult.snapshotLength}), need at least 5`);
            }
          }
          
          // Small delay between clicks
          if (i < linksToProcess - 1) {
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        } catch (e) {
          console.log(`[CONTENT] [GOOGLE IMAGES] Error processing link ${i + 1}:`, e.message);
        }
      }
      
      console.log(`[CONTENT] [GOOGLE IMAGES] Extracted ${extractedUrls.length} URLs from trusted clicks`);
      
      // Detach debugger now that we're done clicking
      try {
        chrome.runtime.sendMessage({ action: 'detachDebugger' });
      } catch (e) {
        // Ignore detach errors
      }
      
      return extractedUrls;
    } catch (error) {
      console.error('[CONTENT] [GOOGLE IMAGES] Error clicking and extracting images:', error);
      try {
        chrome.runtime.sendMessage({ action: 'detachDebugger' });
      } catch (e) { /* ignore */ }
      return [];
    }
  };
  
  // Helper function to extract image URLs using XPath //h3/a
  const extractImageUrls = () => {
    const urls = [];
    const beforeCount = imageUrls.size;
    try {
      // Use XPath to find all h3/a links as specified by user
      const xpath = "//h3/a";
      const result = document.evaluate(
        xpath,
        document,
        null,
        XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
        null
      );
      
      console.log(`[CONTENT] [GOOGLE IMAGES] XPath found ${result.snapshotLength} h3/a elements`);
      
      let processedCount = 0;
      let noHrefCount = 0;
      let unmatchedHrefCount = 0;
      let sampleHrefs = []; // Store first few hrefs for debugging
      let sampleNoHrefLinks = []; // Store first few links without href for debugging
      let sampleAttributes = []; // Store attributes of links without href
      
      for (let i = 0; i < result.snapshotLength; i++) {
        try {
          const link = result.snapshotItem(i);
          if (!link) continue;
          
          // Get the href attribute
          const href = link.getAttribute('href');
          if (!href) {
            noHrefCount++;
            
            // Debug: Store info about links without href
            if (sampleNoHrefLinks.length < 5) {
              const linkInfo = {
                tagName: link.tagName,
                className: link.className,
                id: link.id,
                allAttributes: {},
                innerHTML: link.innerHTML?.substring(0, 100),
                hasOnClick: !!link.onclick,
                hasDataAttributes: false,
                dataAttributes: {}
              };
              
              // Get all attributes
              if (link.attributes) {
                for (let attr of link.attributes) {
                  linkInfo.allAttributes[attr.name] = attr.value?.substring(0, 100);
                  if (attr.name.startsWith('data-')) {
                    linkInfo.hasDataAttributes = true;
                    linkInfo.dataAttributes[attr.name] = attr.value?.substring(0, 100);
                  }
                }
              }
              
              // Check for JavaScript event handlers
              linkInfo.hasOnClick = !!link.getAttribute('onclick');
              linkInfo.onclickValue = link.getAttribute('onclick')?.substring(0, 100);
              
              // Check for img element inside
              const img = link.querySelector('img');
              if (img) {
                linkInfo.hasImg = true;
                linkInfo.imgSrc = img.getAttribute('src')?.substring(0, 100);
                linkInfo.imgDataSrc = img.getAttribute('data-src')?.substring(0, 100);
                linkInfo.imgAttributes = {};
                if (img.attributes) {
                  for (let attr of img.attributes) {
                    if (attr.name.startsWith('data-') || attr.name === 'src') {
                      linkInfo.imgAttributes[attr.name] = attr.value?.substring(0, 100);
                    }
                  }
                }
              }
              
              sampleNoHrefLinks.push(linkInfo);
            }
            continue;
          }
          
          // Store first few hrefs for debugging
          if (sampleHrefs.length < 5) {
            sampleHrefs.push(href);
          }
          
          processedCount++;
          
          // Extract image URL from the link
          // Google Images links can be in various formats:
          // 1. /imgres?imgurl=...
          // 2. Direct image URLs (http/https)
          // 3. Relative URLs that need to be resolved
          // 4. Links to image detail pages (need to extract from data attributes or parent)
          let imageUrl = null;
          
          // Try to get image URL from data attributes first (Google Images often stores it here)
          const dataSrc = link.getAttribute('data-src') || 
                         link.getAttribute('data-original') ||
                         link.querySelector('img')?.getAttribute('data-src') ||
                         link.querySelector('img')?.getAttribute('src');
          
          if (dataSrc && !dataSrc.startsWith('data:') && !dataSrc.includes('logo') && !dataSrc.includes('gstatic.com')) {
            imageUrl = dataSrc;
          } else if (href.startsWith('/imgres')) {
            // Parse the imgurl parameter
            try {
              const urlObj = new URL(href, window.location.origin);
              imageUrl = urlObj.searchParams.get('imgurl');
            } catch (e) {
              // If parsing fails, try to extract from href directly
              const match = href.match(/imgurl=([^&]+)/);
              if (match) {
                imageUrl = decodeURIComponent(match[1]);
              }
            }
          } else if (href.startsWith('http')) {
            // Check if it's a direct image URL
            if (href.match(/\.(jpg|jpeg|png|gif|webp|bmp)(\?|$)/i)) {
              imageUrl = href;
            } else {
              // Might be a link to image detail page, try to extract from URL params
              try {
                const urlObj = new URL(href);
                imageUrl = urlObj.searchParams.get('imgurl') || urlObj.searchParams.get('url');
              } catch (e) {
                // Not a valid URL, skip
              }
            }
          } else if (href.startsWith('/')) {
            // Relative URL - might be /imgres or similar, try to resolve it
            try {
              const resolvedUrl = new URL(href, window.location.origin);
              if (resolvedUrl.pathname.includes('imgres')) {
                imageUrl = resolvedUrl.searchParams.get('imgurl');
              }
            } catch (e) {
              // Skip relative URLs that can't be resolved
            }
          }
          
          // If still no imageUrl, try to find img element within the link
          if (!imageUrl) {
            const img = link.querySelector('img');
            if (img) {
              imageUrl = img.getAttribute('data-src') || 
                        img.getAttribute('data-original') ||
                        img.getAttribute('src');
            }
          }
          
          if (imageUrl && !imageUrl.startsWith('data:') && !imageUrls.has(imageUrl)) {
            imageUrls.add(imageUrl);
            urls.push(imageUrl);
            if (urls.length <= 10) { // Only log first 10 to avoid spam
              console.log(`[CONTENT] [GOOGLE IMAGES] Found image URL ${urls.length}: ${imageUrl.substring(0, 80)}...`);
            }
          } else if (!imageUrl) {
            unmatchedHrefCount++;
          }
        } catch (e) {
          console.log('[CONTENT] [GOOGLE IMAGES] Error processing link:', e);
          continue;
        }
      }
      
      // Debug logging
      console.log(`[CONTENT] [GOOGLE IMAGES] Processed ${processedCount} links with hrefs`);
      console.log(`[CONTENT] [GOOGLE IMAGES] Links without href: ${noHrefCount}`);
      console.log(`[CONTENT] [GOOGLE IMAGES] Links that didn't match image URL pattern: ${unmatchedHrefCount}`);
      if (sampleHrefs.length > 0) {
        console.log(`[CONTENT] [GOOGLE IMAGES] Sample hrefs (first ${sampleHrefs.length}):`, sampleHrefs);
      }
      // DEBUG: Log ALL image URLs extracted from h3/a (full list)
      if (urls.length > 0) {
        console.log(`[CONTENT] [GOOGLE IMAGES] [DEBUG] All image URLs from h3/a hrefs (${urls.length} total):`, urls);
      }
      if (sampleNoHrefLinks.length > 0) {
        console.log(`[CONTENT] [GOOGLE IMAGES] ===== DEBUG: Links without href (first ${sampleNoHrefLinks.length}) =====`);
        sampleNoHrefLinks.forEach((linkInfo, idx) => {
          console.log(`[CONTENT] [GOOGLE IMAGES] Link ${idx + 1} without href:`, {
            tagName: linkInfo.tagName,
            className: linkInfo.className,
            id: linkInfo.id,
            hasOnClick: linkInfo.hasOnClick,
            onclickValue: linkInfo.onclickValue,
            hasDataAttributes: linkInfo.hasDataAttributes,
            dataAttributes: linkInfo.dataAttributes,
            hasImg: linkInfo.hasImg,
            imgSrc: linkInfo.imgSrc,
            imgDataSrc: linkInfo.imgDataSrc,
            imgAttributes: linkInfo.imgAttributes,
            allAttributes: linkInfo.allAttributes,
            innerHTMLPreview: linkInfo.innerHTML
          });
        });
        console.log(`[CONTENT] [GOOGLE IMAGES] ===== END DEBUG =====`);
      }
      console.log(`[CONTENT] [GOOGLE IMAGES] XPath extraction: ${urls.length} new URLs from h3/a links`);
    } catch (error) {
      console.error('[CONTENT] [GOOGLE IMAGES] Error extracting image URLs with XPath:', error);
    }
    
    // Fallback: Extract from img elements only if we didn't get enough from hrefs
    // This is a fallback, primary method is clicking to generate hrefs
    if (urls.length < maxPosts) {
      try {
        const searchArea = document.querySelector('#search') || document.body;
        const imgElements = searchArea.querySelectorAll('img');
        console.log(`[CONTENT] [GOOGLE IMAGES] Fallback: Found ${imgElements.length} img elements`);
        
        let imgExtractedCount = 0;
        imgElements.forEach((img) => {
          try {
            // Get image URL - try multiple attributes
            let imageUrl = img.getAttribute('data-src') || 
                          img.getAttribute('data-original') ||
                          img.getAttribute('src') ||
                          img.currentSrc;
            
            // Skip if invalid
            if (!imageUrl || 
                imageUrl.startsWith('data:') || 
                imageUrl.includes('logo') ||
                imageUrl.includes('googleusercontent.com/logo') ||
                imageUrl.includes('gstatic.com') ||
                imageUrl.includes('favicon') ||
                imageUrl.includes('icon') ||
                imageUrl.length < 20) {
              return;
            }
            
            // Clean up Google Images URLs
            if (imageUrl.includes('googleusercontent.com')) {
              const baseUrl = imageUrl.split('=')[0];
              if (baseUrl) {
                imageUrl = baseUrl + '=s0';
              }
            }
            
            if (!imageUrls.has(imageUrl)) {
              imageUrls.add(imageUrl);
              urls.push(imageUrl);
              imgExtractedCount++;
            }
          } catch (e) {
            // Skip
          }
        });
        
        if (imgExtractedCount > 0) {
          console.log(`[CONTENT] [GOOGLE IMAGES] Fallback: Extracted ${imgExtractedCount} URLs from img elements`);
        }
      } catch (e) {
        console.log('[CONTENT] [GOOGLE IMAGES] Fallback extraction failed:', e);
      }
    }
    
    const newUrls = imageUrls.size - beforeCount;
    console.log(`[CONTENT] [GOOGLE IMAGES] Total unique URLs: ${imageUrls.size} (${newUrls} new this extraction)`);
    return urls;
  };
  
  // Initial extraction before scrolling
  console.log(`[CONTENT] [GOOGLE IMAGES] Starting initial extraction before scrolling...`);
  
  // Click on images and extract URLs using //a/img XPath (5th element)
  console.log(`[CONTENT] [GOOGLE IMAGES] Clicking images and extracting URLs using //a/img XPath...`);
  const initialUrls = await clickAndExtractImageUrls(maxPosts);
  console.log(`[CONTENT] [GOOGLE IMAGES] Initial extraction: Found ${initialUrls.length} unique image URLs`);
  console.log(`[CONTENT] [GOOGLE IMAGES] Current page height: ${document.documentElement.scrollHeight}px`);
  
  let scrollAttempts = 0;
  let lastImageCount = imageUrls.size;
  let noNewImagesCount = 0;
  let currentScrollPosition = 0;
  let consecutiveNoNewImages = 0;
  const MAX_CONSECUTIVE_NO_NEW = 3; // Stop after 3 consecutive scrolls with no new images
  
  // Scroll to bottom to load all images
  console.log(`[CONTENT] [GOOGLE IMAGES] Starting scroll loop (max attempts: ${maxScrollAttempts})...`);
  while (imageUrls.size < maxPosts && scrollAttempts < maxScrollAttempts) {
    try {
      // Extract URLs at current position
      const beforeScrollCount = imageUrls.size;
      
      // Click on new images that appeared after scrolling and extract URLs
      const remainingNeeded = maxPosts - imageUrls.size;
      if (remainingNeeded > 0) {
        console.log(`[CONTENT] [GOOGLE IMAGES] Clicking images after scroll ${scrollAttempts + 1} (need ${remainingNeeded} more)...`);
        const newUrls = await clickAndExtractImageUrls(remainingNeeded + 10); // Click a bit more than needed
        console.log(`[CONTENT] [GOOGLE IMAGES] Extracted ${newUrls.length} new URLs after scroll ${scrollAttempts + 1}`);
      }
      
      // Also try regular extraction as backup
      extractImageUrls();
      
      // If we have enough images, stop scrolling
      if (imageUrls.size >= maxPosts) {
        console.log(`[CONTENT] [GOOGLE IMAGES] ✓ Reached target of ${maxPosts} images, stopping scroll`);
        break;
      }
      
      // Scroll incrementally
      const previousHeight = document.documentElement.scrollHeight;
      currentScrollPosition += scrollIncrement;
      
      console.log(`[CONTENT] [GOOGLE IMAGES] Scroll attempt ${scrollAttempts + 1}: Scrolling to position ${currentScrollPosition}px`);
      
      // Scroll to the new position
      window.scrollTo({
        top: currentScrollPosition,
        behavior: 'smooth'
      });
      
      // Wait for scroll to complete
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Wait for new content to load
      await new Promise(resolve => setTimeout(resolve, loadWaitTime));
      
      // Extract URLs after scrolling
      extractImageUrls();
      const afterScrollCount = imageUrls.size;
      const newImagesThisScroll = afterScrollCount - beforeScrollCount;
      console.log(`[CONTENT] [GOOGLE IMAGES] After scroll ${scrollAttempts + 1}: Total ${imageUrls.size} unique images (${newImagesThisScroll} new)`);
      
      // Check if page height increased
      const newHeight = document.documentElement.scrollHeight;
      const heightIncrease = newHeight - previousHeight;
      if (heightIncrease > 0) {
        console.log(`[CONTENT] [GOOGLE IMAGES] Page height increased by ${heightIncrease}px (${previousHeight}px → ${newHeight}px)`);
        noNewImagesCount = 0; // Reset if page height increased
      } else {
        console.log(`[CONTENT] [GOOGLE IMAGES] Page height unchanged: ${newHeight}px`);
      }
      
      // If we're near the bottom, scroll all the way to trigger more loading
      const scrollPercentage = (currentScrollPosition / newHeight) * 100;
      if (scrollPercentage > 80) {
        console.log(`[CONTENT] [GOOGLE IMAGES] Near bottom (${scrollPercentage.toFixed(1)}%), scrolling to absolute bottom...`);
        // Near bottom, scroll all the way to trigger Google's infinite scroll
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: 'smooth'
        });
        await new Promise(resolve => setTimeout(resolve, loadWaitTime));
        extractImageUrls();
        // Reset position tracking
        currentScrollPosition = window.scrollY;
        console.log(`[CONTENT] [GOOGLE IMAGES] Scrolled to bottom, now at ${currentScrollPosition}px`);
      }
      
      // Check if we got new images
      if (imageUrls.size === lastImageCount) {
        consecutiveNoNewImages++;
        console.log(`[CONTENT] [GOOGLE IMAGES] No new images this scroll (consecutive: ${consecutiveNoNewImages}/${MAX_CONSECUTIVE_NO_NEW})`);
        
        // If no new images for MAX_CONSECUTIVE_NO_NEW consecutive scrolls, stop
        if (consecutiveNoNewImages >= MAX_CONSECUTIVE_NO_NEW) {
          console.log(`[CONTENT] [GOOGLE IMAGES] No new images after ${MAX_CONSECUTIVE_NO_NEW} consecutive scrolls, stopping...`);
          break;
        }
      } else {
        consecutiveNoNewImages = 0; // Reset counter if we found new images
        console.log(`[CONTENT] [GOOGLE IMAGES] Found ${imageUrls.size - lastImageCount} new images, resetting counter`);
      }
      
      lastImageCount = imageUrls.size;
      scrollAttempts++;
      
      // Small delay between scroll attempts
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
    } catch (error) {
      console.error(`[CONTENT] [GOOGLE IMAGES] Error during scroll attempt ${scrollAttempts + 1}:`, error);
      console.error(`[CONTENT] [GOOGLE IMAGES] Error stack:`, error.stack);
      scrollAttempts++;
      await new Promise(resolve => setTimeout(resolve, scrollDelay));
    }
  }
  
  // Final extraction to get any remaining images
  console.log(`[CONTENT] [GOOGLE IMAGES] Performing final extraction...`);
  extractImageUrls();
  
  // Try one final scroll to bottom
  console.log(`[CONTENT] [GOOGLE IMAGES] Final scroll to bottom...`);
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: 'smooth'
  });
  await new Promise(resolve => setTimeout(resolve, loadWaitTime * 2));
  extractImageUrls();
  
  // Convert Set to Array and limit to maxPosts
  const uniqueUrls = Array.from(imageUrls).slice(0, maxPosts);
  console.log(`[CONTENT] [GOOGLE IMAGES] Total unique URLs found: ${imageUrls.size}, limiting to ${uniqueUrls.length} for processing`);
  
  // Build image objects with metadata
  console.log(`[CONTENT] [GOOGLE IMAGES] Building image objects with metadata...`);
  for (let i = 0; i < uniqueUrls.length; i++) {
    const imageUrl = uniqueUrls[i];
    const fandom = extractFandom(searchQuery);
    const tags = extractTags(searchQuery);
    const character = extractCharacterName(searchQuery, fandom);
    
    images.push({
      url: imageUrl,
      sourceUrl: window.location.href,
      description: searchQuery,
      fandom,
      tags,
      character,
      searchQuery: searchQuery || null,
      filename: `google_${Date.now()}_${i}_${Math.random().toString(36).substring(7)}.jpg`
    });
    
    if ((i + 1) % 10 === 0) {
      console.log(`[CONTENT] [GOOGLE IMAGES] Processed ${i + 1}/${uniqueUrls.length} images...`);
    }
  }
  
  console.log(`[CONTENT] [GOOGLE IMAGES] ========================================`);
  console.log(`[CONTENT] [GOOGLE IMAGES] Auto-scroll complete: Found ${images.length} unique images`);
  console.log(`[CONTENT] [GOOGLE IMAGES] Scroll attempts: ${scrollAttempts}`);
  console.log(`[CONTENT] [GOOGLE IMAGES] Final page height: ${document.documentElement.scrollHeight}px`);
  console.log(`[CONTENT] [GOOGLE IMAGES] ========================================`);
  return { images };
}

// Extract fandom from text
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
  
  // Other fandoms
  const fandoms = [
    { key: 'genshin_impact', patterns: ['genshin', 'genshin impact'] },
    { key: 'honkai_starrail', patterns: ['honkai', 'star rail'] },
    { key: 'zenless_zone_zero', patterns: ['zenless', 'zzz'] },
    { key: 'jujutsu_kaisen', patterns: ['jujutsu kaisen', 'jjk'] },
    { key: 'demon_slayer', patterns: ['demon slayer', 'kimetsu'] },
    { key: 'mha', patterns: ['my hero academia', 'mha'] },
    { key: 'bungo_stray_dogs', patterns: ['bungo stray dogs', 'bsd'] },
    { key: 'mystic_messenger', patterns: ['mystic messenger'] },
    { key: 'obey_me', patterns: ['obey me'] },
    { key: 'tears_of_themis', patterns: ['tears of themis', 'tot'] }
  ];
  
  for (const fandom of fandoms) {
    for (const pattern of fandom.patterns) {
      if (lowerText.includes(pattern)) {
        return fandom.key;
      }
    }
  }

  return null;
}

// Extract tags from text
function extractTags(text) {
  const tags = [];
  const lowerText = text.toLowerCase();

  // Common anime/gaming tags
  const tagKeywords = {
    'anime': ['anime', 'manga', 'otaku', 'comic'],
    'gaming': ['game', 'gaming', 'gacha'],
    'aesthetic': ['aesthetic', 'kawaii', 'cute'],
    'fanart': ['fanart', 'fan art', 'fan-art']
  };

  for (const [tag, keywords] of Object.entries(tagKeywords)) {
    if (keywords.some(keyword => lowerText.includes(keyword))) {
      tags.push(tag);
    }
  }

  return tags;
}

// Extract character name from text (similar to Python implementation)
function extractCharacterName(text, fandom) {
  if (!text) return null;
  
  const lowerText = text.toLowerCase();
  
  // Character lists by fandom
  const characterLists = {
    'jjk': {
      characters: [
        'gojo satoru', 'sukuna', 'megumi fushiguro', 'yuji itadori', 'nobara kugisaki',
        'nanami', 'todo', 'yuta okkotsu', 'toji fushiguro', 'geto suguru', 'panda', 'toge inumaki',
        'maki zenin', 'yuki tsukumo', 'kenjaku', 'mahito', 'jogo', 'hanami', 'dagon'
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
        'yuki tsukumo': ['yuki', 'tsukumo', 'yuki tsukumo'],
        'kenjaku': ['kenjaku'],
        'mahito': ['mahito'],
        'jogo': ['jogo'],
        'hanami': ['hanami'],
        'dagon': ['dagon']
      }
    },
    'lads': {
      characters: [
        // Main characters
        'xavier', 'zayne', 'rafayel', 'caleb', 'sylus',
        // Supporting characters
        'aislinn', 'andrew', 'benedict', 'carter', 'dimitri', 'noah', 'gideon', 'greyson',
        'jenna', 'jeremiah', 'josephine', 'kevi', 'leon', 'luke', 'kieran', 'lumiere',
        'mephisto', 'nero', 'otto', 'philip', 'player', 'lucius', 'raymond', 'riley',
        'simone', 'soren', 'talia', 'tara', 'thomas', 'ulysses', 'viper', 'yvonne',
        // Chainsaw Man characters (kept for backward compatibility)
        'fakesaw man', 'pochita', 'denji', 'power', 'aki', 'makima', 'reze', 'kobeni'
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
        'yvonne': ['yvonne'],
        // Chainsaw Man aliases
        'fakesaw man': ['fakesaw', 'fakesaw man', 'fake saw'],
        'pochita': ['pochita', 'pochi'],
        'denji': ['denji'],
        'power': ['power'],
        'aki': ['aki'],
        'makima': ['makima'],
        'reze': ['reze'],
        'kobeni': ['kobeni']
      }
    }
  };
  
  // Determine fandom if not provided
  let detectedFandom = fandom;
  if (!detectedFandom) {
    // Check for "love and deep space" (with spaces)
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

// Basic face detection - check for face-related keywords
function containsFaceKeywords(text) {
  const faceKeywords = [
    'face', 'portrait', 'selfie', 'person', 'people', 'human',
    'character face', 'close-up face', 'headshot'
  ];

  const lowerText = text.toLowerCase();
  return faceKeywords.some(keyword => lowerText.includes(keyword));
}
