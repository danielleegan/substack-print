function normalizeURL(url) {
    const trimmed = url.trim();
    return trimmed.match(/^https?:\/\//i) ? trimmed : 'https://' + trimmed;
}

function extractPublicationName(url) {
    try {
        const urlObj = new URL(normalizeURL(url));
        const hostname = urlObj.hostname;
        return hostname.includes('.substack.com') ? hostname.split('.substack.com')[0] : hostname;
    } catch (e) {
        return 'Substack Publication';
    }
}

function getRSSFeedURL(url) {
    try {
        const urlObj = new URL(normalizeURL(url));
        return `${urlObj.protocol}//${urlObj.hostname}/feed`;
    } catch (e) {
        return null;
    }
}

// Helper function to check if we're on mobile
function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
}

// Function to update page visibility based on screen size
function updatePageVisibility() {
    const pages = document.querySelectorAll('.newsletter-page');
    const mobile = isMobile();
    
    pages.forEach((page, idx) => {
        if (!mobile || idx === 0) {
            // Show page on desktop, or if it's the first page on mobile
            page.style.display = 'flex';
        } else {
            // Hide pages 2+ on mobile
            page.style.display = 'none';
        }
    });
}

// Function to show/hide mobile-only elements
function updateMobileElements() {
    const mobileMessage = document.getElementById('mobile-message');
    const mobileImages = document.getElementById('mobile-example-images');
    const mobileFrontPageLabel = document.getElementById('mobile-front-page-label');
    const mobileExampleLabel = document.getElementById('mobile-example-label');
    const newsletterContainer = document.getElementById('newsletter-container');
    
    // Only show mobile elements if newsletter is visible and we're on mobile
    if (mobileMessage && mobileImages && newsletterContainer) {
        const isVisible = !newsletterContainer.classList.contains('hidden');
        const mobile = isMobile();
        
        if (isVisible && mobile) {
            mobileMessage.classList.remove('hidden');
            mobileImages.classList.remove('hidden');
            if (mobileFrontPageLabel) mobileFrontPageLabel.classList.remove('hidden');
            if (mobileExampleLabel) mobileExampleLabel.classList.remove('hidden');
        } else {
            mobileMessage.classList.add('hidden');
            mobileImages.classList.add('hidden');
            if (mobileFrontPageLabel) mobileFrontPageLabel.classList.add('hidden');
            if (mobileExampleLabel) mobileExampleLabel.classList.add('hidden');
        }
    }
}

// PRE-PROCESSING STEP: Flatten footnotes before any newspaper styling or formatting
// This function processes raw HTML content from RSS feeds to ensure footnotes are single-line
function preprocessRSSContent(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') {
        return htmlContent;
    }
    
    // Parse the HTML content
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // FIRST: Find and mark ALL footnote reference links BEFORE any processing
    // Only process links with class "footnote-anchor" and specific attributes
    // Format: <a class="footnote-anchor" data-component-name="FootnoteAnchorToDOM" id="footnote-anchor-1" href="#footnote-1" target="_self">1</a>
    const footnoteLinks = Array.from(doc.querySelectorAll('a.footnote-anchor[data-component-name="FootnoteAnchorToDOM"]'));
    const footnoteData = [];
    
    footnoteLinks.forEach(link => {
        const href = link.getAttribute('href') || '';
        const id = link.getAttribute('id') || '';
        // Extract footnote number from href (e.g., "#footnote-1" -> 1) or id (e.g., "footnote-anchor-1" -> 1)
        const hrefMatch = href.match(/#footnote-?(\d+)/i);
        const idMatch = id.match(/footnote-anchor-?(\d+)/i);
        if (hrefMatch || idMatch) {
            const num = (hrefMatch && hrefMatch[1]) || (idMatch && idMatch[1]);
            const linkText = link.textContent.trim() || num;
            
            // Store the footnote data for later processing
            footnoteData.push({
                link: link,
                num: num,
                text: linkText
            });
        }
    });
    
    // Now replace all footnote links with spans in REVERSE ORDER to avoid DOM issues
    // Process from last to first so replacing doesn't affect subsequent elements
    for (let i = footnoteData.length - 1; i >= 0; i--) {
        const {link, num, text} = footnoteData[i];
        // Replace the link with a span that marks it as a footnote reference
        // This removes the link but preserves the footnote reference for later processing
        const span = document.createElement('span');
        span.setAttribute('data-footnote-ref', num);
        span.classList.add('footnote-reference');
        span.textContent = text;
        
        // Replace the link with the span
        if (link.parentNode) {
            link.parentNode.replaceChild(span, link);
        }
    }
    
    // Find all footnote lists (<ol> and <ul> that likely contain footnotes)
    // Also check for elements with footnote-related classes/IDs
    const footnoteSelectors = [
        'ol',
        'ul',
        '[class*="footnote"]',
        '[class*="footnotes"]',
        '[id*="footnote"]',
        '[id*="footnotes"]'
    ];
    
    const allLists = new Set();
    footnoteSelectors.forEach(selector => {
        doc.querySelectorAll(selector).forEach(el => {
            // Check if this looks like a footnote list (contains numbered items)
            const items = el.querySelectorAll('li');
            if (items.length > 0) {
                allLists.add(el);
            }
        });
    });
    
    // Process each footnote list
    allLists.forEach(list => {
        const listItems = Array.from(list.querySelectorAll('li'));
        
        listItems.forEach((li, index) => {
            // Extract footnote number
            let footnoteNum = '';
            if (list.tagName === 'OL') {
                // For ordered lists, use the list item index + 1
                footnoteNum = (index + 1).toString();
            } else {
                // For unordered lists, try to extract number from text
                const text = li.textContent || '';
                const numMatch = text.match(/^(\d+)\.?\s*/);
                if (numMatch) {
                    footnoteNum = numMatch[1];
                } else {
                    footnoteNum = (index + 1).toString();
                }
            }
            
            // Extract footnote text - IGNORE ALL HTML TAGS
            // Get plain text content, removing all HTML structure
            // Use textContent to get all text without any HTML tags
            let footnoteText = li.textContent || '';
            
            // Remove any leading number that might be in the text
            footnoteText = footnoteText.replace(/^\d+\.?\s*/, '').trim();
            
            // Remove all newlines and normalize whitespace
            footnoteText = footnoteText.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
            
            // Replace the entire list item content with flattened single-line format
            // Format: "N. Footnote text" (single line, no HTML tags, no newlines)
            li.innerHTML = '';
            const textNode = document.createTextNode(footnoteNum + '. ' + footnoteText);
            li.appendChild(textNode);
        });
    });
    
    // Also process any standalone footnote patterns in the text
    // Pattern: number followed by newline(s) followed by text
    const walker = document.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }
    
    textNodes.forEach(textNode => {
        const text = textNode.textContent || '';
        // Pattern: number at start of line, followed by newline(s), followed by text
        const pattern = /^(\d+)\.?\s*\n+\s*(.+)$/gm;
        const newText = text.replace(pattern, (match, number, text) => {
            const trimmedText = text.trim();
            // Only replace if it looks like a footnote pattern
            if (trimmedText.length > 0 && trimmedText.length < 2000) {
                // Remove all newlines and normalize whitespace
                const singleLineText = trimmedText.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
                return number + '. ' + singleLineText;
            }
            return match;
        });
        
        if (newText !== text) {
            textNode.textContent = newText;
        }
    });
    
    // Remove all <br> tags from list items (footnotes)
    doc.querySelectorAll('li').forEach(li => {
        li.querySelectorAll('br').forEach(br => br.remove());
        // Normalize text content
        const text = li.textContent || '';
        const normalizedText = text.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
        if (normalizedText !== text) {
            li.textContent = normalizedText;
        }
    });
    
    // Return the processed HTML
    return doc.body.innerHTML;
}

// Parse RSS feed XML
function parseRSSFeed(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    
    // Extract publication metadata
    const channel = xmlDoc.querySelector('channel');
    const pubTitle = channel?.querySelector('title')?.textContent || '';
    const pubDescription = channel?.querySelector('description')?.textContent || '';
    
    const items = xmlDoc.querySelectorAll('item');
    const articles = [];
    let earliestDate = null;
    
    // Get the earliest date from the last item in the RSS feed (earliest published article)
    // RSS feeds are typically ordered newest first, so the last item is the oldest
    if (items.length > 0) {
        const lastItem = items[items.length - 1];
        const pubDate = lastItem.querySelector('pubDate')?.textContent || '';
        if (pubDate) {
            const articleDate = new Date(pubDate);
            if (articleDate && !isNaN(articleDate.getTime())) {
                earliestDate = articleDate;
            }
        }
    }
    
    // Second pass: Only fully process the first 3 articles (we only display 3)
    const MAX_ARTICLES = 3;
    for (let index = 0; index < Math.min(items.length, MAX_ARTICLES); index++) {
        const item = items[index];
        const title = item.querySelector('title')?.textContent || 'Untitled';
        const pubDate = item.querySelector('pubDate')?.textContent || '';
        
        // Try to get full content from content:encoded first (full article)
        let content = '';
        
        // Iterate through all child elements to find content:encoded
        // This handles namespaced elements better than querySelector
        const allChildren = Array.from(item.children);
        for (const child of allChildren) {
            // Check if it's the encoded element (handles both content:encoded and encoded)
            const tagName = child.tagName || '';
            const localName = child.localName || '';
            
            if (localName === 'encoded' || tagName.toLowerCase().includes('encoded')) {
                // Get the text content (which includes CDATA content)
                content = child.textContent || child.innerHTML || '';
                if (content) break;
            }
        }
        
        // Fall back to description if no content:encoded (rare, but handle it)
        if (!content) {
            const description = item.querySelector('description')?.textContent || '';
            if (description) {
                // Parse description HTML to get clean text
                const descDoc = parser.parseFromString(description, 'text/html');
                content = descDoc.body.innerHTML || description;
            }
        }
        
        // MANDATORY PRE-PROCESSING: Flatten footnotes before any other processing
        // This happens BEFORE newspaper styling or formatting
        if (content) {
            content = preprocessRSSContent(content);
        }
        
        // Only store what we actually use
        articles.push({
            title,
            content,
            isFeatured: index === 0 // First article is featured
        });
    }
    
    return {
        articles,
        publication: {
            title: pubTitle,
            description: pubDescription,
            establishedDate: earliestDate
        }
    };
}

// Fetch full article content (fallback if RSS doesn't have full content)
async function fetchArticleContent(url) {
    // Method 1: Try Cloudflare Worker proxy first (fastest)
    if (CLOUDFLARE_PROXY_URL && CLOUDFLARE_PROXY_URL !== 'YOUR_CLOUDFLARE_WORKER_URL_HERE') {
        try {
            const proxyURL = `${CLOUDFLARE_PROXY_URL}?url=${encodeURIComponent(url)}`;
            const response = await fetchWithTimeout(proxyURL, {}, 3000);
            if (response.ok) {
                const text = await response.text();
                if (text) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(text, 'text/html');
                    const articleContent = doc.querySelector('.post-content, .body, article, .entry-content');
                    if (articleContent) {
                        return articleContent.innerHTML;
                    }
                }
            }
        } catch (e) {
            // Silently fail and try fallback
        }
    }
    
    // Method 2: Fallback to allorigins.win
    try {
        const proxyURL = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
        const response = await fetchWithTimeout(proxyURL, {}, 3000);
        if (response.ok) {
            const data = await response.json();
            if (data.contents) {
                const parser = new DOMParser();
                const doc = parser.parseFromString(data.contents, 'text/html');
                const articleContent = doc.querySelector('.post-content, .body, article, .entry-content');
                if (articleContent) {
                    return articleContent.innerHTML;
                }
            }
        }
    } catch (e) {
        // Error already logged if needed
    }
    return null;
}

// MANDATORY PRE-PASS: Normalize footnotes before any rendering
// This ensures footnotes are always in "N. Footnote text" format (single line, no newlines)
function normalizeFootnotes(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Rule 1: Convert HTML list footnotes to plaintext format
    // Find all ordered and unordered lists that might contain footnotes
    const lists = doc.querySelectorAll('ol, ul');
    lists.forEach((list, listIndex) => {
        const listItems = Array.from(list.querySelectorAll('li'));
        listItems.forEach((li, itemIndex) => {
            // Get the footnote number (from list numbering or item index)
            let footnoteNum = '';
            if (list.tagName === 'OL') {
                // For ordered lists, use the actual list item number
                footnoteNum = (itemIndex + 1).toString();
            } else {
                // For unordered lists, try to extract from content or use index
                const text = li.textContent || '';
                const numMatch = text.match(/^(\d+\.?)\s*/);
                if (numMatch) {
                    footnoteNum = numMatch[1].replace(/\.$/, '');
                } else {
                    footnoteNum = (itemIndex + 1).toString();
                }
            }
            
                // Get the footnote text (remove any leading numbers)
                // CRITICAL: Remove ALL line breaks to ensure single-line format
                let footnoteText = li.textContent || '';
                footnoteText = footnoteText.replace(/^\d+\.?\s*/, '').trim();
                // Remove all newlines, line breaks, <br> tags content, and normalize whitespace
                // First remove any HTML line breaks
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = li.innerHTML;
                tempDiv.querySelectorAll('br').forEach(br => br.replaceWith(' '));
                footnoteText = tempDiv.textContent || footnoteText;
                footnoteText = footnoteText.replace(/^\d+\.?\s*/, '').trim();
                // Remove all newlines and normalize whitespace to single spaces
                footnoteText = footnoteText.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
            
            // Replace the list item content with normalized format: "N. Footnote text"
            // Use a span to preserve structure but ensure single-line format
            li.innerHTML = '';
            const contentSpan = document.createElement('span');
            contentSpan.textContent = footnoteNum + '. ' + footnoteText;
            li.appendChild(contentSpan);
        });
    });
    
    // Rule 2: Fix line-break footnotes in raw text
    // Pattern: ^(\d+)\.?\s*\n+(.+)
    // Replace with: \1. \2
    // CRITICAL: Remove ALL line breaks from footnote text
    const walker = document.createTreeWalker(
        doc.body,
        NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
        null,
        false
    );
    
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        if (node.nodeType === Node.TEXT_NODE) {
            textNodes.push(node);
        }
    }
    
    textNodes.forEach(textNode => {
        const text = textNode.textContent;
        // Pattern: number at start of line, followed by newline(s), followed by text
        const pattern = /^(\d+)\.?\s*\n+(.+)$/gm;
        const newText = text.replace(pattern, (match, number, text) => {
            const trimmedText = text.trim();
            // Only replace if it looks like a footnote pattern
            if (trimmedText.length > 0 && trimmedText.length < 2000) {
                // Remove all line breaks from the text
                const singleLineText = trimmedText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
                return number + '. ' + singleLineText;
            }
            return match;
        });
        
        if (newText !== text) {
            textNode.textContent = newText;
        }
    });
    
    // Also process HTML that might have <br> tags as line breaks
    doc.querySelectorAll('*').forEach(el => {
        const html = el.innerHTML || '';
        // Pattern: number followed by <br> or newline, then text
        const brPattern = /(\d+)\.?\s*(<br\s*\/?>|\n)+\s*([^<\n]+)/gi;
        const newHTML = html.replace(brPattern, (match, number, breakTag, text) => {
            const trimmedText = text.trim();
            if (trimmedText.length > 0 && trimmedText.length < 2000) {
                // Remove all line breaks and normalize whitespace
                const singleLineText = trimmedText.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
                return number + '. ' + singleLineText;
            }
            return match;
        });
        
        if (newHTML !== html) {
            el.innerHTML = newHTML;
        }
    });
    
    // Final pass: Remove any remaining <br> tags and newlines from list items
    doc.querySelectorAll('li').forEach(li => {
        // Remove all <br> tags
        li.querySelectorAll('br').forEach(br => br.remove());
        // Normalize text content - remove newlines and extra whitespace
        const text = li.textContent || '';
        const normalizedText = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
        if (normalizedText !== text) {
            li.textContent = normalizedText;
        }
    });
    
    return doc.body.innerHTML;
}

// Clean and format HTML content
function cleanHTMLContent(html) {
    // MANDATORY: Flatten footnotes FIRST, before any other processing
    // Convert all footnote lists to plain text format: "N. Footnote text"
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Find ALL lists that might be footnotes and flatten them completely
    // This is CRITICAL - must happen before any other processing
    doc.querySelectorAll('ol, ul').forEach(list => {
        const items = Array.from(list.querySelectorAll('li'));
        items.forEach((li, index) => {
            // Remove ALL <br> tags first
            li.querySelectorAll('br').forEach(br => br.remove());
            
            // Get the number
            let num = '';
            if (list.tagName === 'OL') {
                num = (index + 1).toString();
            } else {
                const text = li.textContent || '';
                const match = text.match(/^(\d+)\.?\s*/);
                num = match ? match[1] : (index + 1).toString();
            }
            
            // Get ALL text content, ignoring ALL HTML tags
            // Use textContent to get plain text without any HTML structure
            let text = li.textContent || '';
            // Remove leading number if present
            text = text.replace(/^\d+\.?\s*/, '').trim();
            // Remove ALL newlines, carriage returns, and normalize whitespace
            text = text.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
            
            // CRITICAL: Replace entire list item content with plain text
            // This ensures NO HTML tags, NO newlines, just "N. text"
            li.innerHTML = '';
            const textNode = document.createTextNode(num + '. ' + text);
            li.appendChild(textNode);
        });
    });
    
    html = doc.body.innerHTML;
    
    const doc2 = parser.parseFromString(html, 'text/html');
    
    // Remove unwanted elements (buttons, widgets, scripts, etc.)
    // BUT PRESERVE FOOTNOTE LINKS - don't remove <a> tags with footnote hrefs
    const unwantedSelectors = [
        'script',
        'style',
        'iframe',
        'noscript',
        'button',
        '.subscribe-widget',
        '.subscribe-button',
        '.share-buttons',
        '[class*="subscribe"]',
        '[class*="share"]',
        '[class*="social"]',
        '[class*="button"]',
        '.button-wrapper',
        'form',
        'input',
        'textarea',
        'select'
    ];
    
    unwantedSelectors.forEach(selector => {
        doc2.querySelectorAll(selector).forEach(el => {
            // Don't remove footnote links - only preserve those with class "footnote-anchor"
            if (el.tagName === 'A' && 
                el.classList.contains('footnote-anchor') &&
                el.getAttribute('data-component-name') === 'FootnoteAnchorToDOM') {
                return; // Skip removing footnote links
            }
            el.remove();
        });
    });
    
    // Handle links: keep images, remove link wrappers, convert text links to plain text
    // BUT PRESERVE FOOTNOTE SPANS - they were created in preprocessing and must be kept
    // Also preserve any remaining footnote links that weren't converted yet
    doc2.querySelectorAll('a').forEach(link => {
        // Check if this is a footnote link - only process links with class "footnote-anchor"
        const href = link.getAttribute('href') || '';
        const id = link.getAttribute('id') || '';
        const dataRef = link.getAttribute('data-footnote-ref');
        const isFootnoteLink = link.classList.contains('footnote-anchor') &&
                              link.getAttribute('data-component-name') === 'FootnoteAnchorToDOM';
        
        if (isFootnoteLink) {
            // Extract footnote number from href or id
            const hrefMatch = href.match(/#footnote-?(\d+)/i);
            const idMatch = id.match(/footnote-anchor-?(\d+)/i);
            const num = (hrefMatch && hrefMatch[1]) || (idMatch && idMatch[1]) || dataRef || link.textContent.trim();
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
            // If link contains an image, replace the link with just the image
            const imgClone = img.cloneNode(true);
            link.parentNode.replaceChild(imgClone, link);
        } else {
            // If it's a text link, replace with plain text
            const text = link.textContent;
            const textNode = doc.createTextNode(text);
            link.parentNode.replaceChild(textNode, link);
        }
    });
    
    // CRITICAL: Make sure footnote-reference spans are preserved and not removed
    // They should already be in the HTML, but ensure they're not accidentally removed
    const preservedSpans = doc2.querySelectorAll('span.footnote-reference, span[data-footnote-ref]');
    console.log(`cleanHTMLContent: Found ${preservedSpans.length} footnote-reference spans to preserve`);
    preservedSpans.forEach(span => {
        // Just verify they exist - they should already be preserved
        const dataRef = span.getAttribute('data-footnote-ref');
        if (!dataRef) {
            console.warn('Found footnote-reference span without data-footnote-ref:', span);
        } else {
            console.log(`cleanHTMLContent: Preserving span with data-footnote-ref="${dataRef}"`);
        }
    });
    
    // Final pass: Ensure footnotes are still single-line (safety check)
    // ONLY process list items that are in footnote containers
    doc2.querySelectorAll('li').forEach(li => {
        // Only process if it's in a footnote container or has footnote-related classes/ids
        const isInFootnoteContainer = li.closest('[class*="footnote"], [id*="footnote"]') !== null;
        const hasFootnoteClass = li.classList.toString().toLowerCase().includes('footnote') ||
                               li.id.toLowerCase().includes('footnote');
        
        if (!isInFootnoteContainer && !hasFootnoteClass) {
            return; // Skip list items that aren't in footnote containers
        }
        
        // Remove ALL <br> tags
        li.querySelectorAll('br').forEach(br => br.remove());
        
        let text = li.textContent || '';
        // Remove any newlines that might have been introduced
        text = text.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
        
        // If it looks like a footnote (starts with number), ensure format is correct
        if (text.match(/^\d+\.?\s/)) {
            const match = text.match(/^(\d+)\.?\s*(.+)$/);
            if (match) {
                // Ensure single-line format
                li.textContent = match[1] + '. ' + match[2].trim();
            }
        } else {
            // Even if it doesn't look like a footnote, ensure no newlines
            li.textContent = text;
        }
    });
    
    // Also check for footnotes in other formats (divs, paragraphs with numbers)
    // BUT ONLY if they're already in a footnote container or have footnote classes
    doc2.querySelectorAll('div, p').forEach(el => {
        // Only process if it's already in a footnote container or has footnote-related classes/ids
        const isInFootnoteContainer = el.closest('[class*="footnote"], [id*="footnote"]') !== null &&
                                     (el.closest('ol, ul, li') !== null || 
                                      el.classList.toString().toLowerCase().includes('footnote') ||
                                      el.id.toLowerCase().includes('footnote'));
        
        if (!isInFootnoteContainer) {
            return; // Skip elements that aren't in footnote containers
        }
        
        const text = el.textContent || '';
        // Check if this looks like a footnote (starts with number, short content)
        if (text.match(/^\d+\.?\s/) && text.length < 500) {
            const match = text.match(/^(\d+)\.?\s*(.+)$/);
            if (match) {
                // Flatten it
                el.textContent = match[1] + '. ' + match[2].trim().replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ');
            }
        }
    });
    
    // Remove "Read more" or "read more" from the end of articles
    // Check all paragraphs and remove if they end with "Read more" or "read more"
    const paragraphs = doc2.querySelectorAll('p');
    paragraphs.forEach(p => {
        const text = p.textContent || '';
        // Check if paragraph ends with "Read more" or "read more" (case insensitive, with optional punctuation)
        const readMorePattern = /\s*(?:read\s+more|Read\s+more|READ\s+MORE)[.,;:!?]*\s*$/i;
        if (readMorePattern.test(text)) {
            // Remove "Read more" from the text
            const newText = text.replace(readMorePattern, '').trim();
            if (newText.length > 0) {
                // Update the paragraph text
                p.textContent = newText;
            } else {
                // If the paragraph only contained "Read more", remove the paragraph entirely
                p.remove();
            }
        }
    });
    
    // Also check for "Read more" as standalone text nodes
    const walker = document.createTreeWalker(
        doc2.body,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }
    
    textNodes.forEach(textNode => {
        const text = textNode.textContent || '';
        const readMorePattern = /^\s*(?:read\s+more|Read\s+more|READ\s+MORE)[.,;:!?]*\s*$/i;
        if (readMorePattern.test(text)) {
            // Remove the text node
            if (textNode.parentNode) {
                textNode.parentNode.removeChild(textNode);
            }
        } else {
            // Check if text ends with "Read more"
            const endPattern = /\s*(?:read\s+more|Read\s+more|READ\s+MORE)[.,;:!?]*\s*$/i;
            if (endPattern.test(text)) {
                const newText = text.replace(endPattern, '').trim();
                textNode.textContent = newText;
            }
        }
    });
    
    return doc2.body.innerHTML;
}

// Format date for display
function formatDate(date) {
    if (!date || isNaN(date.getTime())) {
        return new Date().toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
    }
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

// Format date for header (e.g., "SATURDAY, DECEMBER 27, 2025")
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

// Format year only (for EST. date)
function formatYear(date) {
    if (!date) {
        return new Date().getFullYear();
    }
    
    // Handle string dates (from cache)
    if (typeof date === 'string') {
        const dateObj = new Date(date);
        if (!isNaN(dateObj.getTime())) {
            return dateObj.getFullYear();
        }
        return new Date().getFullYear();
    }
    
    // Handle Date objects
    if (date instanceof Date) {
        if (!isNaN(date.getTime())) {
            return date.getFullYear();
        }
        return new Date().getFullYear();
    }
    
    // Fallback
    return new Date().getFullYear();
}

// Find the main/featured image in an article
// Prioritizes images in featured/main/hero containers, then falls back to first image
function findMainImage(doc) {
    if (!doc) return null;
    
    // Strategy 1: Look for images in featured/main/hero containers
    const featuredSelectors = [
        'figure.featured-image img',
        'figure.main-image img',
        'figure.hero-image img',
        'figure.post-image img',
        '.featured-image img',
        '.main-image img',
        '.hero-image img',
        '.post-image img',
        '[class*="featured"] img',
        '[class*="main-image"] img',
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

// Generate newsletter HTML
function generateNewsletter(publication, articles) {
    const mode = getCurrentMode();
    const modeClass = mode && mode !== 'normal' ? ` mode-${mode}` : '';
    // Get current date in PST/PDT timezone (America/Los_Angeles)
    const now = new Date();
    const pstFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Los_Angeles',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    });
    const parts = pstFormatter.formatToParts(now);
    const year = parseInt(parts.find(p => p.type === 'year').value);
    const month = parseInt(parts.find(p => p.type === 'month').value) - 1; // Month is 0-indexed
    const day = parseInt(parts.find(p => p.type === 'day').value);
    const pstDate = new Date(year, month, day);
    
    let article1RemainingContent = ''; // Store Article 1's remaining content for page 2+
    const headerDate = formatHeaderDate(pstDate);
    
    // Use established date from publication (earliest article date) or fallback to earliest article date from current articles
    let establishedYear;
    if (publication.establishedDate) {
        establishedYear = formatYear(publication.establishedDate);
    } else if (articles.length > 0) {
        // Find earliest article date
        const articleDates = articles.map(a => a.pubDate).filter(d => d && !isNaN(d.getTime()));
        if (articleDates.length > 0) {
            const earliestArticleDate = new Date(Math.min(...articleDates));
            establishedYear = formatYear(earliestArticleDate);
        } else {
            establishedYear = new Date().getFullYear();
        }
    } else {
        establishedYear = new Date().getFullYear();
    }
    
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
    `;
    
    // Article 1 (most recent) goes on right side
    // Articles 2, 3, 4 go on left side stacked
    if (articles.length >= 1) {
        const article1 = articles[0]; // Most recent article
        const article2 = articles[1] || null;
        const article3 = articles[2] || null;
        
        // Process Article 1 (right side)
        const cleanContent1 = cleanHTMLContent(article1.content);
        const parser = new DOMParser();
        const contentDoc1 = parser.parseFromString(cleanContent1, 'text/html');
        const mainImage = findMainImage(contentDoc1);
        let imageHTML = '';
        let imageCaption = '';
        
        if (mainImage) {
            const imgSrc = mainImage.getAttribute('src') || mainImage.getAttribute('data-src') || '';
            // Find caption - check parent figure first, then search document
            const parentFigure = mainImage.closest('figure');
            const figcaption = parentFigure ? parentFigure.querySelector('figcaption, .image-caption') : contentDoc1.querySelector('figcaption, .image-caption');
            imageCaption = figcaption ? figcaption.textContent : '';
            mainImage.remove();
            if (figcaption) figcaption.remove();
            // Also remove the parent figure if it's now empty
            if (parentFigure && parentFigure.children.length === 0) {
                parentFigure.remove();
            }
        }
        
        // Extract subtitle (h3, h4, or subtitle class) - usually appears early in content
        let subtitle1 = '';
        const subtitleEl1 = contentDoc1.querySelector('h3, h4, .subtitle, [class*="subtitle"]');
        if (subtitleEl1) {
            subtitle1 = subtitleEl1.textContent.trim();
            subtitleEl1.remove(); // Remove from content so it doesn't appear again
        }
        
        // Get all paragraphs/elements for Article 1
        const allElements1 = Array.from(contentDoc1.body.children);
        
        // Put ALL content initially - trimArticle1ToFit() will dynamically fit as much as possible
        // Content for page 1 (will be trimmed dynamically)
        const article1ContentPage1 = allElements1.map(el => el.outerHTML).join('');
        // Remaining content will be set by trimArticle1ToFit() after it trims
        article1RemainingContent = '';
        
        if (mainImage) {
            const imgSrc = mainImage.getAttribute('src') || mainImage.getAttribute('data-src') || '';
            imageHTML = `
                <div class="featured-image">
                    <img src="${imgSrc}" alt="${article1.title}">
                    ${imageCaption ? `<div class="image-caption">${imageCaption}</div>` : ''}
                </div>
            `;
        }
        
        // Calculate page numbers
        // Article 1 continues on page 2
        // Article 2 starts after article 1 finishes (need to estimate pages)
        // For now, assume article 1 takes 1 page, so article 2 starts on page 2
        // Article 3 starts after article 2
        let article2Page = 2;
        let article3Page = 3;
        
        html += `
            <div class="article-featured">
                <div class="article-columns">
                    <div class="article-col-left">
        `;
        
        // Article 2 section (top)
        if (article2) {
            const cleanContent2 = cleanHTMLContent(article2.content);
            const contentDoc2 = parser.parseFromString(cleanContent2, 'text/html');
            
            // Extract subtitle (h3, h4, or subtitle class) - usually appears early in content
            let subtitle2 = '';
            const subtitleEl2 = contentDoc2.querySelector('h3, h4, .subtitle, [class*="subtitle"]');
            if (subtitleEl2) {
                subtitle2 = subtitleEl2.textContent.trim();
                subtitleEl2.remove(); // Remove from content so it doesn't appear again
            }
            
            const paragraphs2 = Array.from(contentDoc2.querySelectorAll('p'));
            const allParagraphs2 = paragraphs2.map(p => p.outerHTML).join('');
            // Start with 2 paragraphs, will be optimized later
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
            const cleanContent3 = cleanHTMLContent(article3.content);
            const contentDoc3 = parser.parseFromString(cleanContent3, 'text/html');
            
            // Extract main/featured image from Article 3
            const mainImage3 = findMainImage(contentDoc3);
            let imageHTML3 = '';
            let imageCaption3 = '';
            
            if (mainImage3) {
                const imgSrc3 = mainImage3.getAttribute('src') || mainImage3.getAttribute('data-src') || '';
                // Find caption - check parent figure first, then search document
                const parentFigure3 = mainImage3.closest('figure');
                const figcaption3 = parentFigure3 ? parentFigure3.querySelector('figcaption, .image-caption') : contentDoc3.querySelector('figcaption, .image-caption');
                imageCaption3 = figcaption3 ? figcaption3.textContent : '';
                mainImage3.remove();
                if (figcaption3) figcaption3.remove();
                // Also remove the parent figure if it's now empty
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
            
            // Extract subtitle (h3, h4, or subtitle class) - usually appears early in content
            let subtitle3 = '';
            const subtitleEl3 = contentDoc3.querySelector('h3, h4, .subtitle, [class*="subtitle"]');
            if (subtitleEl3) {
                subtitle3 = subtitleEl3.textContent.trim();
                subtitleEl3.remove(); // Remove from content so it doesn't appear again
            }
            
            const paragraphs3 = Array.from(contentDoc3.querySelectorAll('p'));
            const allParagraphs3 = paragraphs3.map(p => p.outerHTML).join('');
            // Start with 2 paragraphs, will be optimized later
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
    
    // Create additional pages with CSS columns for natural flow
    // Start with Article 1 continuation, then Articles 2, 3, 4
    if (articles.length >= 1) {
        let allContent = ''; // Single content stream that will flow across columns
        
        // Process Article 1 continuation first (if there's remaining content)
        // No title needed since it was already shown on page 1
        if (article1RemainingContent && article1RemainingContent.trim() !== '') {
            allContent += article1RemainingContent;
        }
        
        // Process remaining articles (starting from article 2, index 1)
        for (let i = 1; i < articles.length; i++) {
            const article = articles[i];
            const cleanContent = cleanHTMLContent(article.content);
            
            // Add article title and content - CSS columns will flow naturally
            allContent += `<h2 class="article-title">${article.title}</h2>`;
            allContent += '<div class="article-title-bar"></div>'; // Horizontal bar after title for print
            allContent += cleanContent;
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

// Fetch RSS feed with multiple fallback methods
// Cloudflare Worker proxy URL - update this after deploying your worker
// You'll get a URL like: https://substack-rss-proxy.your-subdomain.workers.dev
const CLOUDFLARE_PROXY_URL = 'https://substack-rss-proxy.daniellescoolemail.workers.dev'; // e.g., 'https://substack-rss-proxy.your-subdomain.workers.dev'

// Helper function to fetch with timeout
async function fetchWithTimeout(url, options = {}, timeout = 5000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (e) {
        clearTimeout(id);
        throw e;
    }
}

async function fetchRSSFeed(rssURL) {
    // Method 1: Try Cloudflare Worker proxy first (fastest, same network)
    if (CLOUDFLARE_PROXY_URL && CLOUDFLARE_PROXY_URL !== 'YOUR_CLOUDFLARE_WORKER_URL_HERE') {
        try {
            const proxyURL = `${CLOUDFLARE_PROXY_URL}?url=${encodeURIComponent(rssURL)}`;
            console.log('Trying Cloudflare Worker first:', proxyURL);
            const response = await fetchWithTimeout(proxyURL, {}, 3000);
            if (response.ok) {
                const text = await response.text();
                if (text && text.trim().length > 0) {
                    console.log('Cloudflare Worker succeeded!');
                    return text;
                }
            } else {
                console.log('Cloudflare Worker returned non-OK status:', response.status);
            }
        } catch (e) {
            console.log('Cloudflare Worker failed, trying fallbacks:', e.message);
        }
    } else {
        console.log('Cloudflare Worker not configured, skipping');
    }
    
    // Method 2: Try direct fetch in parallel with allorigins (RSS feeds often allow CORS)
    // Only start these after Cloudflare Worker has failed
    console.log('Trying direct fetch and allorigins in parallel...');
    const [directResult, alloriginsResult] = await Promise.allSettled([
        fetch(rssURL, {
            mode: 'cors',
            headers: { 'Accept': 'application/rss+xml, application/xml, text/xml' }
        }).catch(() => null),
        fetchWithTimeout(
            `https://api.allorigins.win/get?url=${encodeURIComponent(rssURL)}`,
            {},
            3000
        ).catch(() => null)
    ]);
    
    // Check direct fetch result
    if (directResult.status === 'fulfilled' && directResult.value?.ok) {
        const text = await directResult.value.text();
        if (text) return text;
    }
    
    // Check allorigins result
    if (alloriginsResult.status === 'fulfilled' && alloriginsResult.value?.ok) {
        const data = await alloriginsResult.value.json();
        const content = data.contents || data.content || '';
        if (content) return content;
    }
    
    // Method 3: Try local proxy (for local development only)
    try {
        const proxyURL = `http://localhost:8001/proxy?url=${encodeURIComponent(rssURL)}`;
        const response = await fetchWithTimeout(proxyURL, {}, 1000);
        if (response.ok) {
            const text = await response.text();
            return text;
        }
    } catch (e) {
        // Expected to fail on deployed sites
    }
    
    throw new Error('Unable to fetch RSS feed. The feed may be blocked by CORS or the proxies are unavailable.');
}

// Check for cached publication data (for default/commonly accessed publications)
async function fetchCachedPublication(url) {
    const normalizedURL = url.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
    
    // Check if this is the default publication (rawandferal)
    if (normalizedURL.includes('rawandferal.substack.com') || normalizedURL === 'rawandferal.substack.com') {
        try {
            // Try to fetch cached JSON from GitHub or CDN
            // Using jsDelivr CDN for GitHub raw files (faster than raw.githubusercontent.com)
            const cacheURL = 'https://cdn.jsdelivr.net/gh/danielleegan/substack-print@main/cache/rawandferal.json';
            const response = await fetchWithTimeout(cacheURL, {}, 2000);
            if (response.ok) {
                const cachedData = await response.json();
                // Check if cache is fresh (less than 1 hour old)
                const cacheAge = Date.now() - (cachedData.timestamp || 0);
                if (cacheAge < 3600000) { // 1 hour
                    console.log('Using cached publication data');
                    return cachedData;
                } else {
                    console.log('Cache is stale, fetching fresh RSS');
                }
            }
        } catch (e) {
            // Cache fetch failed silently, continue to RSS (don't show error)
            console.log('Cache not available, using RSS feed');
        }
    }
    return null;
}

// Main function to process Substack URL
async function processSubstackURL(url) {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const newsletterContainer = document.getElementById('newsletter-container');
    const newsletterEl = document.getElementById('newsletter');
    
    // Show loading, hide error - keep loading visible while processing
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    newsletterContainer.classList.add('hidden');
    updateMobileElements(); // Hide mobile message and image
    
    // Update loading message to show we're working
    loadingEl.textContent = 'Loading articles...';
    
    try {
        // Extract publication name
        const publicationName = extractPublicationName(url);
        
        // Try cached data first (for faster loading of default publication)
        let feedData = null;
        let usedCache = false;
        try {
            const cachedData = await fetchCachedPublication(url);
            if (cachedData && cachedData.articles && cachedData.articles.length > 0) {
                feedData = cachedData;
                usedCache = true;
                console.log('Using cached publication data');
            }
        } catch (e) {
            // Cache fetch failed silently, continue to RSS
            console.log('Cache not available, fetching RSS');
        }
        
        // If cache didn't work, fetch from RSS
        if (!feedData) {
            loadingEl.textContent = 'Fetching RSS feed...';
            
            // Get RSS feed URL
            const rssURL = getRSSFeedURL(url);
            if (!rssURL) {
                throw new Error('Invalid Substack URL');
            }
            
            // Fetch RSS feed with fallback methods (this may take time)
            loadingEl.textContent = 'Getting your articles for ya, this may take a couple minutes!';
            const rssText = await fetchRSSFeed(rssURL);
            
            // Parse RSS feed
            loadingEl.textContent = 'Processing articles...';
            feedData = parseRSSFeed(rssText);
        }
        
        if (!feedData || feedData.articles.length === 0) {
            throw new Error('No articles found in RSS feed');
        }
        
        // Use publication title from feed, fallback to extracted name
        const pubTitle = feedData.publication.title || publicationName;
        
        // Convert establishedDate to Date object if it's a string (from cache)
        let establishedDate = feedData.publication.establishedDate;
        if (establishedDate && typeof establishedDate === 'string') {
            establishedDate = new Date(establishedDate);
        }
        
        const publication = {
            title: pubTitle,
            description: feedData.publication.description || '',
            establishedDate: establishedDate
        };
        
        // Limit to first 3 articles for front page
        const limitedArticles = feedData.articles.slice(0, 3);
        
        // Show newsletter container immediately (progressive rendering - show structure first)
        newsletterContainer.classList.remove('hidden');
        loadingEl.classList.add('hidden');
        updateMobileElements(); // Show/hide mobile message and image
        
        // Generate newsletter HTML (using existing function)
        const newsletterHTML = generateNewsletter(publication, limitedArticles);
        newsletterEl.innerHTML = newsletterHTML;
        
        // Apply mode immediately after rendering
        applyModeToPages();
        updatePageVisibility(); // Hide pages 2+ on mobile
        updateExampleImages(); // Update example images based on mode
        
        // After rendering, trim Article 1 content to fit on page 1, then split pages dynamically
        // Use a longer delay (500ms) to ensure horizontal bars are fully rendered and layout is stable
        setTimeout(() => {
            // Verify horizontal bars exist before measuring
            const firstPage = document.querySelector('.newsletter-page');
            if (firstPage) {
                const titleBars = firstPage.querySelectorAll('.article-title-bar-front');
                if (titleBars.length === 0) {
                    // Bars not rendered yet, wait a bit more
                    setTimeout(() => {
                        try {
                            trimArticle1ToFit();
                        } catch (e) {
                            console.error('Error in trimArticle1ToFit:', e);
                        }
                        
                        try {
                            optimizeLeftColumnContent(); // Optimize left column to fit maximum content
                        } catch (e) {
                            console.error('Error in optimizeLeftColumnContent:', e);
                        }
                    }, 100);
                    return;
                }
            }
            
            try {
                trimArticle1ToFit();
            } catch (e) {
                console.error('Error in trimArticle1ToFit:', e);
            }
            
            try {
                optimizeLeftColumnContent(); // Optimize left column to fit maximum content
            } catch (e) {
                console.error('Error in optimizeLeftColumnContent:', e);
            }
            
            // Run splitPagesDynamically after a delay to ensure optimizeLeftColumnContent has finished
            // Use a longer timeout to ensure it runs even if optimizeLeftColumnContent takes time
            setTimeout(() => {
                try {
                    splitPagesDynamically();
                    applyModeToPages(); // Apply mode after pages are split
                    updatePageVisibility(); // Hide pages 2+ on mobile
                    updateArticlePageReferences(limitedArticles);
                    adjustAllTitleSizes();
                    preventOrphanedHeadings(); // Prevent headings from being orphaned at bottom of columns
                    preventOrphanedImageCaptions(); // Prevent image captions from being orphaned
                    markFootnotesSections(); // Mark footnotes sections for spacing
                    
                    // Retry orphaned heading detection after a short delay to catch any that were missed
                    setTimeout(() => {
                        preventOrphanedHeadings();
                        addPageNumbers(); // Add page numbers to pages 2+
                    }, 100);
                } catch (e) {
                    console.error('Error in post-processing:', e);
                }
            }, 200);
        }, 500); // Increased initial delay (500ms) to ensure horizontal bars are fully rendered
        
        // Show newsletter, hide loading
        loadingEl.classList.add('hidden');
        newsletterContainer.classList.remove('hidden');
        updateMobileElements(); // Show/hide mobile message and image
        
        
        // Track successful newsletter generation
        if (typeof posthog !== 'undefined') {
            posthog.capture('newsletter_generated', {
                publication: pubTitle,
                article_count: limitedArticles.length,
                mode: getCurrentMode(),
                used_cache: usedCache
            });
        }
        
    } catch (error) {
        console.error('Error processing Substack URL:', error);
        loadingEl.classList.add('hidden');
        errorEl.textContent = 'Problem loading :( make sure your URL is formatted like "publicationname.substack.com" and if that doesn\'t work email me at bugs@substackprint.com';
        errorEl.classList.remove('hidden');
        
        // Track errors
        if (typeof posthog !== 'undefined') {
            posthog.capture('newsletter_error', {
                error_message: error.message,
                url: url
            });
        }
    }
}

// Reset form function
function resetForm() {
    document.getElementById('substack-form').reset();
    document.getElementById('newsletter-container').classList.add('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('newsletter').innerHTML = '';
    updateMobileElements(); // Hide mobile message and image
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function saveAsImage() {
    const newsletter = document.getElementById('newsletter');
    if (!newsletter) {
        alert('No newsletter to save');
        return;
    }

    try {
        // Check if html2canvas is available (would need to be loaded separately)
        if (typeof html2canvas !== 'undefined') {
            const canvas = await html2canvas(newsletter, {
                backgroundColor: '#ffffff',
                scale: 2,
                useCORS: true,
                logging: false
            });
            
            canvas.toBlob((blob) => {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'substack-newsletter.png';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 'image/png');
        } else {
            // Fallback: Create a data URL from SVG or use print
            // For now, guide user to use browser's print or screenshot
            const usePrint = confirm('For best results, use your browser\'s print function (Ctrl+P / Cmd+P) and save as PDF, then convert to image.\n\nAlternatively, you can take a screenshot of the newsletter.\n\nClick OK to open print dialog, or Cancel to dismiss.');
            if (usePrint) {
                window.print();
            }
        }
    } catch (error) {
        console.error('Error saving as image:', error);
        alert('Error saving as image. Please use your browser\'s print function (Ctrl+P / Cmd+P) or take a screenshot.');
    }
}

// Form submission handler
document.getElementById('substack-form').addEventListener('submit', (e) => {
    e.preventDefault();
    let url = document.getElementById('substack-url').value.trim();
    
    url = normalizeURL(url);
    
    if (url) {
        // Track form submission
        if (typeof posthog !== 'undefined') {
            posthog.capture('newsletter_requested', {
                url: url
            });
        }
        
        processSubstackURL(url);
    }
});

// Function to adjust title font size to fit in max 2 lines (only for page 1)
function adjustTitleFontSize(titleElement) {
    // Only adjust titles on the first page
    const firstPage = document.querySelector('.newsletter-page');
    if (!firstPage || !firstPage.contains(titleElement)) {
        return;
    }
    
    const container = titleElement.parentElement;
    const containerWidth = container.offsetWidth;
    const maxLines = 2;
    
    // Get computed styles
    const computedStyle = getComputedStyle(titleElement);
    const baseFontSize = parseFloat(computedStyle.fontSize);
    const fontFamily = computedStyle.fontFamily;
    const fontWeight = computedStyle.fontWeight;
    const letterSpacing = computedStyle.letterSpacing;
    const lineHeight = parseFloat(computedStyle.lineHeight);
    const paddingBottom = parseFloat(computedStyle.paddingBottom);
    
    // Create a temporary element to measure actual rendered height (text only, no padding)
    const temp = titleElement.cloneNode(true);
    temp.style.visibility = 'hidden';
    temp.style.position = 'absolute';
    temp.style.width = containerWidth + 'px';
    temp.style.height = 'auto';
    temp.style.fontSize = '';
    temp.style.whiteSpace = 'normal';
    temp.style.wordWrap = 'break-word';
    temp.style.overflow = 'visible';
    temp.style.paddingBottom = '0'; // Remove padding for measurement
    temp.style.marginBottom = '0';
    temp.style.marginTop = '0';
    document.body.appendChild(temp);
    
    // Binary search for optimal font size
    const minFontSize = baseFontSize * 0.6; // 60% of base
    const maxFontSize = baseFontSize * 2.0; // 200% of base
    let bestSize = baseFontSize;
    
    // Binary search
    let low = minFontSize;
    let high = maxFontSize;
    
    for (let i = 0; i < 20; i++) {
        const mid = (low + high) / 2;
        temp.style.fontSize = mid + 'px';
        
        // Force reflow
        temp.offsetHeight;
        
        // Measure only the text height (without padding)
        const actualHeight = temp.scrollHeight;
        const maxHeight = lineHeight * maxLines;
        
        if (actualHeight <= maxHeight) {
            bestSize = mid;
            low = mid;
        } else {
            high = mid;
        }
        
        // Stop if we're close enough
        if (high - low < 1) break;
    }
    
    document.body.removeChild(temp);
    
    // Apply the best size (padding will remain as set in CSS)
    titleElement.style.fontSize = bestSize + 'px';
}

// Trim Article 1 content on page 1 to fit within available space
function trimArticle1ToFit() {
    try {
    const firstPage = document.querySelector('.newsletter-page');
    if (!firstPage) {
        console.log('trimArticle1ToFit: No first page found');
        return;
    }
    
    const article1Content = firstPage.querySelector('.article-content-right');
    if (!article1Content) {
        console.log('trimArticle1ToFit: No article-content-right found');
        return;
    }
    
    const articleColRight = firstPage.querySelector('.article-col-right');
    if (!articleColRight) {
        console.log('trimArticle1ToFit: No article-col-right found');
        return;
    }
    
    // Get the max height available - account for page padding (0.25in = 18px at 72dpi, but use actual computed)
    const newsletterContent = firstPage.querySelector('.newsletter-content');
    const pagePadding = parseFloat(getComputedStyle(firstPage).paddingTop) + parseFloat(getComputedStyle(firstPage).paddingBottom);
    const masthead = firstPage.querySelector('.newsletter-masthead');
    const mastheadHeight = masthead ? masthead.offsetHeight : 0;
    
    // Page height minus padding minus masthead
    const pageHeight = parseFloat(getComputedStyle(firstPage).height);
    const maxContentHeight = pageHeight - pagePadding - mastheadHeight;
    
    // Force reflow to ensure all elements are rendered before measuring
    articleColRight.offsetHeight;
    
    // Calculate used height by other elements in Article 1 column
    const image = articleColRight.querySelector('.featured-image');
    const title = articleColRight.querySelector('.article-title');
    const subtitle = articleColRight.querySelector('.article-subtitle');
    const description = articleColRight.querySelector('.article-description');
    const continued = articleColRight.querySelector('.article-continued');
    const titleBar = articleColRight.querySelector('.article-title-bar-front');
    
    // Calculate used height for fixed elements
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
        // Use fixed height for horizontal bar: 1px height + 1.5px margin-top + 12px margin-bottom = 14.5px total
        // This avoids timing issues with measurement that cause content to jump
        usedHeight += 14.5; // Fixed height for article-title-bar-front
    }
    if (subtitle) {
        const subtitleStyle = getComputedStyle(subtitle);
        usedHeight += subtitle.offsetHeight + parseFloat(subtitleStyle.marginTop) + parseFloat(subtitleStyle.marginBottom);
    }
    if (description) {
        const descStyle = getComputedStyle(description);
        usedHeight += description.offsetHeight + parseFloat(descStyle.marginTop) + parseFloat(descStyle.marginBottom);
    }
    if (continued) {
        const contStyle = getComputedStyle(continued);
        usedHeight += continued.offsetHeight + parseFloat(contStyle.marginTop) + parseFloat(contStyle.marginBottom);
    }
    
    const availableHeight = maxContentHeight - usedHeight - 30; // 30px safety margin to prevent cutoff
    
    // Force a final reflow to ensure accurate measurement
    articleColRight.offsetHeight;
    article1Content.offsetHeight;
    
    // Get the actual rendered height of the content
    const actualContentHeight = article1Content.scrollHeight;
    
    console.log('trimArticle1ToFit: maxContentHeight:', maxContentHeight, 'usedHeight:', usedHeight, 'availableHeight:', availableHeight);
    console.log('trimArticle1ToFit: article1Content.scrollHeight:', actualContentHeight);
    
    // Check if content actually overflows - add a small tolerance to prevent unnecessary trimming
    // Only trim if content is significantly overflowing (more than 10px) to prevent jumping
    if (actualContentHeight > availableHeight + 10) {
        console.log('trimArticle1ToFit: Content overflows by', (actualContentHeight - availableHeight).toFixed(0), 'px, trimming...');
        
        // Content overflows - need to trim it
        const elements = Array.from(article1Content.children);
        let fittingContent = '';
        let remainingContent = '';
        
        // Create a temporary container to measure height with same styles
        const tempContainer = document.createElement('div');
        tempContainer.className = 'article-content-right';
        tempContainer.style.position = 'absolute';
        tempContainer.style.visibility = 'hidden';
        tempContainer.style.width = article1Content.offsetWidth + 'px';
        tempContainer.style.height = 'auto';
        tempContainer.style.fontSize = getComputedStyle(article1Content).fontSize;
        tempContainer.style.lineHeight = getComputedStyle(article1Content).lineHeight;
        document.body.appendChild(tempContainer);
        
        try {
            for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            const elementHTML = element.outerHTML;
            
            // Test if adding this element would exceed available height
            tempContainer.innerHTML = fittingContent + elementHTML;
            // Force reflow
            tempContainer.offsetHeight;
            const testHeight = tempContainer.scrollHeight;
            
            console.log('trimArticle1ToFit: Element', i, 'testHeight:', testHeight, 'availableHeight:', availableHeight);
            
            if (testHeight <= availableHeight) {
                // This element fits
                fittingContent += elementHTML;
            } else {
                // This element doesn't fit - try to split it
                if (element.tagName === 'P') {
                    // Split paragraph by words - it's OK to split mid-sentence
                    const text = element.textContent;
                    const words = text.split(/\s+/);
                    
                    let fittingText = '';
                    let fittingWords = [];
                    
                    // Try adding words one by one until we exceed available height
                    for (let j = 0; j < words.length; j++) {
                        const testWords = [...fittingWords, words[j]];
                        const testText = testWords.join(' ');
                        tempContainer.innerHTML = fittingContent + `<p>${testText}</p>`;
                        tempContainer.offsetHeight; // Force reflow
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
                        // Even first word doesn't fit - skip this paragraph entirely
                        remainingContent += elementHTML;
                    }
                } else {
                    // Non-paragraph element doesn't fit - add to remaining
                    remainingContent += elementHTML;
                }
                
                // Add remaining elements to remainingContent
                for (let j = i + 1; j < elements.length; j++) {
                    remainingContent += elements[j].outerHTML;
                }
                break;
            }
            }
        } finally {
            // Always remove temp container
            if (tempContainer && tempContainer.parentNode) {
                document.body.removeChild(tempContainer);
            }
        }
        
        console.log('trimArticle1ToFit: Fitting content length:', fittingContent.length, 'Remaining content length:', remainingContent.length);
        
        // Update the content
        article1Content.innerHTML = fittingContent;
        
        // Update article1RemainingContent for page 2+
        // Find the page 2 content div and prepend the remaining content
        const pages = document.querySelectorAll('.newsletter-page');
        if (pages.length > 1 && remainingContent) {
            const page2 = pages[1];
            const page2Content = page2.querySelector('.article-columns-three-css');
            if (page2Content) {
                page2Content.innerHTML = remainingContent + page2Content.innerHTML;
                console.log('trimArticle1ToFit: Added remaining content to page 2');
            }
        }
    } else {
        console.log('trimArticle1ToFit: Content fits, no trimming needed');
        // Force a final reflow to ensure layout is stable
        articleColRight.offsetHeight;
        article1Content.offsetHeight;
    }
    } catch (error) {
        console.error('trimArticle1ToFit error:', error);
        // Don't let this break the newsletter generation
    }
}

// Optimize left column content to fit as much as possible based on available space
// Balanced approach: Article 2 and Article 3 get approximately equal space
function optimizeLeftColumnContent() {
    try {
        const firstPage = document.querySelector('.newsletter-page');
        if (!firstPage) {
            console.log('optimizeLeftColumnContent: No first page found');
            return;
        }
        
        const articleColLeft = firstPage.querySelector('.article-col-left');
        if (!articleColLeft) {
            console.log('optimizeLeftColumnContent: No article-col-left found');
            return;
        }
        
        // Get available height for left column - measure directly on the page
        const pagePadding = parseFloat(getComputedStyle(firstPage).paddingTop) + parseFloat(getComputedStyle(firstPage).paddingBottom);
        const masthead = firstPage.querySelector('.newsletter-masthead');
        const mastheadHeight = masthead ? masthead.offsetHeight : 0;
        const pageHeight = parseFloat(getComputedStyle(firstPage).height);
        const maxContentHeight = pageHeight - pagePadding - mastheadHeight;
        
        // Get all article sections
        const articleSections = Array.from(articleColLeft.querySelectorAll('.article-section'));
        
        if (articleSections.length === 0) {
            console.log('optimizeLeftColumnContent: No article sections found');
            return;
        }
        
        // Ensure "See Page X" messages exist for all sections
        articleSections.forEach((section, idx) => {
            let continuedMsg = section.querySelector('.article-continued');
            if (!continuedMsg) {
                const existingMsg = section.textContent.match(/See Page (\d+)/);
                const pageNum = existingMsg ? existingMsg[1] : (idx === 0 ? 2 : 3);
                continuedMsg = document.createElement('div');
                continuedMsg.className = 'article-continued';
                continuedMsg.textContent = `See Page ${pageNum}`;
                section.appendChild(continuedMsg);
            }
        });
        
        // Step 1: Calculate total fixed height (titles, images, captions, "See Page X") for all articles
        // Clear all snippets temporarily to measure only fixed elements
        articleSections.forEach((section) => {
            const snippet = section.querySelector('.article-snippet');
            if (snippet) {
                snippet.innerHTML = ''; // Clear to measure fixed elements only
            }
        });
        
        // Force reflow to ensure horizontal bars and all elements are fully rendered before measuring
        articleColLeft.offsetHeight;
        // Also force reflow on title bars to ensure they're measured accurately
        articleSections.forEach((section) => {
            const titleBar = section.querySelector('.article-title-bar-front');
            if (titleBar) {
                titleBar.offsetHeight;
            }
        });
        
        // Measure total fixed height (all sections with empty snippets)
        articleColLeft.offsetHeight; // Force reflow again before measuring
        const totalFixedHeight = articleColLeft.scrollHeight;
        
        // Step 2: Calculate available space for snippets
        // Include subtitles in fixed height - they should already be in scrollHeight, but verify
        articleSections.forEach(section => {
            const subtitle = section.querySelector('.article-subtitle');
            if (subtitle) {
                // Subtitle is already included in scrollHeight, but we verify it exists
            }
        });
        
        const availableSnippetHeight = maxContentHeight - totalFixedHeight - 60; // 60px safety margin to prevent cutoff
        
        // Step 3: Allocate approximately equal space to each article's snippet
        const snippetHeightPerArticle = Math.floor(availableSnippetHeight / articleSections.length);
        
        // Helper function to fill a snippet, measuring directly on the page
        function fillSnippet(sectionIndex, paragraphs) {
            const section = articleSections[sectionIndex];
            const snippet = section.querySelector('.article-snippet');
            if (!snippet) return '';
            
            let fittingHTML = '';
            
            for (let i = 0; i < paragraphs.length; i++) {
                const paragraph = paragraphs[i];
                const paragraphHTML = paragraph.outerHTML;
                const testHTML = fittingHTML + paragraphHTML;
                
                // Update snippet directly on page
                snippet.innerHTML = testHTML;
                articleColLeft.offsetHeight; // Force reflow
                
                // Measure total column height directly on page
                const currentHeight = articleColLeft.scrollHeight;
                
                // Check if it fits (with safety margin)
                if (currentHeight <= maxContentHeight - 60) {
                    fittingHTML = testHTML;
                } else {
                    // Revert to last fitting HTML
                    snippet.innerHTML = fittingHTML;
                    
                    // Try splitting paragraph by words
                    const text = paragraph.textContent;
                    const words = text.split(/\s+/);
                    
                    let fittingWords = [];
                    for (let j = 0; j < words.length; j++) {
                        const testWords = [...fittingWords, words[j]];
                        const testText = testWords.join(' ');
                        const wordTestHTML = fittingHTML + `<p>${testText}</p>`;
                        
                        snippet.innerHTML = wordTestHTML;
                        articleColLeft.offsetHeight;
                        const wordTestHeight = articleColLeft.scrollHeight;
                        
                        if (wordTestHeight <= maxContentHeight - 60) {
                            fittingWords.push(words[j]);
                        } else {
                            break;
                        }
                    }
                    
                    if (fittingWords.length > 0) {
                        fittingHTML += `<p>${fittingWords.join(' ')}</p>`;
                        snippet.innerHTML = fittingHTML;
                    }
                    break;
                }
            }
            
            return fittingHTML;
        }
        
        // Step 4: Fill articles with content, alternating to balance space approximately equally
        // Parse all article content first
        const articleParagraphs = [];
        articleSections.forEach((section) => {
            const fullContent = section.getAttribute('data-full-content');
            if (fullContent) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = fullContent;
                const paragraphs = Array.from(tempDiv.querySelectorAll('p'));
                articleParagraphs.push(paragraphs);
            } else {
                articleParagraphs.push([]);
            }
        });
        
        // Track current paragraph index for each article
        const paragraphIndices = new Array(articleSections.length).fill(0);
        let currentArticleIndex = 0;
        let hasMoreContent = true;
        let iterationsWithoutProgress = 0;
        const maxIterations = 1000; // Safety limit to prevent infinite loops
        
        // Alternate between articles, adding one paragraph at a time
        for (let iteration = 0; iteration < maxIterations && hasMoreContent; iteration++) {
            hasMoreContent = false;
            let progressMade = false;
            
            // Try to add a paragraph to the current article
            const section = articleSections[currentArticleIndex];
            const snippet = section.querySelector('.article-snippet');
            const paragraphs = articleParagraphs[currentArticleIndex];
            const currentIndex = paragraphIndices[currentArticleIndex];
            
            if (snippet && paragraphs && currentIndex < paragraphs.length) {
                const paragraph = paragraphs[currentIndex];
                const paragraphHTML = paragraph.outerHTML;
                const currentHTML = snippet.innerHTML;
                const testHTML = currentHTML + paragraphHTML;
                
                // Update snippet
                snippet.innerHTML = testHTML;
                articleColLeft.offsetHeight; // Force reflow
                
                // Measure total column height
                const currentHeight = articleColLeft.scrollHeight;
                
                if (currentHeight <= maxContentHeight - 50) {
                    // It fits, keep it
                    paragraphIndices[currentArticleIndex]++;
                    progressMade = true;
                } else {
                    // Doesn't fit, revert and try splitting
                    snippet.innerHTML = currentHTML;
                    
                    const text = paragraph.textContent;
                    const words = text.split(/\s+/);
                    let fittingWords = [];
                    
                    for (let j = 0; j < words.length; j++) {
                        const testWords = [...fittingWords, words[j]];
                        const testText = testWords.join(' ');
                        const wordTestHTML = currentHTML + `<p>${testText}</p>`;
                        
                        snippet.innerHTML = wordTestHTML;
                        articleColLeft.offsetHeight;
                        const wordTestHeight = articleColLeft.scrollHeight;
                        
                        if (wordTestHeight <= maxContentHeight - 60) {
                            fittingWords.push(words[j]);
                        } else {
                            break;
                        }
                    }
                    
                    if (fittingWords.length > 0) {
                        snippet.innerHTML = currentHTML + `<p>${fittingWords.join(' ')}</p>`;
                        paragraphIndices[currentArticleIndex]++;
                        progressMade = true;
                    }
                    // This article is done, but others might have more content
                }
            }
            
            // Check if other articles have more content
            for (let i = 0; i < articleSections.length; i++) {
                if (paragraphIndices[i] < articleParagraphs[i].length) {
                    hasMoreContent = true;
                    break;
                }
            }
            
            // Track progress
            if (progressMade) {
                iterationsWithoutProgress = 0;
            } else {
                iterationsWithoutProgress++;
                // If we've gone through all articles multiple times without progress, stop
                if (iterationsWithoutProgress >= articleSections.length * 2) {
                    break;
                }
            }
            
            // Move to next article (round-robin)
            currentArticleIndex = (currentArticleIndex + 1) % articleSections.length;
        }
        
        if (iterationsWithoutProgress >= articleSections.length * 2) {
            console.log('optimizeLeftColumnContent: Stopped due to no progress');
        }
        
        // Final verification: Ensure nothing is cut off
        articleColLeft.offsetHeight;
        const finalHeight = articleColLeft.scrollHeight;
        
        if (finalHeight > maxContentHeight - 60) {
            console.log(`optimizeLeftColumnContent: Column still overflowing (${finalHeight} > ${maxContentHeight - 60}), trimming from end...`);
            
            // Trim from the last article backwards until it fits
            for (let sectionIndex = articleSections.length - 1; sectionIndex >= 0; sectionIndex--) {
                const section = articleSections[sectionIndex];
                const snippet = section.querySelector('.article-snippet');
                if (!snippet) continue;
                
                const paragraphs = snippet.querySelectorAll('p');
                if (paragraphs.length === 0) continue;
                
                // Remove paragraphs one by one from the end
                let trimmedHTML = '';
                for (let pIdx = 0; pIdx < paragraphs.length - 1; pIdx++) {
                    trimmedHTML += paragraphs[pIdx].outerHTML;
                }
                
                snippet.innerHTML = trimmedHTML;
                articleColLeft.offsetHeight;
                const testHeight = articleColLeft.scrollHeight;
                
                if (testHeight <= maxContentHeight - 60) {
                    break; // It fits now, stop trimming
                }
            }
        }
        
        // Fix widows (single words at end of line) for articles 2 and 3
        fixWidowsInSnippets(articleSections);
        
    } catch (error) {
        console.error('optimizeLeftColumnContent error:', error);
        // Don't let this break the newsletter generation
    }
}

// Fix widows (single words at end of line) in article snippets
function fixWidowsInSnippets(articleSections) {
    articleSections.forEach(section => {
        const snippet = section.querySelector('.article-snippet');
        if (!snippet) return;
        
        const paragraphs = snippet.querySelectorAll('p');
        if (paragraphs.length === 0) return;
        
        // Check the last paragraph
        const lastParagraph = paragraphs[paragraphs.length - 1];
        const text = lastParagraph.textContent || '';
        const words = text.trim().split(/\s+/);
        
        // If the last paragraph has only one word, remove it
        if (words.length === 1) {
            // Remove the last paragraph
            lastParagraph.remove();
            return;
        }
        
        // Check if the last line has only one word
        // We can't directly measure lines, but we can check if removing the last word
        // would prevent a widow
        if (words.length > 1) {
            // Try removing the last word and see if it still looks good
            const textWithoutLastWord = words.slice(0, -1).join(' ');
            if (textWithoutLastWord.trim().length > 0) {
                // Update the paragraph text to remove the last word
                lastParagraph.textContent = textWithoutLastWord.trim();
            }
        }
    });
}

// Adjust all title sizes after newsletter is generated (only page 1)
function adjustAllTitleSizes() {
    setTimeout(() => {
        const firstPage = document.querySelector('.newsletter-page');
        if (firstPage) {
            const titles = firstPage.querySelectorAll('.article-title');
            titles.forEach(title => {
                adjustTitleFontSize(title);
                
                // Add class to title if it has a subtitle (for CSS styling)
                const subtitle = title.nextElementSibling;
                if (subtitle && subtitle.classList.contains('article-subtitle')) {
                    title.classList.add('has-subtitle');
                } else {
                    title.classList.add('no-subtitle');
                }
            });
        }
    }, 200);
}

// Split pages dynamically - CSS columns handle natural flow, we just need to create pages when content overflows
function splitPagesDynamically() {
    const pages = document.querySelectorAll('.newsletter-page');
    console.log('splitPagesDynamically called, found', pages.length, 'pages');
    
    // Ensure all pages are visible (but hide pages 2+ on mobile)
    pages.forEach((p, idx) => {
        // On mobile, only show first page; on desktop, show all pages
        if (!isMobile() || idx === 0) {
            p.style.display = 'flex';
        } else {
            p.style.display = 'none';
        }
        const contentDiv = p.querySelector('.article-columns-three-css');
        if (contentDiv) {
            contentDiv.style.display = 'block';
        }
    });
    
    // If we only have 2 pages and the second page has a lot of content, we need to split it
    // Let's check if page 2 (index 1) has overflow
    
    // Process pages in reverse order to avoid issues with DOM changes
    for (let pageIndex = pages.length - 1; pageIndex >= 0; pageIndex--) {
        const page = pages[pageIndex];
        
        // Skip page 1 (front page with special layout)
        if (pageIndex === 0) continue;
        
        const contentDiv = page.querySelector('.article-columns-three-css');
        if (!contentDiv) {
            console.log('No contentDiv found for page', pageIndex);
            continue;
        }
        
        const contentArea = page.querySelector('.newsletter-content');
        if (!contentArea) {
            console.log('No contentArea found for page', pageIndex);
            continue;
        }
        
        // Get max height for content area (page height minus masthead)
        const maxHeight = parseFloat(getComputedStyle(contentArea).maxHeight);
        console.log('Page', pageIndex, 'maxHeight:', maxHeight);
        if (!maxHeight) continue;
        
        // Check if content overflows
        // CSS columns with overflow:hidden clips content, so scrollHeight might equal clientHeight
        // We need to temporarily remove overflow to measure actual content height
        const originalOverflow = contentDiv.style.overflow;
        const originalMaxHeight = contentDiv.style.maxHeight;
        
        // Temporarily allow overflow to measure actual content height
        contentDiv.style.overflow = 'visible';
        contentDiv.style.maxHeight = 'none';
        
        // Force reflow
        contentDiv.offsetHeight;
        
        const contentHeight = contentDiv.scrollHeight;
        const containerHeight = contentArea.clientHeight || maxHeight;
        
        // Restore original styles
        contentDiv.style.overflow = originalOverflow;
        contentDiv.style.maxHeight = originalMaxHeight;
        
        const elementCount = contentDiv.children.length;
        const overflowRatio = contentHeight / containerHeight;
        
        console.log('Page', pageIndex, 'contentHeight:', contentHeight, 'containerHeight:', containerHeight, 'ratio:', overflowRatio.toFixed(2), 'elements:', elementCount);
        
        // Check if content overflows - if so, split into multiple pages
        // Use a threshold that accounts for CSS column balancing
        const hasOverflow = contentHeight > containerHeight * 1.05; // 5% tolerance for column balancing
        
        if (hasOverflow) {
            console.log('Content overflows on page', pageIndex, '- splitting. Content height:', contentHeight, 'Container height:', containerHeight, 'Elements:', elementCount);
            
            // Content overflows - split into multiple pages
            // Get all child elements
            const elements = Array.from(contentDiv.children);
            console.log('Found', elements.length, 'elements to split');
            if (elements.length === 0) continue;
            
            // Create pages by grouping elements, measuring as we go
            let currentPage = page;
            let currentContentDiv = contentDiv;
            let currentPageContent = '';
            let pagesCreated = 0;
            
            for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                const elementHTML = element.outerHTML;
                const isLastElement = i === elements.length - 1;
                
                // Test if adding this element would cause overflow
                const testContent = currentPageContent + elementHTML;
                
                // Create a temporary div to measure height
                const testDiv = document.createElement('div');
                testDiv.className = 'article-columns-three-css';
                testDiv.style.position = 'absolute';
                testDiv.style.visibility = 'hidden';
                testDiv.style.width = contentDiv.offsetWidth + 'px';
                testDiv.style.height = 'auto';
                testDiv.style.fontSize = getComputedStyle(contentDiv).fontSize;
                testDiv.style.lineHeight = getComputedStyle(contentDiv).lineHeight;
                testDiv.style.maxHeight = maxHeight + 'px';
                testDiv.style.overflow = 'visible';
                testDiv.innerHTML = testContent;
                document.body.appendChild(testDiv);
                
                // Force reflow
                testDiv.offsetHeight;
                
                // Check if content overflows
                const testMaxHeight = testDiv.style.maxHeight;
                testDiv.style.maxHeight = 'none';
                const testHeight = testDiv.scrollHeight;
                testDiv.style.maxHeight = testMaxHeight;
                document.body.removeChild(testDiv);
                
                // If adding this element causes overflow, create a new page
                // Always create a new page if content exceeds maxHeight (even slightly)
                // This ensures content flows to next page instead of being clipped
                // Include last element in this check to ensure it gets its own page if needed
                if (testHeight > maxHeight) {
                    // If current page already has content, finalize it and create new page
                    if (currentPageContent.trim() !== '') {
                        console.log('Creating new page after element', i, 'testHeight:', testHeight, 'maxHeight:', maxHeight);
                        
                        // Set current page content (without the element that caused overflow)
                        currentContentDiv.innerHTML = currentPageContent;
                        
                        // Create new page with proper structure
                        const newPage = page.cloneNode(false);
                        const newContentArea = contentArea.cloneNode(false);
                        const newContentDiv = document.createElement('div');
                        newContentDiv.className = 'article-columns-three-css';
                        newContentDiv.style.width = '100%';
                        newContentDiv.style.maxWidth = '100%';
                        newContentDiv.innerHTML = '';
                        newContentArea.appendChild(newContentDiv);
                        newPage.appendChild(newContentArea);
                        currentPage.parentNode.insertBefore(newPage, currentPage.nextSibling);
                        
                        // Force reflow
                        newPage.offsetHeight;
                        newContentDiv.offsetHeight;
                        
                        // Move to new page
                        currentPage = newPage;
                        currentContentDiv = newContentDiv;
                        currentPageContent = elementHTML; // Start new page with the element that overflowed
                        pagesCreated++;
                    } else {
                        // Current page is empty but element overflows - add it anyway
                        // This handles edge case where a single large element exceeds page height
                        currentPageContent += elementHTML;
                    }
                } else {
                    // Element fits - add it to current page
                    currentPageContent += elementHTML;
                }
            }
            
            // CRITICAL: Always set final page content
            // This ensures the last page displays even with minimal content
            console.log('Setting final page content. currentPageContent length:', currentPageContent ? currentPageContent.length : 0);
            
            // Ensure we have a valid content div reference
            if (!currentContentDiv || !currentContentDiv.parentNode) {
                console.error('ERROR: currentContentDiv is invalid! Attempting recovery...');
                const allPages = document.querySelectorAll('.newsletter-page');
                console.log('Total pages found:', allPages.length);
                if (allPages.length > 0) {
                    const lastPage = allPages[allPages.length - 1];
                    currentContentDiv = lastPage.querySelector('.article-columns-three-css');
                    if (!currentContentDiv) {
                        const contentArea = lastPage.querySelector('.newsletter-content');
                        if (contentArea) {
                            currentContentDiv = document.createElement('div');
                            currentContentDiv.className = 'article-columns-three-css';
                            currentContentDiv.style.width = '100%';
                            currentContentDiv.style.maxWidth = '100%';
                            contentArea.appendChild(currentContentDiv);
                            console.log('Created new contentDiv for final page');
                        }
                    }
                    currentPage = lastPage;
                }
            }
            
            // Set final page content - this should always have content since we add elements one by one
            if (currentPageContent && currentPageContent.trim() !== '' && currentContentDiv) {
                currentContentDiv.innerHTML = currentPageContent;
                console.log('Successfully set final page content');
            } else {
                console.warn('WARNING: Final page content was empty');
            }
            
            // Ensure pages are visible
            if (currentContentDiv) {
                currentContentDiv.style.display = 'block';
                if (currentContentDiv.parentNode) {
                    currentContentDiv.parentNode.style.display = 'flex';
                }
                currentContentDiv.offsetHeight; // Force reflow
            }
            
            if (currentPage && currentPage.parentNode) {
                // On mobile, only show first page; on desktop, show all pages
                const pageIndex = Array.from(document.querySelectorAll('.newsletter-page')).indexOf(currentPage);
                if (!isMobile() || pageIndex === 0) {
                    currentPage.style.display = 'flex';
                } else {
                    currentPage.style.display = 'none';
                }
                currentPage.offsetHeight; // Force reflow
            }
            
            console.log('Created', pagesCreated, 'new pages. Total elements processed:', elements.length);
            
            // Final verification: Ensure all elements were processed
            const finalPages = document.querySelectorAll('.newsletter-page');
            let totalElementsInPages = 0;
            for (let p = 1; p < finalPages.length; p++) { // Skip page 1
                const pageContentDiv = finalPages[p].querySelector('.article-columns-three-css');
                if (pageContentDiv) {
                    totalElementsInPages += pageContentDiv.children.length;
                }
            }
            console.log('Verification: Original elements:', elements.length, 'Elements in pages:', totalElementsInPages);
            if (totalElementsInPages < elements.length) {
                console.warn('WARNING: Some elements may have been lost during page splitting!');
            }
        } else {
            console.log('No overflow detected on page', pageIndex);
            // Even if no overflow, ensure the page content is set and visible
            if (contentDiv && contentDiv.children.length > 0) {
                console.log('Page', pageIndex, 'has', contentDiv.children.length, 'elements, content should be visible');
                // Force a reflow to ensure content displays
                contentDiv.offsetHeight;
                if (page) {
                    // On mobile, only show first page; on desktop, show all pages
                    const pageIndex = Array.from(document.querySelectorAll('.newsletter-page')).indexOf(page);
                    if (!isMobile() || pageIndex === 0) {
                        page.style.display = 'flex';
                    } else {
                        page.style.display = 'none';
                    }
                    page.offsetHeight;
                }
            } else {
                console.log('Warning: Page', pageIndex, 'has no content elements');
            }
        }
    }
    
    // Final safeguard: Ensure the last page always displays
    const allPagesAfter = document.querySelectorAll('.newsletter-page');
    console.log('Final safeguard - Total pages after processing:', allPagesAfter.length);
    if (allPagesAfter.length > 1) {
        const lastPage = allPagesAfter[allPagesAfter.length - 1];
        const lastContentDiv = lastPage.querySelector('.article-columns-three-css');
        console.log('Last page:', lastPage, 'Content div:', lastContentDiv);
        
        if (lastContentDiv) {
            const elementCount = lastContentDiv.children.length;
            const contentHTML = lastContentDiv.innerHTML.trim();
            console.log('Last page has', elementCount, 'elements, content length:', contentHTML.length);
            
            // Ensure page is visible (but hide pages 2+ on mobile)
            const lastPageIndex = Array.from(document.querySelectorAll('.newsletter-page')).indexOf(lastPage);
            if (!isMobile() || lastPageIndex === 0) {
                lastPage.style.display = 'flex';
            } else {
                lastPage.style.display = 'none';
            }
            lastContentDiv.style.display = 'block';
            
            // Force reflow to ensure content renders
            lastPage.offsetHeight;
            lastContentDiv.offsetHeight;
            
            // Verify content exists
            if (contentHTML.length === 0 && elementCount === 0) {
                console.warn('WARNING: Last page is empty - this may indicate content was lost during splitting');
            } else {
                console.log('Last page content confirmed with', elementCount, 'elements');
            }
        } else {
            console.error('ERROR: Last page has no content div!');
        }
    }
}

// Update page references on front page to point to actual pages where articles start
function updateArticlePageReferences(articles) {
    const pages = document.querySelectorAll('.newsletter-page');
    if (pages.length < 2) return; // Need at least page 1 and page 2
    
    // Find where each article starts (skip page 1, which is the front page)
    const articlePages = {};
    
    // Start from page 2 (index 1)
    for (let pageIndex = 1; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        const contentDiv = page.querySelector('.article-columns-three-css');
        if (!contentDiv) continue;
        
        // Check for article titles (h2 with class article-title)
        const articleTitles = contentDiv.querySelectorAll('h2.article-title');
        
        articleTitles.forEach(titleEl => {
            const titleText = titleEl.textContent.trim();
            // Find which article this title belongs to
            for (let i = 1; i < articles.length; i++) {
                if (articles[i].title === titleText) {
                    // Page number is pageIndex + 1 (since pages are 1-indexed)
                    if (!articlePages[i + 1]) {
                        articlePages[i + 1] = pageIndex + 1;
                    }
                }
            }
        });
    }
    
    // Update front page references
    const frontPage = pages[0];
    const continuedElements = frontPage.querySelectorAll('.article-continued');
    
    // Article 2 reference (first continued element in left column)
    if (articlePages[2] && continuedElements.length >= 1) {
        continuedElements[0].textContent = `See Page ${articlePages[2]}`;
    }
    
    // Article 3 reference (second continued element in left column)
    if (articlePages[3] && continuedElements.length >= 2) {
        continuedElements[1].textContent = `See Page ${articlePages[3]}`;
    }
}

// Final pass: Ensure footnotes are normalized in rendered DOM (safety check)
// CRITICAL: Remove ALL line breaks from footnotes to ensure single-line rendering
function fixFootnoteLineBreaks(element) {
    // Process list items - ensure no newlines between number and text
    const listItems = element.querySelectorAll('li');
    listItems.forEach(li => {
        // Remove all <br> tags first
        li.querySelectorAll('br').forEach(br => br.remove());
        
        const text = li.textContent || '';
        
        // Pattern: number at start, followed by newline, followed by text
        // This should never happen after normalization, but check anyway
        const pattern = /^(\d+)\.?\s*\n+\s*(.+)$/m;
        const match = text.match(pattern);
        
        if (match) {
            const number = match[1];
            let footnoteText = match[2].trim();
            // Remove all line breaks from the text
            footnoteText = footnoteText.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
            // Replace with single-line format: "N. text"
            li.textContent = number + '. ' + footnoteText;
        } else {
            // Even if no pattern match, ensure no line breaks exist in the text
            const normalizedText = text.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
            if (normalizedText !== text) {
                li.textContent = normalizedText;
            }
        }
        
        // Also check HTML for <br> tags between number and text
        const html = li.innerHTML || '';
        const brPattern = /^(\d+)\.?\s*(<br\s*\/?>|\n)+\s*([^<\n]+)/i;
        const brMatch = html.match(brPattern);
        if (brMatch) {
            const number = brMatch[1];
            let footnoteText = brMatch[3].trim();
            // Remove all line breaks
            footnoteText = footnoteText.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
            li.textContent = number + '. ' + footnoteText;
        }
    });
    
    // Process text nodes for any remaining patterns
    const walker = document.createTreeWalker(
        element,
        NodeFilter.SHOW_TEXT,
        null,
        false
    );
    
    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
        textNodes.push(node);
    }
    
    textNodes.forEach(textNode => {
        const text = textNode.textContent;
        // Pattern: number followed by newline(s) and text
        const pattern = /(\d+)\.?\s*\n+\s*([^\n]+)/g;
        const newText = text.replace(pattern, (match, number, text) => {
            const trimmedText = text.trim();
            if (trimmedText.length > 0 && trimmedText.length < 2000) {
                return number + '. ' + trimmedText;
            }
            return match;
        });
        
        if (newText !== text) {
            textNode.textContent = newText;
        }
    });
}

// Mark footnotes sections and add spacing before them, and style footnotes properly
function markFootnotesSections() {
    const pages = document.querySelectorAll('.newsletter-page');
    
    // FIRST PASS: Collect ALL footnote numbers from ALL pages BEFORE processing references
    // But footnotes sections might not be fully processed yet, so we need to look for them more broadly
    const allActualFootnoteNumbers = new Set();
    let currentMaxFootnoteNum = 0; // Track max footnote number found so far (for sequential numbering)
    
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        const contentDivs = [
            page.querySelector('.article-columns-three-css'),
            page.querySelector('.article-content'),
            page.querySelector('.article-content-right')
        ].filter(div => div !== null);
        
        contentDivs.forEach(contentDiv => {
            // Look for footnote numbers in multiple ways:
            // 1. In footnotes sections (already processed or not yet marked)
            const footnoteSections = contentDiv.querySelectorAll('.footnotes-section, .footnotes-list, [class*="footnote"], [id*="footnote"]');
            console.log(`Page ${pageIndex}: Found ${footnoteSections.length} potential footnote sections`);
            footnoteSections.forEach(section => {
                // Skip if this is article content with footnote links, not a footnotes section
                const isInArticleContent = section.closest('.article-content, .article-columns-three-css') !== null;
                const hasExplicitFootnoteClasses = section.classList.contains('footnotes-section') ||
                                                 section.classList.contains('footnotes-list') ||
                                                 section.id.includes('footnote');
                const hasLists = section.querySelectorAll('ol, ul, li').length > 0;
                
                // Only process if it's explicitly a footnotes section or has lists
                if (!isInArticleContent || hasExplicitFootnoteClasses || hasLists) {
                    const footnoteItems = section.querySelectorAll('li');
                    console.log(`Page ${pageIndex}: Processing section with ${footnoteItems.length} items`);
                    footnoteItems.forEach(item => {
                        const dataNum = item.getAttribute('data-footnote-number');
                        if (dataNum) {
                            const num = parseInt(dataNum, 10);
                            console.log(`Page ${pageIndex}: Found footnote ${num} via data-footnote-number`);
                            allActualFootnoteNumbers.add(num);
                        } else {
                            const text = item.textContent || '';
                            const match = text.match(/^(\d+)\.?\s/);
                            if (match) {
                                const num = parseInt(match[1], 10);
                                console.log(`Page ${pageIndex}: Found footnote ${num} via text pattern: "${text.substring(0, 50)}..."`);
                                allActualFootnoteNumbers.add(num);
                            }
                        }
                    });
                }
            });
            
            // 2. Also look for any list items that look like footnotes (fallback)
            // BUT ONLY if they're in a footnote container or have footnote-related classes/ids
            // This catches footnotes that haven't been marked as footnotes-section yet
            const allListItems = contentDiv.querySelectorAll('li');
            console.log(`Page ${pageIndex}, contentDiv: Found ${allListItems.length} list items to check`);
            allListItems.forEach(item => {
                // Skip if inside a heading or other non-footnote context
                if (item.closest('h1, h2, h3, h4, h5, h6')) {
                    return;
                }
                
                // Only process if it's in a footnote container or has footnote-related classes/ids
                const isInFootnoteContainer = item.closest('[class*="footnote"], [id*="footnote"]') !== null;
                const hasFootnoteClass = item.classList.toString().toLowerCase().includes('footnote') ||
                                       item.id.toLowerCase().includes('footnote');
                
                if (!isInFootnoteContainer && !hasFootnoteClass) {
                    return; // Skip list items that aren't in footnote containers
                }
                
                const text = item.textContent || '';
                // Check if it looks like a footnote (starts with number followed by period and text)
                const match = text.match(/^(\d+)\.?\s+(.+)$/);
                if (match) {
                    const num = parseInt(match[1], 10);
                    const footnoteText = match[2].trim();
                    // If it matches the pattern and is a reasonable number, add it
                    // We'll be more permissive here - footnotes are usually short to medium length
                    if (footnoteText.length > 0 && footnoteText.length < 2000 && num > 0 && num < 100) {
                        // Check if parent is a list (ol or ul) - footnotes are always in lists
                        const parent = item.parentElement;
                        if (parent && (parent.tagName === 'OL' || parent.tagName === 'UL')) {
                            // Add it - we'll filter out false positives later when we have the full set
                            console.log(`Found potential footnote ${num} in list item: "${footnoteText.substring(0, 50)}..."`);
                            allActualFootnoteNumbers.add(num);
                        }
                    }
                }
            });
            
            // 3. Also look for footnotes in paragraph format (they get converted to lists later)
            // Look for paragraphs inside elements with footnote-related classes
            // First, collect all footnote containers with class "footnote" (not "footnote-reference")
            const footnoteContainers = Array.from(contentDiv.querySelectorAll('.footnote, .footnote-content'));
            console.log(`Page ${pageIndex}: Found ${footnoteContainers.length} footnote containers to check for paragraphs`);
            
            // Update max footnote number from what we've collected so far
            if (allActualFootnoteNumbers.size > 0) {
                currentMaxFootnoteNum = Math.max(...Array.from(allActualFootnoteNumbers));
            }
            
            // Process each footnote container - they should be numbered sequentially
            footnoteContainers.forEach((container, index) => {
                // Check if container has "footnote" class (not just "footnote-reference" or footnote links)
                const hasFootnoteContainerClass = container.classList.contains('footnote') ||
                                                 container.classList.contains('footnote-content');
                
                if (hasFootnoteContainerClass) {
                    // Look for paragraphs inside this container
                    const paragraphs = container.querySelectorAll('p');
                    if (paragraphs.length > 0) {
                        console.log(`Page ${pageIndex}: Container "${container.classList.toString()}" has ${paragraphs.length} paragraphs`);
                    }
                    
                    paragraphs.forEach(p => {
                        const text = p.textContent || '';
                        
                        // Try to get footnote number from various sources:
                        // 1. From paragraph text pattern (number: text or number. text)
                        let num = null;
                        const match = text.match(/^(\d+)[:.]\s*(.+)$/);
                        if (match) {
                            num = parseInt(match[1], 10);
                        } else {
                            // 2. Check if there's a number in the container's ID or data attributes
                            const containerId = container.id || '';
                            const idMatch = containerId.match(/(\d+)/);
                            if (idMatch) {
                                num = parseInt(idMatch[1], 10);
                            } else {
                                // 3. Check parent container for number
                                const parent = container.parentElement;
                                if (parent) {
                                    const parentId = parent.id || '';
                                    const parentIdMatch = parentId.match(/(\d+)/);
                                    if (parentIdMatch) {
                                        num = parseInt(parentIdMatch[1], 10);
                                    }
                                }
                            }
                            
                            // 4. If still no number, infer from position - use the next sequential number
                            // Count how many footnote containers with paragraphs we've processed so far
                            if (!num) {
                                currentMaxFootnoteNum++;
                                num = currentMaxFootnoteNum;
                            }
                        }
                        
                        // If we found a number and the text looks like a footnote, add it
                        if (num !== null && num > 0 && num < 100 && text.trim().length > 0 && text.trim().length < 2000) {
                            console.log(`✓ Found potential footnote ${num} in paragraph: "${text.substring(0, 50)}..."`);
                            allActualFootnoteNumbers.add(num);
                            // Update max if this number is higher
                            if (num > currentMaxFootnoteNum) {
                                currentMaxFootnoteNum = num;
                            }
                        }
                    });
                }
            });
        });
    }
    
    console.log('All actual footnote numbers collected:', Array.from(allActualFootnoteNumbers).sort((a, b) => a - b));
    console.log(`Total pages processed: ${pages.length}, Total footnote numbers found: ${allActualFootnoteNumbers.size}`);
    
    // SECOND PASS: Process all pages for formatting and reference conversion
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        
        // Process both column layout and regular article content
        const contentDivs = [
            page.querySelector('.article-columns-three-css'),
            page.querySelector('.article-content'),
            page.querySelector('.article-content-right')
        ].filter(div => div !== null);
        
        contentDivs.forEach(contentDiv => {
            // Fix footnote line breaks first
            fixFootnoteLineBreaks(contentDiv);
        
        // Find all headings that might indicate footnotes
        const headings = contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
        headings.forEach(heading => {
            const text = heading.textContent.trim().toLowerCase();
            // Check if heading indicates footnotes
            if (text === 'footnotes' || text === 'footnote' || 
                text === 'notes' || text === 'note' ||
                text.startsWith('footnotes') || text.startsWith('notes')) {
                heading.classList.add('footnotes-heading');
                
                // Add space before the horizontal line if there's an hr before this heading
                const prevSibling = heading.previousElementSibling;
                if (prevSibling && prevSibling.tagName === 'HR') {
                    prevSibling.classList.add('footnotes-divider');
                }
            }
        });
        
        // Also check for elements with footnote-related classes or IDs
        // Be more specific - look for actual footnote containers, not just anything with "note" in it
        const footnoteElements = contentDiv.querySelectorAll(
            '[class*="footnote"], [class*="footnotes"], ' +
            '[id*="footnote"], [id*="footnotes"]'
        );
        
        // Filter to only include elements that are actually footnote containers
        // Exclude article titles, headings, and other non-footnote elements
        const actualFootnoteContainers = Array.from(footnoteElements).filter(el => {
            // Must have footnote-related class or ID
            const hasFootnoteClass = el.classList.toString().toLowerCase().includes('footnote');
            const hasFootnoteId = el.id.toLowerCase().includes('footnote');
            
            // Must NOT be an article title or heading
            const isTitle = el.classList.contains('article-title') || el.tagName.match(/^H[1-6]$/);
            
            // Must NOT be inside article content (unless it's explicitly a footnote section)
            const isInArticle = el.closest('.article-content, .article-columns-three-css') !== null;
            const isExplicitFootnote = hasFootnoteClass || hasFootnoteId;
            
            return (hasFootnoteClass || hasFootnoteId) && !isTitle && (isExplicitFootnote || !isInArticle);
        });
        
        // FIRST PASS: Collect ALL footnotes from ALL containers before processing
        // This ensures sequential numbering across all footnotes
        const allFootnotesAcrossContainers = [];
        
        actualFootnoteContainers.forEach(el => {
            // Skip list items - only process containers
            if (el.tagName === 'LI') {
                return;
            }
            
            // CRITICAL: Skip if this element is actually article content, not footnotes
            // Check if it's in article content AND doesn't have footnote lists (ol/ul/li)
            // If it has lists, it's probably the footnotes section at the end
            const isInArticleContent = el.closest('.article-content, .article-columns-three-css') !== null;
            const hasExplicitFootnoteClasses = el.classList.contains('footnote') ||
                                             el.classList.contains('footnotes-section') ||
                                             el.classList.contains('footnotes-list') ||
                                             el.id.includes('footnote');
            const hasLists = el.querySelectorAll('ol, ul, li').length > 0;
            const isListElement = el.tagName === 'OL' || el.tagName === 'UL';
            
            const isArticleTitle = el.classList.contains('article-title') || 
                                  el.tagName.match(/^H[1-6]$/);
            
            if (isArticleTitle) {
                return;
            }
            
            // If it's in article content but doesn't have lists or explicit footnote classes, skip it
            // This prevents article paragraphs/divs with footnote links from being treated as footnotes sections
            if (isInArticleContent && !hasExplicitFootnoteClasses && !hasLists && !isListElement) {
                return;
            }
            
            // MERGE: If there's a nested footnote-content div, merge it with the parent
            const parentFootnote = el.closest('[class*="footnote"], [id*="footnote"]');
            if (parentFootnote && parentFootnote !== el && el.classList.contains('footnote-content')) {
                return; // Skip nested footnote-content divs
            }
            
            const footnoteContentDiv = el.querySelector('.footnote-content, [class*="footnote-content"]');
            if (footnoteContentDiv && footnoteContentDiv !== el) {
                // Merge content (same as before)
                const existingLabel = el.querySelector('.footnotes-label');
                const insertPoint = existingLabel ? existingLabel.nextSibling : el.firstChild;
                
                while (footnoteContentDiv.firstChild) {
                    if (insertPoint) {
                        el.insertBefore(footnoteContentDiv.firstChild, insertPoint);
                    } else {
                        el.appendChild(footnoteContentDiv.firstChild);
                    }
                }
                footnoteContentDiv.remove();
            }
            
            // Collect paragraphs from this container
            const allPElements = Array.from(el.querySelectorAll('p')).filter(p => {
                const isInList = p.closest('li') !== null;
                const isInLabel = p.closest('.footnotes-label') !== null;
                const isInFootnotesList = p.closest('.footnotes-list') !== null;
                const hasText = p.textContent.trim().length > 0;
                const isInThisContainer = el.contains(p);
                const isDirectChild = p.parentElement === el;
                const isInNestedFootnote = p.closest('[class*="footnote"], [id*="footnote"]') === el;
                const isInArticleContent = p.closest('.article-content, .article-columns-three-css') !== null &&
                                          p.closest('[class*="footnote"], [id*="footnote"]') === null;
                
                return !isInList && !isInLabel && !isInFootnotesList && hasText &&
                       isInThisContainer && (isDirectChild || isInNestedFootnote) && !isInArticleContent;
            });
            
            // Add to collection with reference to container
            allPElements.forEach(p => {
                allFootnotesAcrossContainers.push({
                    element: p,
                    container: el,
                    text: p.textContent.trim()
                });
            });
        });
        
        console.log('Total footnotes found across all containers:', allFootnotesAcrossContainers.length);
        
        // Track if we've already added the label to avoid duplicates
        let footnotesLabelAdded = false;
        let globalFootnoteCounter = 0; // Sequential counter across all containers
        
        actualFootnoteContainers.forEach(el => {
            // Skip list items - only process containers
            if (el.tagName === 'LI') {
                return;
            }
            
            // CRITICAL: Skip if this element is actually article content, not footnotes
            // Check if it's in article content AND doesn't have footnote lists (ol/ul/li)
            // If it has lists, it's probably the footnotes section at the end
            const isInArticleContent = el.closest('.article-content, .article-columns-three-css') !== null;
            const hasExplicitFootnoteClasses = el.classList.contains('footnote') ||
                                             el.classList.contains('footnotes-section') ||
                                             el.classList.contains('footnotes-list') ||
                                             el.id.includes('footnote');
            const hasLists = el.querySelectorAll('ol, ul, li').length > 0;
            const isListElement = el.tagName === 'OL' || el.tagName === 'UL';
            
            const isArticleTitle = el.classList.contains('article-title') || 
                                  el.tagName.match(/^H[1-6]$/);
            
            if (isArticleTitle) {
                return;
            }
            
            // If it's in article content but doesn't have lists or explicit footnote classes, skip it
            // This prevents article paragraphs/divs with footnote links from being treated as footnotes sections
            if (isInArticleContent && !hasExplicitFootnoteClasses && !hasLists && !isListElement) {
                return;
            }
            
            // MERGE: If there's a nested footnote-content div, merge it with the parent
            // Also check if THIS element IS a footnote-content div that should be merged with a parent
            const parentFootnote = el.closest('[class*="footnote"], [id*="footnote"]');
            if (parentFootnote && parentFootnote !== el && el.classList.contains('footnote-content')) {
                // This element is a footnote-content div inside another footnote container
                // Skip processing this one - let the parent handle it
                console.log('Skipping nested footnote-content div, parent will handle it');
                return;
            }
            
            const footnoteContentDiv = el.querySelector('.footnote-content, [class*="footnote-content"]');
            if (footnoteContentDiv && footnoteContentDiv !== el) {
                console.log('Merging footnote-content div into parent');
                // Move all children from footnote-content into the parent
                // Insert them right after any existing footnotes-label
                const existingLabel = el.querySelector('.footnotes-label');
                const insertPoint = existingLabel ? existingLabel.nextSibling : el.firstChild;
                
                while (footnoteContentDiv.firstChild) {
                    if (insertPoint) {
                        el.insertBefore(footnoteContentDiv.firstChild, insertPoint);
                    } else {
                        el.appendChild(footnoteContentDiv.firstChild);
                    }
                }
                // Remove the now-empty footnote-content div
                footnoteContentDiv.remove();
            }
            
            el.classList.add('footnotes-section');
            
            // Add "Footnotes:" label only once, at the start of the first footnotes container
            // Only if there's no heading inside and we haven't added it yet
            // This should only run for actual footnotes sections (already filtered above)
            if (!footnotesLabelAdded) {
                const hasHeading = el.querySelector('h1, h2, h3, h4, h5, h6');
                const hasExistingLabel = el.querySelector('.footnotes-label');
                
                if (!hasHeading && !hasExistingLabel) {
                    // Insert "Footnotes:" label as first child
                    const label = document.createElement('div');
                    label.className = 'footnotes-label';
                    label.textContent = 'Footnotes:';
                    el.insertBefore(label, el.firstChild);
                    footnotesLabelAdded = true; // Mark that we've added the label
                }
            }
            
            // Add space before horizontal rule if present before footnotes
            const prevSibling = el.previousElementSibling;
            if (prevSibling && prevSibling.tagName === 'HR') {
                prevSibling.classList.add('footnotes-divider');
            }
            
            // Convert footnotes to a proper numbered list
            // CRITICAL: Only process content that's ACTUALLY inside footnote containers
            // Be very selective - only paragraphs that are direct children or in nested footnote structures
            const allPElements = Array.from(el.querySelectorAll('p'));
            
            const allParagraphs = allPElements.filter(p => {
                // Skip if it's inside a list item or already processed
                const isInList = p.closest('li') !== null;
                const isInLabel = p.closest('.footnotes-label') !== null;
                const isInFootnotesList = p.closest('.footnotes-list') !== null;
                const hasText = p.textContent.trim().length > 0;
                
                // CRITICAL: Only include if it's actually inside THIS footnote container
                // Check that the paragraph is a descendant of el (the footnote container)
                const isInThisContainer = el.contains(p);
                
                // Also check if it's a direct child or in a nested footnote structure
                const isDirectChild = p.parentElement === el;
                const isInNestedFootnote = p.closest('[class*="footnote"], [id*="footnote"]') === el;
                
                // Exclude if it's in article content (not footnotes)
                const isInArticleContent = p.closest('.article-content, .article-columns-three-css, h2.article-title') !== null &&
                                          p.closest('[class*="footnote"], [id*="footnote"]') === null;
                
                const shouldInclude = !isInList && 
                                     !isInLabel && 
                                     !isInFootnotesList && 
                                     hasText &&
                                     isInThisContainer &&
                                     (isDirectChild || isInNestedFootnote) &&
                                     !isInArticleContent;
                
                if (!shouldInclude) {
                    console.log('Filtered out paragraph:', {
                        isInList,
                        isInLabel,
                        isInFootnotesList,
                        hasText,
                        isInThisContainer,
                        isDirectChild,
                        isInNestedFootnote,
                        isInArticleContent,
                        text: p.textContent.substring(0, 50)
                    });
                }
                return shouldInclude;
            });
            
            console.log('Found footnote paragraphs in element:', allParagraphs.length, el.className, allParagraphs.map(p => p.textContent.substring(0, 50)));
            
            // Collect all footnote content BEFORE processing
            const footnoteContent = [];
            
            console.log('Total footnotes to process:', allParagraphs.length);
            
            // Process ALL paragraphs - they're likely footnotes
            // ALWAYS use global counter for sequential numbering - ignore any numbers in the text
            allParagraphs.forEach((p, index) => {
                const text = p.textContent || '';
                if (text.trim().length > 0 && text.length < 2000) {
                    // Increment global counter for sequential numbering
                    globalFootnoteCounter++;
                    const sequentialNum = globalFootnoteCounter.toString();
                    
                    console.log('Processing footnote:', sequentialNum, 'for container:', el.className);
                    
                    // Remove any leading number from the text (we'll use our own numbering)
                    const numMatch = text.match(/^(\d+)\.?\s*(.+)$/);
                    const footnoteText = numMatch ? numMatch[2].trim() : text.trim();
                    
                    footnoteContent.push({
                        element: p,
                        text: footnoteText,
                        number: sequentialNum
                    });
                }
            });
            
            // Also check for existing list items that aren't in a list yet
            const existingLis = Array.from(el.querySelectorAll('li')).filter(li => {
                return li.closest('.footnotes-list') === null;
            });
            
            existingLis.forEach((li) => {
                const text = li.textContent || '';
                const numMatch = text.match(/^(\d+)\.?\s*(.+)$/);
                // Use global counter for sequential numbering
                globalFootnoteCounter++;
                const sequentialNum = globalFootnoteCounter.toString();
                footnoteContent.push({
                    element: li,
                    text: numMatch ? numMatch[2].trim() : text.replace(/^\d+\.?\s*/, '').trim(),
                    number: sequentialNum
                });
            });
            
            console.log('Collected footnote content:', footnoteContent.length, footnoteContent.map(f => f.number + ': ' + f.text.substring(0, 30)));
            
            // Convert collected content to list items
            if (footnoteContent.length > 0) {
                // Find or create the footnote list
                let footnoteList = el.querySelector('ol.footnotes-list, ul.footnotes-list');
                if (!footnoteList) {
                    footnoteList = document.createElement('ol');
                    footnoteList.className = 'footnotes-list';
                    // Insert after footnotes-label if it exists
                    const label = el.querySelector('.footnotes-label');
                    if (label) {
                        el.insertBefore(footnoteList, label.nextSibling);
                    } else {
                        el.insertBefore(footnoteList, el.firstChild);
                    }
                }
                
                // Process each footnote content item - REMOVE elements AFTER processing
                // Use sequential numbering across all footnotes in this container
                footnoteContent.forEach((item, index) => {
                    // Safety check - ensure element still exists
                    if (!item.element || !item.element.parentNode) {
                        console.log('Skipping item - element no longer exists:', index);
                        return;
                    }
                    
                    let li;
                    let footnoteNum;
                    let footnoteText;
                    
                    const tagName = item.element.tagName;
                    
                    // Use sequential numbering: index + 1 (or use the number from item if it was extracted)
                    // But ensure we're counting sequentially
                    footnoteNum = item.number || (index + 1).toString();
                    
                    if (tagName === 'LI' && item.element.parentNode === footnoteList) {
                        // Already in the list, just normalize it
                        li = item.element;
                        footnoteText = item.text;
                    } else if (tagName === 'LI') {
                        // List item but not in the list yet
                        li = item.element;
                        footnoteText = item.text;
                    } else {
                        // Create new list item from paragraph
                        li = document.createElement('li');
                        footnoteText = item.text.replace(/^\d+\.?\s*/, '').trim();
                    }
                    
                    // Normalize text and set format - CRITICAL: ensure single line, no breaks
                    footnoteText = footnoteText.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
                    
                    // Wrap number and first word together to prevent breaking
                    li.innerHTML = '';
                    
                    // Get first word to keep with number (prevents number from breaking alone)
                    const words = footnoteText.split(' ');
                    const firstWord = words[0] || '';
                    const restOfText = words.slice(1).join(' ');
                    
                    // Use a simpler approach: set as plain text with non-breaking space
                    // This ensures the number and text stay together
                    const fullText = footnoteNum + '. ' + footnoteText;
                    li.textContent = fullText;
                    
                    // Add inline style to prevent breaking
                    li.style.whiteSpace = 'normal';
                    li.style.wordBreak = 'normal';
                    li.style.display = 'block';
                    
                    // Store the number in data attribute as backup for later processing
                    li.setAttribute('data-footnote-number', footnoteNum);
                    
                    // Don't create spans - they cause textContent to lose the number
                    // Just use plain text and rely on CSS to prevent breaking
                    
                    // Add to list if not already there
                    if (li.parentNode !== footnoteList) {
                        footnoteList.appendChild(li);
                    }
                    
                    // Remove the original element AFTER adding to list (only if it's not the li we just added)
                    if (item.element !== li && item.element.parentNode) {
                        if (tagName !== 'LI') {
                            item.element.remove();
                        } else if (tagName === 'LI' && item.element.parentNode !== footnoteList) {
                            item.element.remove();
                        }
                    }
                });
                
                console.log('Final footnote list has', footnoteList.querySelectorAll('li').length, 'items');
                
                // Remove standalone number text nodes AFTER processing (like "1", "2" that appear after lists)
                // More aggressive: remove ANY text node that's just a number
                const allTextNodes = [];
                const walker = document.createTreeWalker(
                    el,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                );
                
                let node;
                while (node = walker.nextNode()) {
                    allTextNodes.push(node);
                }
                
                allTextNodes.forEach(textNode => {
                    const text = textNode.textContent.trim();
                    // If it's just a number (like "1" or "2"), remove it
                    if (/^\d+\.?$/.test(text)) {
                        console.log('Removing standalone number text node:', text);
                        textNode.remove();
                    }
                });
            }
            
            // Get the footnote list (should have been created above if there was content)
            let footnoteList = el.querySelector('ol.footnotes-list, ul.footnotes-list');
            
            // If no list exists, check if we have list items directly as children
            if (!footnoteList) {
                const directListItems = Array.from(el.children).filter(child => child.tagName === 'LI');
                
                if (directListItems.length > 0) {
                    // Create an ordered list and move items into it
                    footnoteList = document.createElement('ol');
                    footnoteList.className = 'footnotes-list';
                    directListItems.forEach(li => {
                        footnoteList.appendChild(li);
                    });
                    // Insert the list after footnotes-label if it exists
                    const label = el.querySelector('.footnotes-label');
                    const insertPoint = label ? label.nextSibling : directListItems[0];
                    el.insertBefore(footnoteList, insertPoint);
                }
            }
            
            // Ensure it's an ordered list (only if footnoteList exists)
            if (footnoteList && footnoteList.tagName === 'UL') {
                const newOl = document.createElement('ol');
                newOl.className = 'footnotes-list';
                Array.from(footnoteList.children).forEach(li => {
                    newOl.appendChild(li);
                });
                footnoteList.parentNode.replaceChild(newOl, footnoteList);
                footnoteList = newOl;
            }
            
            // Process all list items in the footnotes list (only if list exists)
            if (!footnoteList) {
                console.log('No footnote list found, skipping processing');
                return; // Skip if no footnote list was created
            }
            
            const footnoteItems = Array.from(footnoteList.querySelectorAll('li'));
            footnoteItems.forEach((li, index) => {
                // DEBUG: Log the current state
                console.log('Footnote LI before processing:', {
                    innerHTML: li.innerHTML,
                    textContent: li.textContent,
                    hasBr: li.querySelectorAll('br').length > 0,
                    childNodes: Array.from(li.childNodes).map(n => ({
                        type: n.nodeType,
                        name: n.nodeName,
                        text: n.textContent?.substring(0, 50)
                    }))
                });
                
                // VALIDATION: Ensure no prohibited pattern (N.\n<text>) exists
                const currentText = li.textContent || '';
                if (currentText.match(/^\d+\.?\s*\n/)) {
                    // Prohibited pattern detected - fix it immediately
                    const fixMatch = currentText.match(/^(\d+)\.?\s*\n+\s*(.+)$/s);
                    if (fixMatch) {
                        li.textContent = fixMatch[1] + '. ' + fixMatch[2].trim();
                    }
                }
                // Remove any existing number spans or back-links
                const existingNumber = li.querySelector('span.footnote-number, a[href*="#"]');
                if (existingNumber) {
                    existingNumber.remove();
                }
                
                // Get ALL text content, completely ignoring HTML structure
                let textContent = li.textContent || '';
                
                // CRITICAL: Extract the number from existing text (it was already set correctly)
                // Don't use index + 1 as that resets to 1 for each list!
                const numberMatch = textContent.match(/^(\d+)\.?\s*(.+)$/);
                let footnoteNum = '';
                let footnoteText = '';
                
                if (numberMatch) {
                    // Number already exists in text - preserve it!
                    footnoteNum = numberMatch[1];
                    footnoteText = numberMatch[2].trim();
                } else {
                    // No number found in textContent - check data attribute FIRST
                    const dataNumber = li.getAttribute('data-footnote-number');
                    if (dataNumber) {
                        // Use the number from data attribute - this is the correct sequential number!
                        footnoteNum = dataNumber;
                        footnoteText = textContent.replace(/^\d+\.?\s*/, '').trim();
                        console.log('Using number from data attribute:', footnoteNum);
                    } else {
                        // Try to get from id
                        const id = li.getAttribute('id') || '';
                        const idMatch = id.match(/(\d+)/);
                        if (idMatch) {
                            footnoteNum = idMatch[1];
                            footnoteText = textContent.replace(/^\d+\.?\s*/, '').trim();
                        } else {
                            // Last resort: use index (but this shouldn't happen if numbering worked)
                            console.warn('Could not find footnote number, using index:', index + 1, 'textContent:', textContent.substring(0, 50));
                            footnoteNum = (index + 1).toString();
                            footnoteText = textContent.replace(/^\d+\.?\s*/, '').trim();
                        }
                    }
                }
                
                // CRITICAL: Replace entire content with plain text - NO HTML, NO SPANS, NO NEWLINES
                // Format: "N. Footnote text" as a single text node
                footnoteText = footnoteText.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
                
                const fullText = footnoteNum + '. ' + footnoteText;
                
                // Clear everything and set as single text node
                li.innerHTML = '';
                const textNode = document.createTextNode(fullText);
                li.appendChild(textNode);
                
                // Also set textContent as backup
                li.textContent = fullText;
                
                // DEBUG: Log after processing
                console.log('Footnote LI after processing:', {
                    innerHTML: li.innerHTML,
                    textContent: li.textContent,
                    hasBr: li.querySelectorAll('br').length > 0,
                    childNodes: Array.from(li.childNodes).map(n => ({
                        type: n.nodeType,
                        name: n.nodeName,
                        text: n.textContent?.substring(0, 50)
                    }))
                });
                
                // Remove all styling that might cause issues
                li.style.listStyleType = 'none';
                li.style.listStylePosition = 'inside';
                li.style.marginLeft = '0';
                li.style.paddingLeft = '0';
                li.style.display = 'block';
                li.style.whiteSpace = 'normal';
            });
            
            // Ensure the list itself has proper styling
            if (footnoteList) {
                footnoteList.style.listStyleType = 'decimal';
                footnoteList.style.listStylePosition = 'inside'; // Inside positioning
                footnoteList.style.paddingLeft = '0';
                footnoteList.style.margin = '0';
                footnoteList.style.breakInside = 'avoid';
            }
        }); // End actualFootnoteContainers.forEach (second loop)
        
        // NOW process superscript conversion using the collected footnote numbers from ALL pages
        // Use the allActualFootnoteNumbers Set collected in the first pass
        
        // Handle footnote REFERENCES in the article body (marked during preprocessing)
        // These are now <span> elements with data-footnote-ref attributes (links were removed in preprocessing)
        // Use a more robust approach: collect all data, then replace using parent references
        
        // First, handle any remaining links in footnotes sections
        const footnoteSectionLinks = Array.from(contentDiv.querySelectorAll(
            '.footnotes-section a, .footnotes-list a, li a, ol a, ul a'
        ));
        footnoteSectionLinks.forEach(link => {
            const href = link.getAttribute('href') || '';
            if (href.includes('#fn') || href.includes('#footnote') || link.getAttribute('data-footnote-ref')) {
                const linkText = link.textContent || link.getAttribute('data-footnote-ref') || '';
                const textNode = document.createTextNode(linkText);
                link.parentNode.replaceChild(textNode, link);
            }
        });
        
        // Now collect ALL footnote references in article body (not in footnotes sections)
        // First try direct selectors, then fall back to comprehensive search
        let footnoteRefData = [];
        
        // Method 1: Direct selector for spans with data-footnote-ref
        const spansWithRef = Array.from(contentDiv.querySelectorAll('span[data-footnote-ref]'));
        spansWithRef.forEach(span => {
            // Skip if inside footnotes section
            const isInFootnotesList = span.closest('.footnotes-section, .footnotes-list') !== null ||
                                     (span.closest('[class*="footnote"], [id*="footnote"]') !== null &&
                                      span.closest('li, ol, ul') !== null);
            
            if (!isInFootnotesList) {
                const num = parseInt(span.getAttribute('data-footnote-ref'), 10);
                if (!isNaN(num)) {
                    footnoteRefData.push({
                        element: span,
                        num: num,
                        parent: span.parentNode,
                        nextSibling: span.nextSibling
                    });
                }
            }
        });
        
        // Method 2: Also check for spans with footnote-reference class
        const spansWithClass = Array.from(contentDiv.querySelectorAll('span.footnote-reference'));
        spansWithClass.forEach(span => {
            // Skip if already collected or inside footnotes section
            const isInFootnotesList = span.closest('.footnotes-section, .footnotes-list') !== null ||
                                     (span.closest('[class*="footnote"], [id*="footnote"]') !== null &&
                                      span.closest('li, ol, ul') !== null);
            
            if (!isInFootnotesList && !footnoteRefData.some(d => d.element === span)) {
                const num = parseInt(span.getAttribute('data-footnote-ref'), 10);
                if (!isNaN(num)) {
                    footnoteRefData.push({
                        element: span,
                        num: num,
                        parent: span.parentNode,
                        nextSibling: span.nextSibling
                    });
                }
            }
        });
        
        // Method 3: Check for any remaining links - ONLY footnote-anchor links
        const links = Array.from(contentDiv.querySelectorAll('a.footnote-anchor[data-component-name="FootnoteAnchorToDOM"]'));
        links.forEach(link => {
            // Skip if inside footnotes section
            const isInFootnotesList = link.closest('.footnotes-section, .footnotes-list') !== null ||
                                     (link.closest('[class*="footnote"], [id*="footnote"]') !== null &&
                                      link.closest('li, ol, ul') !== null);
            
            if (!isInFootnotesList && !footnoteRefData.some(d => d.element === link)) {
                let num = null;
                const href = link.getAttribute('href') || '';
                const id = link.getAttribute('id') || '';
                // Extract footnote number from href or id
                const hrefMatch = href.match(/#footnote-?(\d+)/i);
                const idMatch = id.match(/footnote-anchor-?(\d+)/i);
                if (hrefMatch || idMatch) {
                    num = parseInt((hrefMatch && hrefMatch[1]) || (idMatch && idMatch[1]), 10);
                }
                
                if (num !== null && !isNaN(num)) {
                    footnoteRefData.push({
                        element: link,
                        num: num,
                        parent: link.parentNode,
                        nextSibling: link.nextSibling
                    });
                }
            }
        });
        
        console.log(`Found ${footnoteRefData.length} footnote references to process in contentDiv`);
        console.log('Footnote numbers:', footnoteRefData.map(d => d.num));
        if (footnoteRefData.length > 0) {
            console.log('Sample elements:', footnoteRefData.slice(0, 3).map(d => ({
                tag: d.element.tagName,
                dataRef: d.element.getAttribute('data-footnote-ref'),
                text: d.element.textContent?.substring(0, 20),
                num: d.num
            })));
        }
        
        // NOW convert all collected footnote references to superscript
        // Use the stored parent/nextSibling references for reliable replacement
        footnoteRefData.forEach(({element, num, parent, nextSibling}) => {
            // Skip if element is no longer in the DOM or parent changed
            if (!element.parentNode || element.parentNode !== parent) {
                console.warn(`Skipping footnote ${num} - element no longer in expected parent`);
                return;
            }
            
            // Convert to superscript if it matches an actual footnote
            if (allActualFootnoteNumbers.has(num)) {
                // Create superscript element
                const sup = document.createElement('sup');
                sup.className = 'footnote-ref';
                sup.textContent = num.toString();
                
                // Replace using parent and nextSibling for reliability
                if (nextSibling && nextSibling.parentNode === parent) {
                    parent.insertBefore(sup, nextSibling);
                } else {
                    parent.appendChild(sup);
                }
                parent.removeChild(element);
            } else {
                // Doesn't match an actual footnote, but still remove any link and keep as text
                const textNode = document.createTextNode(num.toString());
                if (nextSibling && nextSibling.parentNode === parent) {
                    parent.insertBefore(textNode, nextSibling);
                } else {
                    parent.appendChild(textNode);
                }
                parent.removeChild(element);
            }
        });
        
        // Only convert standalone numbers that match actual footnote numbers
        // Process text nodes to find numbers that match actual footnotes
        const walker = document.createTreeWalker(
            contentDiv,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    // Skip if already in a sup tag (unless it's not marked as footnote-ref)
                    if (node.parentElement && node.parentElement.tagName === 'SUP') {
                        // If it's already a superscript but not marked as footnote-ref, we might need to check it
                        if (node.parentElement.classList.contains('footnote-ref')) {
                            return NodeFilter.FILTER_REJECT;
                        }
                    }
                    // Skip if inside footnote sections, lists, headings, or image captions
                    const parent = node.parentElement;
                    if (parent) {
                        // CRITICAL: Skip if inside the footnotes section itself (not just article content with footnote links)
                        const isInFootnotesSection = parent.closest('.footnotes-section, .footnotes-list') !== null ||
                                                     (parent.closest('[class*="footnote"], [id*="footnote"]') !== null &&
                                                      parent.closest('li, ol, ul') !== null);
                        
                        if (isInFootnotesSection ||
                            parent.closest('li, ol, ul') !== null ||
                            parent.closest('h1, h2, h3, h4, h5, h6') !== null ||
                            parent.classList.contains('image-caption')) {
                            return NodeFilter.FILTER_REJECT;
                        }
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            },
            false
        );
        
        const textNodesToProcess = [];
        let node;
        while (node = walker.nextNode()) {
            const text = node.textContent || '';
            // Look for various footnote patterns:
            // - "word4" or "word 4" (word followed by number)
            // - "(1)", "(2)" (number in parentheses)
            // - ".1", ",1", ";1" (number after punctuation)
            // - "word.1" or "word,1" (word, punctuation, number)
            // - Any 1-2 digit number that could be a footnote
            if (/\w[\s]?\d{1,2}(?![.\d\w])|\(\d{1,2}\)|[.,;:]\d{1,2}(?![.\d\w])|\w[.,;:]\d{1,2}(?![.\d\w])/.test(text)) {
                textNodesToProcess.push(node);
            }
        }
        
        // Process text nodes to convert only actual footnote numbers to superscript
        textNodesToProcess.forEach(textNode => {
            const text = textNode.textContent;
            const matches = [];
            
            // Pattern 1: word character(s), optional space, 1-2 digits (not followed by .digit, digit, or word)
            // Example: "word4" or "word 4"
            let pattern = /([a-zA-Z]+)([\s]?)(\d{1,2})(?![.\d\w])/g;
            let match;
            while ((match = pattern.exec(text)) !== null) {
                const numValue = parseInt(match[3], 10);
                if (allActualFootnoteNumbers.has(numValue)) {
                    matches.push({
                        index: match.index,
                        before: match[1] + match[2],
                        number: match[3],
                        endIndex: pattern.lastIndex,
                        type: 'word'
                    });
                }
            }
            
            // Pattern 2: number in parentheses (1), (2), etc.
            // Example: "text(1)more text"
            pattern = /\((\d{1,2})\)/g;
            while ((match = pattern.exec(text)) !== null) {
                const numValue = parseInt(match[1], 10);
                if (allActualFootnoteNumbers.has(numValue)) {
                    matches.push({
                        index: match.index,
                        before: '(',
                        number: match[1],
                        endIndex: pattern.lastIndex,
                        type: 'paren',
                        after: ')'
                    });
                }
            }
            
            // Pattern 3: number after punctuation .1, ,1, ;1, :1
            // Example: "sentence.1more" or "sentence,1more" or "Babel.2"
            // This matches punctuation followed immediately by a number
            pattern = /([.,;:])(\d{1,2})(?![.\d\w])/g;
            while ((match = pattern.exec(text)) !== null) {
                const numValue = parseInt(match[2], 10);
                if (allActualFootnoteNumbers.has(numValue)) {
                    matches.push({
                        index: match.index,
                        before: match[1],
                        number: match[2],
                        endIndex: pattern.lastIndex,
                        type: 'punctuation'
                    });
                }
            }
            
            // Pattern 4: word followed by punctuation and number (e.g., "Babel.2", "word,3")
            // This catches cases where there's a word, then punctuation, then a footnote number
            pattern = /([a-zA-Z]+)([.,;:])(\d{1,2})(?![.\d\w])/g;
            while ((match = pattern.exec(text)) !== null) {
                const numValue = parseInt(match[3], 10);
                if (allActualFootnoteNumbers.has(numValue)) {
                    // Check if this match overlaps with a previous match (from pattern 3)
                    const overlaps = matches.some(m => 
                        m.index <= match.index && m.endIndex >= match.index
                    );
                    if (!overlaps) {
                        matches.push({
                            index: match.index + match[1].length, // Start after the word
                            before: match[2], // The punctuation
                            number: match[3],
                            endIndex: pattern.lastIndex,
                            type: 'word-punctuation'
                        });
                    }
                }
            }
            
            // Pattern 5: Standalone numbers on their own line or after whitespace/newlines
            // Example: "text\n4\nmore text" or "text 4 more text" where 4 is a footnote
            // This catches numbers that appear after sentence endings, on new lines, etc.
            // Match: start of text OR whitespace/newline, then number, then whitespace/newline OR end
            pattern = /(?:^|[\s\n]+)(\d{1,2})(?:[\s\n]+|$)/g;
            while ((match = pattern.exec(text)) !== null) {
                const numValue = parseInt(match[1], 10);
                if (allActualFootnoteNumbers.has(numValue)) {
                    // Check if this number is actually a footnote (not part of a date, etc.)
                    // Look at context - if it's after punctuation or on its own line, it's likely a footnote
                    const beforeText = match.index > 0 ? text.substring(Math.max(0, match.index - 20), match.index) : '';
                    const afterText = match.index + match[0].length < text.length ? 
                                     text.substring(match.index + match[0].length, Math.min(text.length, match.index + match[0].length + 20)) : '';
                    
                    // It's likely a footnote if:
                    // - It's at the start of the text node (after whitespace/newline)
                    // - It's after punctuation (. , ; : ! ?)
                    // - It's followed by whitespace/newline or end of text
                    // - It's on its own line (surrounded by newlines)
                    const isAfterPunctuation = /[.,;:!?]\s*$/.test(beforeText);
                    const isAtStart = match.index === 0 || /^[\s\n]*$/.test(text.substring(0, match.index));
                    const isFollowedByWhitespace = /^[\s\n]*/.test(afterText) || afterText === '';
                    
                    // Check if the number is on its own line (surrounded by newlines or at start/end)
                    const charBefore = match.index > 0 ? text[match.index - 1] : '\n';
                    const charAfter = match.index + match[0].length < text.length ? text[match.index + match[0].length] : '\n';
                    const isOnOwnLine = (charBefore === '\n' || match.index === 0) &&
                                       (charAfter === '\n' || match.index + match[0].length >= text.length);
                    
                    // Be more aggressive: if it's a valid footnote number and appears standalone, convert it
                    if ((isAfterPunctuation || isAtStart || isOnOwnLine) && isFollowedByWhitespace) {
                        // Check if it overlaps with a previous match
                        const overlaps = matches.some(m => 
                            m.index <= match.index && m.endIndex >= match.index
                        );
                        if (!overlaps) {
                            // Extract just the whitespace before the number
                            const whitespaceBefore = match[0].substring(0, match[0].indexOf(match[1]));
                            matches.push({
                                index: match.index,
                                before: whitespaceBefore,
                                number: match[1],
                                endIndex: match.index + match[0].length,
                                type: 'standalone'
                            });
                        }
                    }
                }
            }
            
            // Sort matches by index (reverse order to process from end to start)
            matches.sort((a, b) => b.index - a.index);
            
            if (matches.length > 0) {
                // Build replacement fragments (process from start to end, but build fragments)
                const fragments = [];
                let lastIndex = 0;
                
                // Sort back to start-to-end order for building fragments
                matches.sort((a, b) => a.index - b.index);
                
                matches.forEach(m => {
                    // Add text before the match
                    if (m.index > lastIndex) {
                        fragments.push(document.createTextNode(text.substring(lastIndex, m.index)));
                    }
                    
                    // Add the text before the number
                    if (m.before) {
                        fragments.push(document.createTextNode(m.before));
                    }
                    
                    // Create superscript element for the number
                    const sup = document.createElement('sup');
                    sup.className = 'footnote-ref';
                    sup.textContent = m.number;
                    fragments.push(sup);
                    
                    // Skip the closing paren if it's a paren type (already included in endIndex)
                    lastIndex = m.endIndex;
                });
                
                // Add remaining text
                if (lastIndex < text.length) {
                    fragments.push(document.createTextNode(text.substring(lastIndex)));
                }
                
                // Replace the text node with fragments
                const parent = textNode.parentNode;
                fragments.forEach(fragment => {
                    parent.insertBefore(fragment, textNode);
                });
                textNode.remove();
            }
        });
        }); // End contentDivs.forEach
    } // End for loop
}

// Move a heading to the next page
function moveHeadingToNextPage(heading, currentPageIndex, pages) {
    // Get all pages (in case pages NodeList was stale)
    const allPages = document.querySelectorAll('.newsletter-page');
    
    // Get the next page
    const nextPageIndex = currentPageIndex + 1;
    let nextPage = allPages[nextPageIndex];
    
    if (!nextPage) {
        // No next page exists, create one
        const lastPage = allPages[allPages.length - 1];
        const newPage = document.createElement('div');
        const currentMode = getCurrentMode();
        const modeClass = currentMode && currentMode !== 'normal' ? ` mode-${currentMode}` : '';
        newPage.className = `newsletter-page${modeClass}`;
        newPage.innerHTML = `
            <div class="newsletter-content">
                <div class="article-columns-three-css"></div>
            </div>
        `;
        lastPage.parentElement.appendChild(newPage);
        nextPage = newPage;
    }
    
    const nextPageContent = nextPage.querySelector('.article-columns-three-css');
    if (!nextPageContent) return;
    
    // Clone the heading
    const headingClone = heading.cloneNode(true);
    
    // Remove the force-page-break and force-column-break classes if they exist
    headingClone.classList.remove('force-page-break');
    headingClone.classList.remove('force-column-break');
    
    // Insert at the beginning of the next page's content
    if (nextPageContent.firstChild) {
        nextPageContent.insertBefore(headingClone, nextPageContent.firstChild);
    } else {
        nextPageContent.appendChild(headingClone);
    }
    
    // Remove the original heading
    heading.remove();
}

// Prevent orphaned headings - ensure headings have at least one line of content below them in their column
function preventOrphanedHeadings() {
    const pages = document.querySelectorAll('.newsletter-page');
    
    // Process pages 2+ (skip page 1 which has special layout)
    for (let pageIndex = 1; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        const contentDiv = page.querySelector('.article-columns-three-css');
        if (!contentDiv) continue;
        
        // Get all headings in this page
        const headings = Array.from(contentDiv.querySelectorAll('h1, h2, h3, h4, h5, h6, .article-title'));
        
        headings.forEach((heading, index) => {
            // Get the next sibling element that contains text content
            let nextSibling = heading.nextElementSibling;
            
            // Skip empty elements and find the first element with actual text content
            while (nextSibling && (
                nextSibling.textContent.trim().length === 0 ||
                nextSibling.tagName === 'BR' ||
                (nextSibling.tagName === 'HR' && !nextSibling.classList.contains('footnotes-divider'))
            )) {
                nextSibling = nextSibling.nextElementSibling;
            }
            
            // If no next sibling with content, the heading might be orphaned - force break
            if (!nextSibling) {
                // Determine which column the heading is in
                const headingRect = heading.getBoundingClientRect();
                const containerRect = contentDiv.getBoundingClientRect();
                const columnWidth = containerRect.width / 3;
                const headingColumnIndex = Math.floor((headingRect.left - containerRect.left) / columnWidth);
                const isInThirdColumn = headingColumnIndex >= 2;
                
                if (isInThirdColumn) {
                    // Move heading to next page
                    moveHeadingToNextPage(heading, pageIndex, pages);
                    console.log('Heading with no next sibling (third column) - moving to next page:', heading.textContent.substring(0, 50), 'column index:', headingColumnIndex);
                } else {
                    heading.classList.add('force-column-break');
                    console.log('Heading with no next sibling - forcing column break:', heading.textContent.substring(0, 50), 'column index:', headingColumnIndex);
                }
                return;
            }
            
            // Check if the heading and its next sibling are in different columns
            // by comparing their vertical positions (in CSS columns, elements in same column have similar top values)
            const headingRect = heading.getBoundingClientRect();
            const nextRect = nextSibling.getBoundingClientRect();
            const containerRect = contentDiv.getBoundingClientRect();
            
            // Calculate the vertical distance between heading bottom and next element top
            const verticalDiff = nextRect.top - headingRect.bottom;
            
            // Get the computed line height to estimate one visual line
            const computedStyle = getComputedStyle(nextSibling);
            const lineHeight = parseFloat(computedStyle.lineHeight) || parseFloat(computedStyle.fontSize) * 1.5;
            
            // Check if heading and next element are in the same column by comparing their left positions
            // In CSS columns, elements in the same column have similar left positions
            const headingLeft = headingRect.left;
            const nextLeft = nextRect.left;
            const leftDiff = Math.abs(headingLeft - nextLeft);
            
            // If elements are in different columns (large left difference), heading is orphaned
            // Threshold for same column (accounts for margins/padding and column gaps)
            const areInSameColumn = leftDiff < 100; // Increased threshold for column gap (0.25in = ~24px)
            
            // Calculate how close the heading is to the bottom of the container
            // This helps detect headings that are at the bottom of a column
            const headingBottomFromContainerTop = headingRect.bottom - containerRect.top;
            const containerHeight = containerRect.height;
            const distanceFromBottom = containerHeight - headingBottomFromContainerTop;
            
            // Get heading's computed style for line height
            const headingStyle = getComputedStyle(heading);
            const headingLineHeight = parseFloat(headingStyle.lineHeight) || parseFloat(headingStyle.fontSize) * 1.5;
            
            // Calculate approximate column height (container height divided by number of columns)
            // In CSS columns, content flows vertically, so we estimate column height
            const estimatedColumnHeight = containerHeight; // For CSS columns, this is the full height
            
            // Check if heading is in the bottom portion of its column
            // We need to determine which "column" the heading is in based on its left position
            const columnWidth = containerRect.width / 3; // Assuming 3 columns
            const headingColumnIndex = Math.floor((headingRect.left - containerRect.left) / columnWidth);
            const isInThirdColumn = headingColumnIndex >= 2; // Third column (0-indexed: 0, 1, 2)
            
            // More aggressive detection: if heading and next element are in different columns, it's orphaned
            // OR if there's a large vertical gap (more than 0.8x line height), it's orphaned
            // OR if heading is very close to bottom (less than 2x line height) and next is in different column
            if (!areInSameColumn) {
                // Always force break if in different columns - heading is definitely orphaned
                // If in third column, move to next page; otherwise force column break
                if (isInThirdColumn) {
                    // Move heading to next page
                    moveHeadingToNextPage(heading, pageIndex, pages);
                    console.log('Orphaned heading (third column, different column) - moving to next page:', heading.textContent.substring(0, 50), 
                        'left diff:', leftDiff, 'vertical diff:', verticalDiff, 'column index:', headingColumnIndex);
                } else {
                    heading.classList.add('force-column-break');
                    console.log('Orphaned heading (different column) - forcing column break:', heading.textContent.substring(0, 50), 
                        'left diff:', leftDiff, 'vertical diff:', verticalDiff, 'column index:', headingColumnIndex);
                }
            } else if (verticalDiff > lineHeight * 0.8) {
                // If large gap even in same column, likely orphaned
                if (isInThirdColumn) {
                    // Move heading to next page
                    moveHeadingToNextPage(heading, pageIndex, pages);
                    console.log('Orphaned heading (third column, large gap) - moving to next page:', heading.textContent.substring(0, 50), 
                        'vertical diff:', verticalDiff, 'line height:', lineHeight, 'column index:', headingColumnIndex);
                } else {
                    heading.classList.add('force-column-break');
                    console.log('Orphaned heading detected (large gap) - forcing column break:', heading.textContent.substring(0, 50), 
                        'vertical diff:', verticalDiff, 'line height:', lineHeight, 'column index:', headingColumnIndex);
                }
            } else if (distanceFromBottom < lineHeight * 2 && verticalDiff > 5) {
                // If heading is near bottom and there's any gap, it might be orphaned
                if (isInThirdColumn) {
                    // Move heading to next page
                    moveHeadingToNextPage(heading, pageIndex, pages);
                    console.log('Orphaned heading (third column, near bottom) - moving to next page:', heading.textContent.substring(0, 50), 
                        'distance from bottom:', distanceFromBottom, 'line height:', lineHeight, 'vertical diff:', verticalDiff, 'column index:', headingColumnIndex);
                } else {
                    heading.classList.add('force-column-break');
                    console.log('Orphaned heading (near bottom) - forcing column break:', heading.textContent.substring(0, 50), 
                        'distance from bottom:', distanceFromBottom, 'line height:', lineHeight, 'vertical diff:', verticalDiff, 'column index:', headingColumnIndex);
                }
            }
        });
    }
}

// Add page numbers to pages 2+ in the bottom right corner
function addPageNumbers() {
    const pages = document.querySelectorAll('.newsletter-page');
    
    // Skip page 1 (index 0), add page numbers starting from page 2
    for (let i = 1; i < pages.length; i++) {
        const page = pages[i];
        const pageNumber = i + 1; // Page 2, 3, 4, etc.
        
        // Check if page number already exists
        if (page.querySelector('.page-number')) {
            continue;
        }
        
        // Create page number element
        const pageNumberEl = document.createElement('div');
        pageNumberEl.className = 'page-number';
        pageNumberEl.textContent = `Page ${pageNumber}`;
        
        // Append to page
        page.appendChild(pageNumberEl);
    }
}

// Prevent orphaned image captions - ensure captions stay with their images
function preventOrphanedImageCaptions() {
    const pages = document.querySelectorAll('.newsletter-page');
    
    // Process all pages
    pages.forEach(page => {
        // Process all content containers (columns layout and regular article content)
        const contentDivs = [
            page.querySelector('.article-columns-three-css'),
            page.querySelector('.article-content'),
            page.querySelector('.article-content-right')
        ].filter(div => div !== null);
        
        contentDivs.forEach(contentDiv => {
            // Find all .featured-image containers (which contain both image and caption)
            const featuredImageContainers = Array.from(contentDiv.querySelectorAll('.featured-image'));
            
            featuredImageContainers.forEach(container => {
                const image = container.querySelector('img');
                const caption = container.querySelector('.image-caption');
                
                // Wrap the entire container in a non-breaking wrapper if not already wrapped
                // Do this even if no caption, to prevent image from breaking
                if (!container.parentElement || !container.parentElement.classList.contains('image-with-caption-wrapper')) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'image-with-caption-wrapper';
                    container.parentNode.insertBefore(wrapper, container);
                    wrapper.appendChild(container);
                }
            });
            
            // Also handle standalone images with captions as next siblings
            const standaloneImages = Array.from(contentDiv.querySelectorAll('img')).filter(img => {
                return !img.closest('.featured-image') && !img.closest('.image-with-caption-wrapper');
            });
            
            standaloneImages.forEach(image => {
                const nextSibling = image.nextElementSibling;
                if (nextSibling && nextSibling.classList.contains('image-caption')) {
                    // Wrap image and caption together
                    const wrapper = document.createElement('div');
                    wrapper.className = 'image-with-caption-wrapper';
                    image.parentNode.insertBefore(wrapper, image);
                    wrapper.appendChild(image);
                    wrapper.appendChild(nextSibling);
                } else {
                    // Even without caption, wrap standalone images to prevent breaking
                    if (!image.closest('.image-with-caption-wrapper')) {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'image-with-caption-wrapper';
                        image.parentNode.insertBefore(wrapper, image);
                        wrapper.appendChild(image);
                    }
                }
            });
        });
    });
}

// Auto-load default newsletter on page load
// Function to get current mode
function getCurrentMode() {
    const modeSelect = document.getElementById('mode-select');
    const mode = modeSelect ? modeSelect.value : 'normal';
    // If no mode selected (placeholder), default to normal
    return mode || 'normal';
}

// Function to apply mode to all newsletter pages
function applyModeToPages() {
    const mode = getCurrentMode();
    const pages = document.querySelectorAll('.newsletter-page');
    console.log('applyModeToPages: mode =', mode, 'pages found =', pages.length);
    
    // Automatically get all modes from select options (excluding 'normal')
    const modeSelect = document.getElementById('mode-select');
    const allModes = [];
    if (modeSelect) {
        Array.from(modeSelect.options).forEach(option => {
            const value = option.value;
            if (value && value !== 'normal') {
                allModes.push(value);
            }
        });
    }
    
    pages.forEach(page => {
        // Remove all mode classes
        allModes.forEach(modeName => {
            page.classList.remove(`mode-${modeName}`);
        });
        
        // Add the current mode class if not 'normal'
        if (mode && mode !== 'normal') {
            page.classList.add(`mode-${mode}`);
            console.log(`Added mode-${mode} to page`);
        } else {
            console.log('Mode is normal, no class added');
        }
    });
    
    // Update example images on mobile
    updateExampleImages();
    
    // Track mode change
    if (typeof posthog !== 'undefined' && pages.length > 0) {
        posthog.capture('mode_changed', {
            mode: mode
        });
    }
}

// Function to update example images based on current mode (mobile only)
function updateExampleImages() {
    const mode = getCurrentMode();
    const exampleImagesContainer = document.getElementById('mobile-example-images');
    
    if (!exampleImagesContainer) return;
    
    const images = exampleImagesContainer.querySelectorAll('img');
    const imageNames = ['front-page', 'page-2', 'page-3', 'page-4', 'page-5', 'page-6', 'page-7', 'page-8'];
    
    images.forEach((img, index) => {
        const baseName = imageNames[index];
        // Update image source based on current mode
        img.src = `example-output/${mode}/${baseName}.jpg`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    // Track page load
    if (typeof posthog !== 'undefined') {
        posthog.capture('page_loaded');
    }
    
    let defaultURL = document.getElementById('substack-url').value.trim();
    
    defaultURL = normalizeURL(defaultURL);
    
    if (defaultURL) {
        processSubstackURL(defaultURL);
    }
    
    // Add event listener for mode dropdown
    const modeSelect = document.getElementById('mode-select');
    if (modeSelect) {
        modeSelect.addEventListener('change', () => {
            applyModeToPages();
        });
    }
    
    // Add resize listener to update page visibility when window size changes
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            updatePageVisibility();
            updateMobileElements(); // Update mobile elements on resize
        }, 100);
    });
});


