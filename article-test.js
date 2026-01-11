// Test script to fetch content directly from Substack article URLs

// Cloudflare Worker proxy URL (same as main script)
const CLOUDFLARE_PROXY_URL = 'https://substack-rss-proxy.daniellescoolemail.workers.dev';

// Copy of preprocessRSSContent from main script
function preprocessRSSContent(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') {
        return htmlContent;
    }
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Find and mark ALL footnote reference links
    const footnoteLinks = Array.from(doc.querySelectorAll('a.footnote-anchor[data-component-name="FootnoteAnchorToDOM"]'));
    const footnoteData = [];
    
    footnoteLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        const id = link.getAttribute('id') || '';
        const hrefMatch = href.match(/#footnote-?(\d+)/i);
        const idMatch = id.match(/footnote-anchor-?(\d+)/i);
        if (hrefMatch || idMatch) {
            const num = (hrefMatch && hrefMatch[1]) || (idMatch && idMatch[1]);
            const linkText = link.textContent.trim() || num;
            footnoteData.push({ link: link, num: num, text: linkText });
        }
    });
    
    // Replace footnote links with spans
    for (let i = footnoteData.length - 1; i >= 0; i--) {
        const {link, num, text} = footnoteData[i];
        const span = document.createElement('span');
        span.setAttribute('data-footnote-ref', num);
        span.classList.add('footnote-reference');
        span.textContent = text;
        if (link.parentNode) {
            link.parentNode.replaceChild(span, link);
        }
    }
    
    // Process footnote lists
    const footnoteSelectors = ['ol', 'ul', '[class*="footnote"]', '[class*="footnotes"]', '[id*="footnote"]', '[id*="footnotes"]'];
    const allLists = new Set();
    footnoteSelectors.forEach(selector => {
        doc.querySelectorAll(selector).forEach(el => {
            const items = el.querySelectorAll('li');
            if (items.length > 0) allLists.add(el);
        });
    });
    
    allLists.forEach(list => {
        const listItems = Array.from(list.querySelectorAll('li'));
        listItems.forEach((li, index) => {
            let footnoteNum = '';
            if (list.tagName === 'OL') {
                footnoteNum = (index + 1).toString();
            } else {
                const text = li.textContent || '';
                const numMatch = text.match(/^(\d+)\.?\s*/);
                footnoteNum = numMatch ? numMatch[1] : (index + 1).toString();
            }
            
            let footnoteText = li.textContent || '';
            footnoteText = footnoteText.replace(/^\d+\.?\s*/, '').trim();
            footnoteText = footnoteText.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
            
            li.innerHTML = '';
            const textNode = document.createTextNode(footnoteNum + '. ' + footnoteText);
            li.appendChild(textNode);
        });
    });
    
    // Remove <br> tags from list items
    doc.querySelectorAll('li').forEach(li => {
        li.querySelectorAll('br').forEach(br => br.remove());
        const text = li.textContent || '';
        const normalizedText = text.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
        if (normalizedText !== text) {
            li.textContent = normalizedText;
        }
    });
    
    return doc.body.innerHTML;
}

// Copy of cleanHTMLContent from main script (simplified version)
function cleanHTMLContent(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Flatten footnote lists
    doc.querySelectorAll('ol, ul').forEach(list => {
        const items = Array.from(list.querySelectorAll('li'));
        items.forEach((li, index) => {
            li.querySelectorAll('br').forEach(br => br.remove());
            let num = '';
            if (list.tagName === 'OL') {
                num = (index + 1).toString();
            } else {
                const text = li.textContent || '';
                const match = text.match(/^(\d+)\.?\s*/);
                num = match ? match[1] : (index + 1).toString();
            }
            let text = li.textContent || '';
            text = text.replace(/^\d+\.?\s*/, '').trim();
            text = text.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
            li.innerHTML = '';
            const textNode = document.createTextNode(num + '. ' + text);
            li.appendChild(textNode);
        });
    });
    
    html = doc.body.innerHTML;
    const doc2 = parser.parseFromString(html, 'text/html');
    
    // Remove unwanted elements
    const unwantedSelectors = [
        'script', 'style', 'iframe', 'noscript', 'button',
        '.subscribe-widget', '.subscribe-button', '.share-buttons',
        '[class*="subscribe"]', '[class*="share"]', '[class*="social"]',
        '[class*="button"]', '.button-wrapper', 'form', 'input', 'textarea', 'select'
    ];
    
    unwantedSelectors.forEach(selector => {
        doc2.querySelectorAll(selector).forEach(el => {
            if (el.tagName === 'A' && 
                el.classList.contains('footnote-anchor') &&
                el.getAttribute('data-component-name') === 'FootnoteAnchorToDOM') {
                return;
            }
            el.remove();
        });
    });
    
    // Handle links
    doc2.querySelectorAll('a').forEach(link => {
        const isFootnoteLink = link.classList.contains('footnote-anchor') &&
                              link.getAttribute('data-component-name') === 'FootnoteAnchorToDOM';
        
        if (isFootnoteLink) {
            const href = link.getAttribute('href') || '';
            const id = link.getAttribute('id') || '';
            const hrefMatch = href.match(/#footnote-?(\d+)/i);
            const idMatch = id.match(/footnote-anchor-?(\d+)/i);
            const num = (hrefMatch && hrefMatch[1]) || (idMatch && idMatch[1]) || link.textContent.trim();
            const linkText = link.textContent.trim() || num;
            
            const span = document.createElement('span');
            span.setAttribute('data-footnote-ref', num);
            span.classList.add('footnote-reference');
            span.textContent = linkText;
            link.parentNode.replaceChild(span, link);
            return;
        }
        
        const img = link.querySelector('img');
        if (img) {
            const imgClone = img.cloneNode(true);
            link.parentNode.replaceChild(imgClone, link);
        } else {
            const text = link.textContent;
            const textNode = document.createTextNode(text);
            link.parentNode.replaceChild(textNode, link);
        }
    });
    
    return doc2.body.innerHTML;
}

// Helper functions for newsletter generation
function formatHeaderDate(date) {
    const d = date || new Date();
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
    const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 
                    'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
    const dayName = days[d.getDay()];
    const monthName = months[d.getMonth()];
    const day = d.getDate();
    const year = d.getFullYear();
    return `${dayName}, ${monthName} ${day}, ${year}`;
}

function formatYear(date) {
    let d = date;
    if (typeof date === 'string') {
        d = new Date(date);
    }
    if (!d || isNaN(d.getTime())) {
        return new Date().getFullYear();
    }
    return d.getFullYear();
}

function findMainImage(doc) {
    // Strategy 1: Look for images with specific classes/attributes that indicate featured image
    const featuredSelectors = [
        '.featured-image img',
        '.hero-image img',
        '.main-image img',
        '.post-image img',
        'img[class*="featured"]',
        'img[class*="hero"]',
        '[class*="featured"] img',
        '[class*="hero"] img'
    ];
    
    for (const selector of featuredSelectors) {
        const img = doc.querySelector(selector);
        if (img) {
            return img;
        }
    }
    
    // Strategy 2: Look for images with data-featured attribute
    const dataFeatured = doc.querySelector('img[data-featured], img[data-main], img[data-hero]');
    if (dataFeatured) {
        return dataFeatured;
    }
    
    // Strategy 3: Look for the first image in a figure tag (often the featured image)
    const firstFigureImg = doc.querySelector('figure img');
    if (firstFigureImg) {
        return firstFigureImg;
    }
    
    // Strategy 4: Fall back to first image in the document
    return doc.querySelector('img');
}

// Simplified newsletter generation for single article
function generateNewsletterForArticle(publication, article) {
    const modeClass = ''; // Default to normal mode for test
    const now = new Date();
    const pstFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    });
    const parts = pstFormatter.formatToParts(now);
    const year = parseInt(parts.find(p => p.type === 'year').value);
    const month = parseInt(parts.find(p => p.type === 'month').value) - 1;
    const day = parseInt(parts.find(p => p.type === 'day').value);
    const pstDate = new Date(year, month, day);
    
    const headerDate = formatHeaderDate(pstDate);
    const establishedYear = publication.establishedDate ? formatYear(publication.establishedDate) : new Date().getFullYear();
    
    // Process article content
    const cleanContent = cleanHTMLContent(article.content);
    const parser = new DOMParser();
    const contentDoc = parser.parseFromString(cleanContent, 'text/html');
    const mainImage = findMainImage(contentDoc);
    let imageHTML = '';
    let imageCaption = '';
    
    if (mainImage) {
        const imgSrc = mainImage.getAttribute('src') || mainImage.getAttribute('data-src') || '';
        const parentFigure = mainImage.closest('figure');
        const figcaption = parentFigure ? parentFigure.querySelector('figcaption, .image-caption') : contentDoc.querySelector('figcaption, .image-caption');
        imageCaption = figcaption ? figcaption.textContent : '';
        mainImage.remove();
        if (figcaption) figcaption.remove();
        if (parentFigure && parentFigure.children.length === 0) {
            parentFigure.remove();
        }
        
        imageHTML = `
            <div class="featured-image">
                <img src="${imgSrc}" alt="${article.title}">
                ${imageCaption ? `<div class="image-caption">${imageCaption}</div>` : ''}
            </div>
        `;
    }
    
    // Extract subtitle
    let subtitle = '';
    const subtitleEl = contentDoc.querySelector('h3, h4, .subtitle, [class*="subtitle"]');
    if (subtitleEl) {
        subtitle = subtitleEl.textContent.trim();
        subtitleEl.remove();
    }
    
    // Get all content elements
    const allElements = Array.from(contentDoc.body.children);
    const articleContent = allElements.map(el => el.outerHTML).join('');
    
    let html = `
        <div class="newsletter-page${modeClass}">
            <div class="newsletter-masthead">
                <div class="masthead-top-url"><img src="logo.png" alt="Substack Print Logo"></div>
                <div class="masthead-title">${publication.title || 'SUBSCRIPTION'}</div>
                <div class="masthead-tagline">${publication.description || ''}</div>
                <div class="masthead-divider"></div>
                <div class="masthead-info-row">
                    <span class="volume">VOL. LXXVI</span>
                    <span class="date">${headerDate}</span>
                    <span class="established">EST. ${establishedYear}</span>
                </div>
                <div class="masthead-divider"></div>
            </div>
            <div class="newsletter-content">
                <div class="article-featured">
                    <div class="article-columns">
                        <div class="article-col-left">
                            <!-- Left column would have other articles in full version -->
                        </div>
                        <div class="article-col-right">
                            ${imageHTML}
                            <h2 class="article-title">${article.title}</h2>
                            ${subtitle ? `<div class="article-description">${subtitle}</div>` : ''}
                            <div class="article-title-bar-front"></div>
                            <div class="article-content-right">${articleContent}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    return html;
}

// Helper function to normalize URL
function normalizeURL(url) {
    if (!url) return '';
    url = url.trim();
    // Remove protocol if present
    url = url.replace(/^https?:\/\//, '');
    // Remove trailing slash
    url = url.replace(/\/$/, '');
    return url;
}

// Helper function to fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 10000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

// Fetch article via Cloudflare Worker proxy
async function fetchArticleViaProxy(url) {
    try {
        const proxyUrl = `${CLOUDFLARE_PROXY_URL}?url=${encodeURIComponent(url)}`;
        console.log('Fetching via Cloudflare Worker:', proxyUrl);
        const response = await fetchWithTimeout(proxyUrl, {}, 10000);
        if (!response.ok) {
            throw new Error(`Proxy fetch failed: ${response.status} ${response.statusText}`);
        }
        const text = await response.text();
        if (!text || text.length === 0) {
            throw new Error('Proxy returned empty response');
        }
        return text;
    } catch (error) {
        console.error('Cloudflare Worker proxy error:', error);
        throw error;
    }
}

// Fetch article via allorigins.win proxy (fallback)
async function fetchArticleViaAllOrigins(url) {
    try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        console.log('Fetching via allorigins:', proxyUrl);
        const response = await fetchWithTimeout(proxyUrl, {}, 10000);
        if (!response.ok) {
            throw new Error(`AllOrigins fetch failed: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        // allorigins wraps the content in JSON
        const content = data.contents || data.content || '';
        if (!content || content.length === 0) {
            throw new Error('AllOrigins returned empty content');
        }
        return content;
    } catch (error) {
        console.error('AllOrigins proxy error:', error);
        throw error;
    }
}

// Extract JSON data from the HTML page
function extractJSONData(html) {
    try {
        // Find the script tag containing window._preloads
        const scriptMatch = html.match(/<script[^>]*>([\s\S]*?window\._preloads[\s\S]*?)<\/script>/);
        if (!scriptMatch) {
            console.error('Could not find script tag with window._preloads');
            return null;
        }
        
        const scriptContent = scriptMatch[1];
        console.log('Found script content, length:', scriptContent.length);
        
        // Method 1: Try to find JSON.parse with template literal (backticks) - easiest case
        const templateLiteralMatch = scriptContent.match(/window\._preloads\s*=\s*JSON\.parse\(`([\s\S]*?)`\)/);
        if (templateLiteralMatch && templateLiteralMatch[1]) {
            try {
                console.log('Trying template literal method, JSON length:', templateLiteralMatch[1].length);
                return JSON.parse(templateLiteralMatch[1]);
            } catch (e) {
                console.log('Template literal method failed:', e.message);
            }
        }
        
        // Method 2: Find JSON.parse( and extract the argument by matching quotes properly
        // This handles escaped quotes within the JSON string
        const jsonParseMatch = scriptContent.match(/window\._preloads\s*=\s*JSON\.parse\(/);
        if (jsonParseMatch) {
            const startPos = jsonParseMatch.index + jsonParseMatch[0].length;
            const remaining = scriptContent.substring(startPos);
            
            // Determine quote type (single, double, or backtick)
            let quoteChar = null;
            let quotePos = -1;
            
            // Check for backtick first (no escaping needed)
            const backtickPos = remaining.indexOf('`');
            if (backtickPos !== -1 && (quotePos === -1 || backtickPos < quotePos)) {
                quoteChar = '`';
                quotePos = backtickPos;
            }
            
            // Check for double quote
            const doubleQuotePos = remaining.indexOf('"');
            if (doubleQuotePos !== -1 && (quotePos === -1 || doubleQuotePos < quotePos)) {
                quoteChar = '"';
                quotePos = doubleQuotePos;
            }
            
            // Check for single quote
            const singleQuotePos = remaining.indexOf("'");
            if (singleQuotePos !== -1 && (quotePos === -1 || singleQuotePos < quotePos)) {
                quoteChar = "'";
                quotePos = singleQuotePos;
            }
            
            if (quoteChar && quotePos !== -1) {
                // Extract the string content, handling escaped quotes
                let jsonString = '';
                let i = quotePos + 1; // Start after opening quote
                let escaped = false;
                
                while (i < remaining.length) {
                    const char = remaining[i];
                    
                    if (escaped) {
                        jsonString += char;
                        escaped = false;
                    } else if (char === '\\') {
                        jsonString += char;
                        escaped = true;
                    } else if (char === quoteChar) {
                        // Found closing quote
                        break;
                    } else {
                        jsonString += char;
                    }
                    i++;
                }
                
                if (jsonString.length > 0) {
                    try {
                        console.log('Extracted JSON string, length:', jsonString.length);
                        
                        // Unescape the string if needed (for single/double quotes, not backticks)
                        if (quoteChar !== '`') {
                            jsonString = jsonString
                                .replace(/\\"/g, '"')
                                .replace(/\\'/g, "'")
                                .replace(/\\n/g, '\n')
                                .replace(/\\t/g, '\t')
                                .replace(/\\r/g, '\r')
                                .replace(/\\\\/g, '\\');
                        }
                        
                        return JSON.parse(jsonString);
                    } catch (e) {
                        console.log('Failed to parse extracted JSON string:', e.message);
                        console.log('First 500 chars:', jsonString.substring(0, 500));
                        console.log('Last 500 chars:', jsonString.substring(Math.max(0, jsonString.length - 500)));
                    }
                }
            }
        }
        
        // Method 3: Find JSON.parse( and manually extract by tracking quote depth
        // This handles very large JSON strings with complex escaping
        const jsonParseIndex = scriptContent.indexOf('JSON.parse(');
        if (jsonParseIndex !== -1) {
            let pos = jsonParseIndex + 'JSON.parse('.length;
            let quoteChar = null;
            let depth = 0;
            let inString = false;
            let escaped = false;
            let jsonStart = -1;
            let jsonEnd = -1;
            
            // Skip whitespace
            while (pos < scriptContent.length && /\s/.test(scriptContent[pos])) {
                pos++;
            }
            
            // Find opening quote
            if (scriptContent[pos] === '"' || scriptContent[pos] === "'" || scriptContent[pos] === '`') {
                quoteChar = scriptContent[pos];
                jsonStart = pos + 1;
                inString = true;
                pos++;
                
                // Find closing quote, handling escapes
                while (pos < scriptContent.length) {
                    const char = scriptContent[pos];
                    
                    if (escaped) {
                        escaped = false;
                    } else if (char === '\\') {
                        escaped = true;
                    } else if (char === quoteChar) {
                        jsonEnd = pos;
                        break;
                    }
                    pos++;
                }
                
                if (jsonStart !== -1 && jsonEnd !== -1) {
                    let jsonStr = scriptContent.substring(jsonStart, jsonEnd);
                    
                    // Unescape if needed (not for backticks)
                    if (quoteChar !== '`') {
                        jsonStr = jsonStr
                            .replace(/\\"/g, '"')
                            .replace(/\\'/g, "'")
                            .replace(/\\n/g, '\n')
                            .replace(/\\t/g, '\t')
                            .replace(/\\r/g, '\r')
                            .replace(/\\\\/g, '\\');
                    }
                    
                    try {
                        console.log('Trying manual extraction method, JSON length:', jsonStr.length);
                        return JSON.parse(jsonStr);
                    } catch (e) {
                        console.log('Manual extraction method failed:', e.message);
                        // Show where it failed
                        if (e.message.includes('position')) {
                            const match = e.message.match(/position (\d+)/);
                            if (match) {
                                const failPos = parseInt(match[1]);
                                console.log('Failed at position:', failPos);
                                console.log('Context around failure:', jsonStr.substring(Math.max(0, failPos - 50), Math.min(jsonStr.length, failPos + 50)));
                            }
                        }
                    }
                }
            }
        }
        
        console.error('Could not extract JSON data using any method');
        return null;
    } catch (error) {
        console.error('Error extracting JSON data:', error);
        return null;
    }
}

// Extract article data directly from HTML DOM
function extractArticleDataFromHTML(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // Try to find the article content in the body markup div
        const bodyMarkup = doc.querySelector('.body.markup, .body-markup, [class*="body"][class*="markup"]');
        if (bodyMarkup) {
            const title = doc.querySelector('title')?.textContent || 
                         doc.querySelector('h1')?.textContent || 
                         doc.querySelector('[class*="title"]')?.textContent || 
                         'No title found';
            
            return {
                title: title,
                body_html: bodyMarkup.innerHTML,
                body_text: bodyMarkup.textContent || bodyMarkup.innerText,
                extracted_from: 'HTML DOM'
            };
        }
        
        // Try alternative selectors
        const altSelectors = [
            '.post-content',
            '.article-content',
            '.entry-content',
            '[class*="post"][class*="content"]',
            '[class*="article"][class*="body"]',
            'article',
            'main'
        ];
        
        for (const selector of altSelectors) {
            const element = doc.querySelector(selector);
            if (element) {
                const title = doc.querySelector('title')?.textContent || 'No title found';
                return {
                    title: title,
                    body_html: element.innerHTML,
                    body_text: element.textContent || element.innerText,
                    extracted_from: `HTML DOM (${selector})`
                };
            }
        }
        
        return null;
    } catch (error) {
        console.error('Error extracting from HTML DOM:', error);
        return null;
    }
}

// Extract article data from JSON
function extractArticleDataFromJSON(jsonData) {
    if (!jsonData || !jsonData.post) {
        return null;
    }
    
    const post = jsonData.post;
    return {
        title: post.title || 'No title',
        body_html: post.body_html || '',
        body_text: post.body_text || '',
        published_at: post.published_at || '',
        author: post.publishedBylines?.[0]?.name || 'Unknown',
        publication: jsonData.pub?.name || 'Unknown',
        extracted_from: 'JSON data'
    };
}


// Main function to process article URL
async function processArticleURL(url) {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const resultEl = document.getElementById('result');
    const articleTitleEl = document.getElementById('article-title');
    const articleBodyRawEl = document.getElementById('article-body-raw');
    const articleBodyPreviewEl = document.getElementById('article-body-preview');
    const jsonDataEl = document.getElementById('json-data');
    
    // Show loading, hide error and result
    loadingEl.classList.remove('hidden');
    loadingEl.textContent = 'Fetching article...';
    errorEl.classList.add('hidden');
    resultEl.classList.add('hidden');
    
    try {
        // Normalize URL
        const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
        
        // Try to fetch article HTML via proxy first, then fallback to allorigins
        loadingEl.textContent = 'Fetching article HTML via Cloudflare Worker proxy...';
        let html = null;
        let fetchMethod = 'Cloudflare Worker';
        
        try {
            html = await fetchArticleViaProxy(normalizedUrl);
        } catch (proxyError) {
            console.log('Cloudflare Worker proxy failed, trying allorigins fallback...', proxyError);
            loadingEl.textContent = 'Cloudflare Worker failed, trying allorigins proxy...';
            try {
                html = await fetchArticleViaAllOrigins(normalizedUrl);
                fetchMethod = 'allorigins';
            } catch (alloriginsError) {
                throw new Error(`Both proxy methods failed. Cloudflare Worker error: ${proxyError.message}. AllOrigins error: ${alloriginsError.message}. Note: Direct fetch is not possible due to CORS restrictions.`);
            }
        }
        
        if (!html || html.length === 0) {
            throw new Error('Failed to fetch article HTML (empty response)');
        }
        
        loadingEl.textContent = `Extracting article data (fetched via ${fetchMethod})...`;
        
        // Try extracting from HTML DOM first (more reliable)
        let articleData = extractArticleDataFromHTML(html);
        let extractionMethod = 'HTML DOM';
        
        // If HTML extraction failed, try JSON extraction
        if (!articleData) {
            console.log('HTML DOM extraction failed, trying JSON extraction...');
            loadingEl.textContent = `Extracting from JSON data (fetched via ${fetchMethod})...`;
            
            const jsonData = extractJSONData(html);
            
            if (jsonData) {
                articleData = extractArticleDataFromJSON(jsonData);
                extractionMethod = 'JSON';
            }
        }
        
        if (!articleData) {
            // Show the HTML we got for debugging
            console.log('HTML sample:', html.substring(0, 2000));
            console.log('Trying to find body markup in HTML...');
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const bodyMarkup = doc.querySelector('.body.markup, .body-markup');
            console.log('Found body markup?', bodyMarkup !== null);
            if (bodyMarkup) {
                console.log('Body markup HTML length:', bodyMarkup.innerHTML.length);
            }
            
            throw new Error('Could not find article data in page. Tried both HTML DOM extraction and JSON extraction. Check console for details.');
        }
        
        console.log(`Successfully extracted article data using: ${extractionMethod}`);
        
        // Process the HTML through the same functions as RSS feed
        loadingEl.textContent = 'Processing content (matching RSS feed format)...';
        
        let processedContent = articleData.body_html || '';
        
        // Step 1: Preprocess (handle footnotes)
        console.log('Step 1: Preprocessing RSS content...');
        processedContent = preprocessRSSContent(processedContent);
        
        // Step 2: Clean HTML (remove unwanted elements, handle links)
        console.log('Step 2: Cleaning HTML content...');
        processedContent = cleanHTMLContent(processedContent);
        
        // Format to match RSS feed structure
        const rssFormattedArticle = {
            title: articleData.title || 'No title',
            content: processedContent,
            isFeatured: true // First article is always featured
        };
        
        console.log('Formatted article (RSS format):', {
            title: rssFormattedArticle.title,
            contentLength: rssFormattedArticle.content.length,
            isFeatured: rssFormattedArticle.isFeatured
        });
        
        // Display results
        articleTitleEl.textContent = `${rssFormattedArticle.title} (RSS Format - extracted via ${articleData.extracted_from || extractionMethod})`;
        
        // Show processed HTML (RSS format) - truncated if too long
        const processedHTML = rssFormattedArticle.content || 'No content found';
        articleBodyRawEl.textContent = processedHTML.length > 5000 
            ? processedHTML.substring(0, 5000) + '\n\n... (truncated, total length: ' + processedHTML.length + ' characters)'
            : processedHTML;
        
        // Show preview (rendered processed HTML)
        articleBodyPreviewEl.innerHTML = processedHTML || '<p>No content to display</p>';
        
        // Show RSS format structure and metadata
        let metadataText = `=== RSS FORMAT STRUCTURE ===\n\n`;
        metadataText += `Article Object:\n`;
        metadataText += `{\n`;
        metadataText += `  title: "${rssFormattedArticle.title}",\n`;
        metadataText += `  content: "${processedHTML.substring(0, 100)}...", // (${processedHTML.length} chars total)\n`;
        metadataText += `  isFeatured: ${rssFormattedArticle.isFeatured}\n`;
        metadataText += `}\n\n`;
        metadataText += `=== METADATA ===\n\n`;
        metadataText += `Extraction Method: ${articleData.extracted_from || extractionMethod}\n`;
        if (articleData.author) metadataText += `Author: ${articleData.author}\n`;
        if (articleData.publication) metadataText += `Publication: ${articleData.publication}\n`;
        if (articleData.published_at) metadataText += `Published: ${articleData.published_at}\n`;
        metadataText += `\nProcessing Steps:\n`;
        metadataText += `1. Extracted HTML from DOM: ${(articleData.body_html || '').length} chars\n`;
        metadataText += `2. Preprocessed (footnotes): ${processedHTML.length} chars\n`;
        metadataText += `3. Cleaned (removed unwanted elements): ${processedHTML.length} chars\n`;
        metadataText += `\nFinal Content Length: ${processedHTML.length} characters\n`;
        
        // Try to extract and show JSON data if available
        const jsonData = extractJSONData(html);
        if (jsonData) {
            const jsonString = JSON.stringify(jsonData, null, 2);
            jsonDataEl.textContent = metadataText + '\n\n--- Original JSON Data (for reference) ---\n\n' + 
                (jsonString.length > 5000 
                    ? jsonString.substring(0, 5000) + '\n\n... (truncated, total length: ' + jsonString.length + ' characters)'
                    : jsonString);
        } else {
            jsonDataEl.textContent = metadataText + '\n\n--- Original JSON Data ---\n\nCould not extract JSON data from page.';
        }
        
        // Generate and display newsletter format
        loadingEl.textContent = 'Generating newspaper format...';
        
        const publication = {
            title: articleData.publication || 'SUBSCRIPTION',
            description: articleData.publication ? '' : 'Test Publication',
            establishedDate: articleData.published_at ? new Date(articleData.published_at) : null
        };
        
        const rssFormattedArticleForNewsletter = {
            title: rssFormattedArticle.title,
            content: processedHTML,
            isFeatured: true
        };
        
        const newsletterHTML = generateNewsletterForArticle(publication, rssFormattedArticleForNewsletter);
        
        const newsletterContainer = document.getElementById('newsletter-container-test');
        const newsletterPreview = document.getElementById('newsletter-preview');
        
        if (newsletterContainer && newsletterPreview) {
            newsletterPreview.innerHTML = newsletterHTML;
            newsletterContainer.classList.remove('hidden');
        }
        
        loadingEl.classList.add('hidden');
        
        // Show results
        loadingEl.classList.add('hidden');
        resultEl.classList.remove('hidden');
        
        console.log('Successfully extracted article data:', {
            title: articleData.title,
            bodyLength: articleData.body_html?.length || 0,
            publication: articleData.publication,
            author: articleData.author
        });
        
    } catch (error) {
        console.error('Error processing article URL:', error);
        loadingEl.classList.add('hidden');
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.classList.remove('hidden');
    }
}

// Form submission handler
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('article-form');
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const url = document.getElementById('article-url').value.trim();
        
        if (url) {
            processArticleURL(url);
        }
    });
});

