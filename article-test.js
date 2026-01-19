// Test script to fetch content directly from Substack article URLs

// Cloudflare Worker proxy URL (same as main script)
const CLOUDFLARE_PROXY_URL = 'https://substack-rss-proxy.daniellescoolemail.workers.dev';

// Copy of preprocessRSSContent from main script (with articleIndex support)
function preprocessRSSContent(htmlContent, articleIndex = null) {
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
    // IMPORTANT: Do NOT touch normal article lists (<ul>/<ol> in the body).
    const footnoteListSelectors = [
        'ol.footnotes-list',
        'ul.footnotes-list',
        '[class*="footnote"] ol',
        '[class*="footnote"] ul',
        '[class*="footnotes"] ol',
        '[class*="footnotes"] ul',
        '[id*="footnote"] ol',
        '[id*="footnote"] ul',
        '[id*="footnotes"] ol',
        '[id*="footnotes"] ul'
    ];
    const allLists = new Set(Array.from(doc.querySelectorAll(footnoteListSelectors.join(','))));
    
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
    // NOTE: Don't flatten normal lists here (bullet/numbered lists in the article body).
    // Footnotes are already normalized in preprocessRSSContent().
    
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

    // Remove Substack video embeds (they often leave a blank fixed-height wrapper in print)
    const videoPlayers = Array.from(doc2.querySelectorAll('[data-component-name="VideoEmbedPlayer"]'));
    if (videoPlayers.length > 0) {
        const isEffectivelyEmpty = (el) => {
            if (!el) return false;
            // Consider an element "empty" if it has no non-whitespace text and no meaningful media/content nodes.
            const text = (el.textContent || '').replace(/\s+/g, '').trim();
            if (text.length > 0) return false;
            // If it has any element children (besides trivial breaks), treat as non-empty.
            const meaningfulChild = el.querySelector('img, picture, svg, video, audio, source, iframe, embed, object, table, ul, ol, blockquote, pre, h1, h2, h3, h4, h5, h6');
            return !meaningfulChild;
        };

        const removeEmptyParents = (startEl) => {
            let current = startEl;
            while (current && current !== doc2.body) {
                // Only prune common block wrappers to avoid accidentally removing structure.
                const tag = (current.tagName || '').toUpperCase();
                if (!['DIV', 'P', 'FIGURE', 'SECTION', 'ARTICLE'].includes(tag)) break;
                if (!isEffectivelyEmpty(current)) break;
                const parent = current.parentElement;
                current.remove();
                current = parent;
            }
        };

        videoPlayers.forEach(player => {
            if (!player || !player.parentElement) return;

            // Prefer removing a dedicated wrapper (figure/component wrapper) if it contains nothing else.
            const wrapperCandidates = [
                player.closest('figure'),
                player.closest('[data-component-name="VideoEmbed"]'),
                player.closest('[data-component-name="VideoEmbedWithCaption"]'),
                player.closest('[data-component-name="Embed"]'),
            ].filter(Boolean);

            let removed = false;
            for (const wrapper of wrapperCandidates) {
                if (!wrapper || wrapper === doc2.body) continue;
                const clone = wrapper.cloneNode(true);
                clone.querySelectorAll('[data-component-name="VideoEmbedPlayer"]').forEach(el => el.remove());
                if (isEffectivelyEmpty(clone)) {
                    const parent = wrapper.parentElement;
                    wrapper.remove();
                    removeEmptyParents(parent);
                    removed = true;
                    break;
                }
            }

            if (!removed) {
                const parent = player.parentElement;
                player.remove();
                removeEmptyParents(parent);
            }
        });
    }
    
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

// Generate full newsletter with all articles and pages (same as main script)
function generateNewsletterForTest(publication, articles) {
    const modeClass = ''; // Default to normal mode for test
    // Get current date in PST/PDT timezone
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
    
    let html = `
        <div class="newsletter-page front-page${modeClass}">
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
    `;
    
    // Article 1 (most recent) goes on right side, Articles 2-3 on left side
    if (articles.length >= 1) {
        const article1 = articles[0];
        const article2 = articles[1] || null;
        const article3 = articles[2] || null;
        
        // Process Article 1 (right side)
        const parser = new DOMParser();
        const contentDoc1 = parser.parseFromString(article1.content, 'text/html');
        const mainImage = findMainImage(contentDoc1);
        let imageHTML = '';
        
        if (mainImage) {
            const imgSrc = mainImage.getAttribute('src') || mainImage.getAttribute('data-src') || '';
            const parentFigure = mainImage.closest('figure');
            const figcaption = parentFigure ? parentFigure.querySelector('figcaption, .image-caption') : contentDoc1.querySelector('figcaption, .image-caption');
            const imageCaption = figcaption ? figcaption.textContent : '';
            mainImage.remove();
            if (figcaption) figcaption.remove();
            if (parentFigure && parentFigure.children.length === 0) {
                parentFigure.remove();
            }
            
            imageHTML = `
                <div class="featured-image">
                    <img src="${imgSrc}" alt="${article1.title}">
                    ${imageCaption ? `<div class="image-caption">${imageCaption}</div>` : ''}
                </div>
            `;
        }
        
        const allElements1 = Array.from(contentDoc1.body.children);
        const article1ContentPage1 = allElements1.map(el => el.outerHTML).join('');
        
        let article2Page = 2;
        let article3Page = 3;
        
        html += `
            <div class="article-featured">
                <div class="article-columns">
                    <div class="article-col-left">
        `;
        
        // Article 2 section (top)
        if (article2) {
            const contentDoc2 = parser.parseFromString(article2.content, 'text/html');
            const paragraphs2 = Array.from(contentDoc2.querySelectorAll('p'));
            const allParagraphs2 = paragraphs2.map(p => p.outerHTML).join('');
            const snippet2 = paragraphs2.slice(0, Math.min(2, paragraphs2.length))
                .map(p => p.outerHTML).join('');
            
            html += `
                        <div class="article-section" data-full-content="${allParagraphs2.replace(/"/g, '&quot;')}">
                            <h2 class="article-title">${article2.title}</h2>
                            <div class="article-title-bar-front"></div>
                            <div class="article-snippet">${snippet2}</div>
                            <div class="article-continued">See Page ${article2Page}</div>
                        </div>
            `;
        }
        
        // Article 3 section (middle) - includes first image
        if (article3) {
            const contentDoc3 = parser.parseFromString(article3.content, 'text/html');
            const mainImage3 = findMainImage(contentDoc3);
            let imageHTML3 = '';
            
            if (mainImage3) {
                const imgSrc3 = mainImage3.getAttribute('src') || mainImage3.getAttribute('data-src') || '';
                const parentFigure3 = mainImage3.closest('figure');
                const figcaption3 = parentFigure3 ? parentFigure3.querySelector('figcaption, .image-caption') : contentDoc3.querySelector('figcaption, .image-caption');
                const imageCaption3 = figcaption3 ? figcaption3.textContent : '';
                mainImage3.remove();
                if (figcaption3) figcaption3.remove();
                if (parentFigure3 && parentFigure3.children.length === 0) {
                    parentFigure3.remove();
                }
                
                imageHTML3 = `
                    <div class="article-image">
                        <img src="${imgSrc3}" alt="${article3.title}">
                        ${imageCaption3 ? `<div class="image-caption">${imageCaption3}</div>` : ''}
                    </div>
                `;
            }
            
            const paragraphs3 = Array.from(contentDoc3.querySelectorAll('p'));
            const allParagraphs3 = paragraphs3.map(p => p.outerHTML).join('');
            const snippet3 = paragraphs3.slice(0, Math.min(2, paragraphs3.length))
                .map(p => p.outerHTML).join('');
            
            html += `
                        <div class="article-section" data-full-content="${allParagraphs3.replace(/"/g, '&quot;')}">
                            <h2 class="article-title">${article3.title}</h2>
                            <div class="article-title-bar-front"></div>
                            ${imageHTML3}
                            <div class="article-snippet">${snippet3}</div>
                            <div class="article-continued">See Page ${article3Page}</div>
                        </div>
            `;
        }
        
        html += `
                    </div>
                    <div class="article-col-right">
                        ${imageHTML}
                        <h2 class="article-title">${article1.title}</h2>
                        <div class="article-title-bar-front"></div>
                        <div class="article-content-right">${article1ContentPage1}</div>
                        ${article1ContentPage1.trim().length > 0 ? '<div class="article-continued">Continued on Page 2</div>' : ''}
                    </div>
                </div>
            </div>
        `;
    }
    
    html += `
            </div>
        </div>
    `;
    
    // Create additional pages with all remaining articles
    if (articles.length > 1) {
        let allContent = '';
        
        // Add all remaining articles (articles 2, 3, etc.)
        for (let i = 1; i < articles.length; i++) {
            const article = articles[i];
            allContent += `<h2 class="article-title">${article.title}</h2>`;
            allContent += '<div class="article-title-bar"></div>';
            allContent += article.content;
        }
        
        // Put all content in a single page - CSS columns will handle natural flow
        // Pages will be created dynamically after rendering if content overflows
        html += `
            <div class="newsletter-page${modeClass}">
                <div class="newsletter-content">
                    <div class="article-columns-three-css">
                        ${allContent}
                    </div>
                </div>
            </div>
        `;
    }
    
    return html;
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


// Main function to process multiple article URLs (comma-separated)
async function processArticleURLs(urlsString) {
    // Parse comma-separated URLs
    const urlStrings = urlsString.split(/[\n,]+/)
        .map(url => url.trim())
        .filter(url => url.length > 0);
    
    if (urlStrings.length === 0) {
        throw new Error('No valid URLs provided');
    }
    
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const newsletterContainer = document.getElementById('newsletter-container-test');
    
    loadingEl.classList.remove('hidden');
    loadingEl.textContent = `Fetching ${urlStrings.length} article(s)...`;
    errorEl.classList.add('hidden');
    if (newsletterContainer) newsletterContainer.classList.add('hidden');
    
    try {
        // Fetch all articles in parallel - pass articleIndex (0, 1, 2) like main script
        const articlePromises = urlStrings.map((url, index) => 
            fetchSingleArticle(url, index) // articleIndex: 0, 1, 2 (same as main script)
        );
        
        const articles = await Promise.all(articlePromises);
        
        // Process all articles and generate newsletter (using same format as main script)
        await processMultipleArticles(articles);
        
    } catch (error) {
        console.error('Error processing article URLs:', error);
        loadingEl.classList.add('hidden');
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.classList.remove('hidden');
    }
}

// Fetch a single article and return it in RSS format (same structure as main script)
// Returns: { title, content, isFeatured, articleData }
async function fetchSingleArticle(url, articleIndex) {
    
    try {
        // Normalize URL
        const normalizedUrl = url.startsWith('http') ? url : `https://${url}`;
        
        // Try to fetch article HTML via proxy first, then fallback to allorigins
        let html = null;
        let fetchMethod = 'Cloudflare Worker';
        
        try {
            html = await fetchArticleViaProxy(normalizedUrl);
        } catch (proxyError) {
            console.log('Cloudflare Worker proxy failed, trying allorigins fallback...', proxyError);
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
        
        // Try extracting from HTML DOM first (more reliable)
        let articleData = extractArticleDataFromHTML(html);
        let extractionMethod = 'HTML DOM';
        
        // If HTML extraction failed, try JSON extraction
        if (!articleData) {
            console.log('HTML DOM extraction failed, trying JSON extraction...');
            
            const jsonData = extractJSONData(html);
            
            if (jsonData) {
                articleData = extractArticleDataFromJSON(jsonData);
                extractionMethod = 'JSON';
            }
        }
        
        if (!articleData) {
            throw new Error('Could not find article data in page. Tried both HTML DOM extraction and JSON extraction.');
        }
        
        console.log(`Successfully extracted article ${articleIndex + 1} data using: ${extractionMethod}`);
        
        // Process the HTML through the same functions as RSS feed
        let processedContent = articleData.body_html || '';
        
        // Step 1: Preprocess (handle footnotes) - pass articleIndex to mark footnotes
        processedContent = preprocessRSSContent(processedContent, articleIndex);
        
        // Step 2: Clean HTML (remove unwanted elements, handle links)
        processedContent = cleanHTMLContent(processedContent);
        
        // Return article in RSS format structure (same as main script)
        return {
            title: articleData.title || 'No title',
            content: processedContent,
            isFeatured: articleIndex === 0, // First article (index 0) is featured
            articleData: articleData,
            articleIndex: articleIndex
        };
        
    } catch (error) {
        console.error(`Error fetching article ${articleIndex + 1}:`, error);
        throw error;
    }
}

// Process multiple articles and display results + generate newsletter
async function processMultipleArticles(articles) {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    
    try {
        if (!articles || articles.length === 0) {
            throw new Error('No articles to process');
        }
        
        loadingEl.textContent = 'Processing articles and generating newsletter format...';
        
        const firstArticle = articles[0];
        
        // Generate newsletter format using same structure as main script
        // Get publication info from first article
        const publication = {
            title: firstArticle.articleData?.publication || 'SUBSCRIPTION',
            description: '',
            establishedDate: firstArticle.articleData?.published_at ? new Date(firstArticle.articleData.published_at) : null
        };
        
        // Generate full newsletter with all articles and pages (same as main script)
        const newsletterHTML = generateNewsletterForTest(publication, articles);
        
        const newsletterContainer = document.getElementById('newsletter-container-test');
        const newsletterPreview = document.getElementById('newsletter-preview');
        
        if (newsletterContainer && newsletterPreview) {
            newsletterPreview.innerHTML = newsletterHTML;
            newsletterContainer.classList.remove('hidden');
            
            // Trim Article 1 to fit on front page, then split pages (same as main script)
            setTimeout(() => {
                try {
                    trimArticle1ToFitForTest(newsletterPreview);
                } catch (e) {
                    console.error('Error in trimArticle1ToFitForTest:', e);
                }
                
                // Split pages dynamically after trimming Article 1
                setTimeout(() => {
                    splitPagesDynamicallyForTest(newsletterPreview);
                }, 100);
            }, 100);
        }
        
        loadingEl.classList.add('hidden');
        
    } catch (error) {
        console.error('Error processing multiple articles:', error);
        loadingEl.classList.add('hidden');
        errorEl.textContent = `Error: ${error.message}`;
        errorEl.classList.remove('hidden');
    }
}

// Trim Article 1 to fit on front page (matches main script's trimArticle1ToFit)
function trimArticle1ToFitForTest(container) {
    try {
        const firstPage = container.querySelector('.newsletter-page');
        if (!firstPage) {
            console.log('trimArticle1ToFitForTest: No first page found');
            return;
        }
        
        const article1Content = firstPage.querySelector('.article-col-right .article-content-right');
        if (!article1Content) {
            console.log('trimArticle1ToFitForTest: No article-content-right found');
            return;
        }
        
        const articleColRight = firstPage.querySelector('.article-col-right');
        if (!articleColRight) {
            console.log('trimArticle1ToFitForTest: No article-col-right found');
            return;
        }
        
        // Get max height available
        const pagePadding = parseFloat(getComputedStyle(firstPage).paddingTop) + parseFloat(getComputedStyle(firstPage).paddingBottom);
        const masthead = firstPage.querySelector('.newsletter-masthead');
        const mastheadHeight = masthead ? masthead.offsetHeight : 0;
        
        const pageHeight = parseFloat(getComputedStyle(firstPage).height);
        const maxContentHeight = pageHeight - pagePadding - mastheadHeight;
        
        articleColRight.offsetHeight;
        
        // Calculate used height for fixed elements
        const image = articleColRight.querySelector('.featured-image');
        const title = articleColRight.querySelector('.article-title');
        const titleBar = articleColRight.querySelector('.article-title-bar-front');
        const continued = articleColRight.querySelector('.article-continued');
        
        let usedHeight = 0;
        if (image) {
            const imgStyle = getComputedStyle(image);
            usedHeight += image.offsetHeight + parseFloat(imgStyle.marginTop) + parseFloat(imgStyle.marginBottom);
        }
        if (title) {
            const titleStyle = getComputedStyle(title);
            usedHeight += title.offsetHeight + parseFloat(titleStyle.marginTop) + parseFloat(titleStyle.marginBottom);
        }
        if (titleBar) {
            usedHeight += 14.5; // Fixed height for article-title-bar-front
        }
        
        let continuedHeight = 45;
        if (continued) {
            const contStyle = getComputedStyle(continued);
            const actualHeight = continued.offsetHeight + parseFloat(contStyle.marginTop) + parseFloat(contStyle.marginBottom);
            continuedHeight = Math.max(actualHeight + 15, 45);
        }
        usedHeight += continuedHeight;
        
        const availableHeight = maxContentHeight - usedHeight - 30; // 30px safety margin
        
        articleColRight.offsetHeight;
        article1Content.offsetHeight;
        
        const actualContentHeight = article1Content.scrollHeight;
        
        if (actualContentHeight > availableHeight + 10) {
            // Content overflows - trim it
            const elements = Array.from(article1Content.children);
            let fittingContent = '';
            let remainingContent = '';
            
            const tempContainer = document.createElement('div');
            tempContainer.className = 'article-snippet';
            tempContainer.style.position = 'absolute';
            tempContainer.style.visibility = 'hidden';
            tempContainer.style.width = article1Content.offsetWidth + 'px';
            tempContainer.style.fontSize = getComputedStyle(article1Content).fontSize;
            tempContainer.style.lineHeight = getComputedStyle(article1Content).lineHeight;
            document.body.appendChild(tempContainer);
            
            try {
                for (let i = 0; i < elements.length; i++) {
                    const element = elements[i];
                    const elementHTML = element.outerHTML;
                    
                    tempContainer.innerHTML = fittingContent + elementHTML;
                    tempContainer.offsetHeight;
                    const testHeight = tempContainer.scrollHeight;
                    
                    if (testHeight <= availableHeight) {
                        fittingContent += elementHTML;
                    } else {
                        // Element doesn't fit - try to split it
                        if (element.tagName === 'P') {
                            const text = element.textContent;
                            const words = text.split(/\s+/);
                            
                            let fittingText = '';
                            let fittingWords = [];
                            
                            for (let j = 0; j < words.length; j++) {
                                const testWords = [...fittingWords, words[j]];
                                const testText = testWords.join(' ');
                                tempContainer.innerHTML = fittingContent + `<p>${testText}</p>`;
                                tempContainer.offsetHeight;
                                const wordTestHeight = tempContainer.scrollHeight;
                                
                                if (wordTestHeight <= availableHeight) {
                                    fittingWords.push(words[j]);
                                    fittingText = testText;
                                } else {
                                    break;
                                }
                            }
                            
                            if (fittingText) {
                                fittingContent += `<p>${fittingText}</p>`;
                                const remainingWords = words.slice(fittingWords.length);
                                if (remainingWords.length > 0) {
                                    const remainingText = remainingWords.join(' ');
                                    remainingContent += `<p>${remainingText}</p>`;
                                }
                            } else {
                                remainingContent += elementHTML;
                            }
                        } else {
                            remainingContent += elementHTML;
                        }
                        
                        // Add remaining elements
                        for (let j = i + 1; j < elements.length; j++) {
                            remainingContent += elements[j].outerHTML;
                        }
                        break;
                    }
                }
            } finally {
                if (tempContainer && tempContainer.parentNode) {
                    document.body.removeChild(tempContainer);
                }
            }
            
            // Update content on front page
            article1Content.innerHTML = fittingContent;
            
            // Add remaining content to page 2 (prepend to existing content)
            const pages = container.querySelectorAll('.newsletter-page');
            if (pages.length > 1 && remainingContent) {
                const page2 = pages[1];
                const page2Content = page2.querySelector('.article-columns-three-css');
                if (page2Content) {
                    page2Content.innerHTML = remainingContent + page2Content.innerHTML;
                    console.log('trimArticle1ToFitForTest: Added remaining Article 1 content to page 2');
                }
            }
        }
    } catch (error) {
        console.error('trimArticle1ToFitForTest error:', error);
    }
}

// Simplified page splitting for test (matches main script's splitPagesDynamically)
function splitPagesDynamicallyForTest(container) {
    // Find pages within the container (not document-wide)
    const pages = container.querySelectorAll('.newsletter-page');
    if (pages.length === 0) return;
    
    // Process pages starting from page 2 (index 1) - skip front page
    for (let pageIndex = 1; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        const contentDiv = page.querySelector('.article-columns-three-css');
        if (!contentDiv) continue;
        
        const contentArea = page.querySelector('.newsletter-content');
        if (!contentArea) continue;
        
        // Calculate max height for content
        const pageHeight = parseFloat(getComputedStyle(page).height) || 11 * 96;
        const padding = parseFloat(getComputedStyle(page).paddingTop) + parseFloat(getComputedStyle(page).paddingBottom);
        const maxHeight = pageHeight - padding || 10.5 * 96;
        
        if (!maxHeight || maxHeight <= 0) continue;
        
        // Check for overflow
        const originalOverflow = contentDiv.style.overflow;
        const originalMaxHeight = contentDiv.style.maxHeight;
        
        contentDiv.style.overflow = 'visible';
        contentDiv.style.maxHeight = 'none';
        contentDiv.offsetHeight;
        
        const contentHeight = contentDiv.scrollHeight;
        const containerHeight = contentArea.clientHeight || maxHeight;
        
        contentDiv.style.overflow = originalOverflow;
        contentDiv.style.maxHeight = originalMaxHeight;
        
        const hasOverflow = contentHeight > containerHeight * 1.05;
        
        if (hasOverflow) {
            // Split content element by element
            const elements = Array.from(contentDiv.children);
            if (elements.length === 0) continue;
            
            let currentPage = page;
            let currentContentDiv = contentDiv;
            let currentPageContent = '';
            
            for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                const elementHTML = element.outerHTML;
                const testContent = currentPageContent + elementHTML;
                
                // Test if adding element causes overflow
                const testDiv = document.createElement('div');
                testDiv.className = 'article-columns-three-css';
                const computedStyle = getComputedStyle(contentDiv);
                testDiv.style.position = 'absolute';
                testDiv.style.visibility = 'hidden';
                testDiv.style.width = contentDiv.offsetWidth + 'px';
                testDiv.style.columnCount = computedStyle.columnCount || '3';
                testDiv.style.columnGap = computedStyle.columnGap || '20px';
                testDiv.style.maxHeight = maxHeight + 'px';
                testDiv.innerHTML = testContent;
                document.body.appendChild(testDiv);
                
                testDiv.offsetHeight;
                const testMaxHeight = testDiv.style.maxHeight;
                testDiv.style.maxHeight = 'none';
                const testHeight = testDiv.scrollHeight;
                testDiv.style.maxHeight = testMaxHeight;
                document.body.removeChild(testDiv);
                
                const overflowThreshold = maxHeight * 0.98;
                
                if (testHeight > overflowThreshold && currentPageContent.trim() !== '') {
                    // Create new page
                    currentContentDiv.innerHTML = currentPageContent;
                    
                    const newPage = page.cloneNode(false);
                    const newContentArea = contentArea.cloneNode(false);
                    const newContentDiv = document.createElement('div');
                    newContentDiv.className = 'article-columns-three-css';
                    newContentDiv.style.width = '100%';
                    newContentDiv.style.maxWidth = '100%';
                    newContentArea.appendChild(newContentDiv);
                    newPage.appendChild(newContentArea);
                    
                    const parentNode = currentPage.parentNode;
                    if (parentNode) {
                        parentNode.insertBefore(newPage, currentPage.nextSibling);
                    }
                    
                    currentPage = newPage;
                    currentContentDiv = newContentDiv;
                    currentPageContent = elementHTML;
                } else {
                    currentPageContent += elementHTML;
                }
            }
            
            // Set final page content
            if (currentPageContent && currentContentDiv) {
                currentContentDiv.innerHTML = currentPageContent;
            }
        }
    }
}

// Form submission handler
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('article-form');
    
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const urlsString = document.getElementById('article-url').value.trim();
        
        if (urlsString) {
            processArticleURLs(urlsString);
        }
    });
});

