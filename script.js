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
    // Use both window width and matchMedia for better Safari compatibility
    const width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    return width <= 768 || window.matchMedia('(max-width: 768px)').matches;
}

// Function to update page visibility based on screen size
function updatePageVisibility() {
    const pages = document.querySelectorAll('.newsletter-page');
    const bodyPages = document.querySelectorAll('.body-pages');
    const mobile = isMobile();
    
    if (mobile) {
        // On mobile: hide pages 2+ using inline styles (highest priority)
        pages.forEach((page, idx) => {
            if (idx === 0) {
                // Show first page on mobile
                page.style.display = 'flex';
            } else {
                // Hide pages 2+ on mobile
                page.style.display = 'none';
            }
        });
        
        // Hide all body-pages on mobile
        bodyPages.forEach(page => {
            page.style.display = 'none';
        });
    } else {
        // On desktop: remove inline styles to let CSS handle it
        // This is critical for Safari which respects CSS rules when inline styles are removed
        pages.forEach((page) => {
            page.style.display = ''; // Remove inline style, let CSS handle it
        });
        
        bodyPages.forEach(page => {
            page.style.display = ''; // Remove inline style, let CSS handle it
        });
    }
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
// articleIndex: optional index of the article (0, 1, 2) to mark footnotes with their source article
function preprocessRSSContent(htmlContent, articleIndex = null) {
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
        // Mark which article this footnote belongs to
        if (articleIndex !== null) {
            span.setAttribute('data-article-index', articleIndex.toString());
        }
        span.textContent = text;
        
        // Replace the link with the span
        if (link.parentNode) {
            link.parentNode.replaceChild(span, link);
        }
    }

    // Preserve hyperlinked text by unwrapping non-footnote links early.
    // Example: <p><a href="...">sweatpants</a></p> => <p>sweatpants</p>
    // IMPORTANT: Do NOT touch footnote-anchor links (handled above).
    doc.querySelectorAll('a').forEach(a => {
        const isFootnoteLink =
            a.classList.contains('footnote-anchor') &&
            a.getAttribute('data-component-name') === 'FootnoteAnchorToDOM';
        if (isFootnoteLink) return;

        const parent = a.parentNode;
        if (!parent) return;

        const img = a.querySelector('img');
        if (img) {
            parent.replaceChild(img.cloneNode(true), a);
            return;
        }

        const text =
            (a.textContent || a.innerText || a.getAttribute('aria-label') || '').trim() ||
            (a.getAttribute('href') || '');
        parent.replaceChild(doc.createTextNode(text), a);
    });
    
    // Find footnote containers and ONLY footnote lists.
    // IMPORTANT: Do NOT touch normal article lists (<ul>/<ol> in the body).
    const footnoteContainerSelectors = [
        '[class*="footnote"]',
        '[class*="footnotes"]',
        '[id*="footnote"]',
        '[id*="footnotes"]'
    ];
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
    const allFootnoteContainers = new Set();
    
    // Collect footnote-related containers (for article-index tagging)
    footnoteContainerSelectors.forEach(selector => {
        doc.querySelectorAll(selector).forEach(el => {
            const hasFootnoteClass = el.classList.toString().toLowerCase().includes('footnote');
            const hasFootnoteId = (el.id || '').toLowerCase().includes('footnote');
            if (hasFootnoteClass || hasFootnoteId) {
                allFootnoteContainers.add(el);
            }
        });
    });
    
    // Mark all footnote containers with article index
    if (articleIndex !== null) {
        allFootnoteContainers.forEach(container => {
            container.setAttribute('data-article-index', articleIndex.toString());
        });
    }
    
    // Process each footnote list
    allLists.forEach(list => {
        const listItems = Array.from(list.querySelectorAll('li'));
        
        // Mark the list container and its parent containers with article index if provided
        if (articleIndex !== null) {
            list.setAttribute('data-article-index', articleIndex.toString());
            // Also mark parent containers that might be footnote containers
            let parent = list.parentElement;
            let depth = 0;
            while (parent && parent !== doc.body && depth < 5) {
                const parentClass = parent.classList.toString().toLowerCase();
                const parentId = (parent.id || '').toLowerCase();
                if (parentClass.includes('footnote') || parentId.includes('footnote')) {
                    parent.setAttribute('data-article-index', articleIndex.toString());
                }
                parent = parent.parentElement;
                depth++;
            }
        }
        
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
            footnoteText = footnoteText.trim();
            
            // Remove all newlines and normalize whitespace
            footnoteText = footnoteText.replace(/\n+/g, ' ').replace(/\r+/g, ' ').replace(/\s+/g, ' ').trim();
            
            // Mark list item with article index if provided
            if (articleIndex !== null) {
                li.setAttribute('data-article-index', articleIndex.toString());
            }
            
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
        // Pass article index to mark footnotes with their source article
        if (content) {
            content = preprocessRSSContent(content, index);
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
                footnoteText = footnoteText.trim();
                // Remove all newlines, line breaks, <br> tags content, and normalize whitespace
                // First remove any HTML line breaks
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = li.innerHTML;
                tempDiv.querySelectorAll('br').forEach(br => br.replaceWith(' '));
                footnoteText = tempDiv.textContent || footnoteText;
                footnoteText = footnoteText.trim();
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
    
    // NOTE: List processing was removed because it was causing double numbering
    // Regular ordered lists (OL) get their numbers from CSS automatically
    // Footnote lists are already processed in preprocessRSSContent()
    // This function should NOT process lists to avoid duplicate numbering
    
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

    // Remove Substack video embeds (they often leave a blank fixed-height wrapper in print)
    const videoPlayers = Array.from(doc2.querySelectorAll('[data-component-name="VideoEmbedPlayer"]'));
    if (videoPlayers.length > 0) {
        const isEffectivelyEmpty = (el) => {
            if (!el) return false;
            const text = (el.textContent || '').replace(/\s+/g, '').trim();
            if (text.length > 0) return false;
            const meaningfulChild = el.querySelector('img, picture, svg, video, audio, source, iframe, embed, object, table, ul, ol, blockquote, pre, h1, h2, h3, h4, h5, h6');
            return !meaningfulChild;
        };

        const removeEmptyParents = (startEl) => {
            let current = startEl;
            while (current && current !== doc2.body) {
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

    // Remove Substack audio embeds (they pull in duration text and "download")
    const audioPlayers = Array.from(doc2.querySelectorAll('[data-component-name="AudioEmbedPlayer"], [aria-label="Audio embed player"]'));
    if (audioPlayers.length > 0) {
        const isEffectivelyEmpty = (el) => {
            if (!el) return false;
            const text = (el.textContent || '').replace(/\s+/g, '').trim();
            if (text.length > 0) return false;
            const meaningfulChild = el.querySelector('img, picture, svg, video, audio, source, iframe, embed, object, table, ul, ol, blockquote, pre, h1, h2, h3, h4, h5, h6');
            return !meaningfulChild;
        };

        const removeEmptyParents = (startEl) => {
            let current = startEl;
            while (current && current !== doc2.body) {
                const tag = (current.tagName || '').toUpperCase();
                if (!['DIV', 'P', 'FIGURE', 'SECTION', 'ARTICLE'].includes(tag)) break;
                if (!isEffectivelyEmpty(current)) break;
                const parent = current.parentElement;
                current.remove();
                current = parent;
            }
        };

        audioPlayers.forEach(player => {
            if (!player || !player.parentElement) return;

            const wrapperCandidates = [
                player.closest('figure'),
                player.closest('[data-component-name="AudioEmbed"]'),
                player.closest('[data-component-name="AudioEmbedWithCaption"]'),
                player.closest('[data-component-name="Embed"]'),
            ].filter(Boolean);

            let removed = false;
            for (const wrapper of wrapperCandidates) {
                if (!wrapper || wrapper === doc2.body) continue;
                const clone = wrapper.cloneNode(true);
                clone.querySelectorAll('[data-component-name="AudioEmbedPlayer"], [aria-label="Audio embed player"]').forEach(el => el.remove());
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

    // Poetry / preformatted blocks: treat as normal text and remove the hide-text label
    // Two <br> in a row = stanza break (paragraph); normalize early into separate .poetry-block elements
    const preformattedBlocks = Array.from(doc2.querySelectorAll('[data-component-name="PreformattedTextBlockToDOM"], .preformatted-block'));
    preformattedBlocks.forEach(block => {
        if (!block || !block.parentNode) return;
        const next = block.nextElementSibling;
        if (next && next.classList.contains('hide-text') && next.getAttribute('contenteditable') === 'false') {
            next.remove();
        }
        block.querySelectorAll('.hide-text[contenteditable="false"]').forEach(el => el.remove());
        block.removeAttribute('data-component-name');
        block.classList.remove('preformatted-block');
        block.querySelectorAll('pre').forEach(pre => {
            const div = doc2.createElement('div');
            div.innerHTML = pre.innerHTML.replace(/\r?\n/g, '<br>');
            pre.parentNode.replaceChild(div, pre);
        });
        if (block.tagName === 'PRE') {
            const div = doc2.createElement('div');
            div.className = 'poetry-block';
            div.innerHTML = block.innerHTML.replace(/\r?\n/g, '<br>');
            block.parentNode.replaceChild(div, block);
            block = div;
        } else {
            block.classList.add('poetry-block');
        }
        // Split on two or more <br> in a row -> treat as paragraph (stanza) boundary
        const html = block.innerHTML;
        const stanzaChunks = html.split(/(?:<br\s*\/?>\s*){2,}/i).map(s => s.trim()).filter(s => s.length > 0);
        if (stanzaChunks.length > 1) {
            const parent = block.parentNode;
            stanzaChunks.forEach(chunk => {
                const stanzaDiv = doc2.createElement('div');
                stanzaDiv.className = 'poetry-block poetry-stanza';
                stanzaDiv.innerHTML = chunk;
                parent.insertBefore(stanzaDiv, block);
            });
            block.remove();
        } else if (stanzaChunks.length === 1) {
            block.classList.add('poetry-stanza');
        }
    });

    // Handle links: keep images, remove link wrappers, convert text links to plain text
    // BUT PRESERVE FOOTNOTE SPANS - they were created in preprocessing and must be kept
    // Also preserve any remaining footnote links that weren't converted yet
    doc2.querySelectorAll('a').forEach(link => {
        // Check if this is a MentionUser link - extract name from data-attrs
        const componentName = link.getAttribute('data-component-name');
        if (componentName === 'MentionUser') {
            const dataAttrs = link.getAttribute('data-attrs');
            let name = link.textContent || ''; // Fallback to text content
            
            if (dataAttrs) {
                try {
                    // Parse JSON from data-attrs attribute (may be HTML-encoded)
                    // First try parsing directly
                    let attrs;
                    try {
                        attrs = JSON.parse(dataAttrs);
                    } catch (e1) {
                        // If direct parse fails, try HTML-decoding first
                        const tempDiv = doc2.createElement('div');
                        tempDiv.innerHTML = dataAttrs;
                        const decoded = tempDiv.textContent || tempDiv.innerText || dataAttrs;
                        attrs = JSON.parse(decoded);
                    }
                    
                    if (attrs && typeof attrs === 'object' && attrs.name) {
                        name = attrs.name;
                    }
                } catch (e) {
                    // If parsing fails, fall back to text content
                    console.warn('Failed to parse data-attrs for MentionUser:', dataAttrs, e);
                }
            }
            
            // Replace link with plain text containing the name
            const textNode = doc2.createTextNode(name);
            if (link.parentNode) {
                link.parentNode.replaceChild(textNode, link);
            }
            return;
        }
        
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
            const textNode = doc2.createTextNode(text);
            link.parentNode.replaceChild(textNode, link);
        }
    });

    // Normalize lazy-loaded images (common in full article HTML, especially multi-substack mode)
    // Many Substack pages use placeholder src + data-src/data-srcset. Print/Safari can drop these if not normalized.
    const isProbablyPlaceholderSrc = (src) => {
        if (!src) return true;
        const s = src.trim().toLowerCase();
        return (
            s === 'about:blank' ||
            s.startsWith('data:') ||
            s.includes('transparent') ||
            s.includes('1x1') ||
            s.includes('blank')
        );
    };

    // <picture><source data-srcset> ... </picture>
    doc2.querySelectorAll('source').forEach(source => {
        const dataSrcset = source.getAttribute('data-srcset') || source.getAttribute('data-src');
        if (dataSrcset && !source.getAttribute('srcset')) {
            source.setAttribute('srcset', dataSrcset);
        }
    });

    doc2.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        const dataSrc =
            img.getAttribute('data-src') ||
            img.getAttribute('data-original') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('data-image') ||
            '';
        const dataSrcset =
            img.getAttribute('data-srcset') ||
            img.getAttribute('data-lazy-srcset') ||
            '';

        if (dataSrc && isProbablyPlaceholderSrc(src)) {
            img.setAttribute('src', dataSrc);
        }
        if (dataSrcset && !img.getAttribute('srcset')) {
            img.setAttribute('srcset', dataSrcset);
        }
        // If src is still missing but srcset exists, set src to first candidate for broader compatibility
        if ((!img.getAttribute('src') || img.getAttribute('src') === '') && img.getAttribute('srcset')) {
            const first = img.getAttribute('srcset').split(',')[0]?.trim()?.split(' ')[0];
            if (first) img.setAttribute('src', first);
        }

        // Encourage eager loading/decoding so images are available by print time.
        img.setAttribute('loading', 'eager');
        img.setAttribute('decoding', 'sync');
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
    // Process ALL list items, not just footnotes
    doc2.querySelectorAll('li').forEach(li => {
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

// Ensure images are ready before opening print dialog (helps Safari/Chrome not drop images)
async function waitForNewsletterImages(timeoutMs = 8000) {
    const newsletter = document.getElementById('newsletter');
    if (!newsletter) return;

    // Normalize any remaining lazy image attributes in the live DOM (defensive)
    newsletter.querySelectorAll('source').forEach(source => {
        const dataSrcset = source.getAttribute('data-srcset') || source.getAttribute('data-src');
        if (dataSrcset && !source.getAttribute('srcset')) {
            source.setAttribute('srcset', dataSrcset);
        }
    });
    newsletter.querySelectorAll('img').forEach(img => {
        const src = img.getAttribute('src') || '';
        const dataSrc =
            img.getAttribute('data-src') ||
            img.getAttribute('data-original') ||
            img.getAttribute('data-lazy-src') ||
            img.getAttribute('data-image') ||
            '';
        const isPlaceholder =
            !src ||
            src === 'about:blank' ||
            src.startsWith('data:');
        if (dataSrc && isPlaceholder) {
            img.setAttribute('src', dataSrc);
        }
        img.setAttribute('loading', 'eager');
        img.setAttribute('decoding', 'sync');
    });

    const imgs = Array.from(newsletter.querySelectorAll('img')).filter(img => !!img.getAttribute('src'));

    const loadPromises = imgs.map(img => {
        // If already loaded successfully, skip waiting
        if (img.complete && img.naturalWidth > 0) return Promise.resolve();
        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                resolve();
            };
            const timer = setTimeout(() => finish(), timeoutMs);
            img.addEventListener('load', () => { clearTimeout(timer); finish(); }, { once: true });
            img.addEventListener('error', () => { clearTimeout(timer); finish(); }, { once: true });
        });
    });

    await Promise.all(loadPromises);

    // Ask browser to decode images (best-effort)
    await Promise.all(
        imgs.map(img => (typeof img.decode === 'function' ? img.decode().catch(() => {}) : Promise.resolve()))
    );
}

// Called by the Print button (see index.html)
async function printNewsletter() {
    try {
        if (typeof posthog !== 'undefined') {
            posthog.capture('print_clicked');
        }
        await waitForNewsletterImages(8000);
    } catch (e) {
        console.warn('printNewsletter: image wait failed (continuing to print)', e);
    }
    window.print();
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
    const showAuthors = !!publication?.isMultiSubstack;
    const escapeHTML = (str) =>
        String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    const renderAuthorLine = (article) => {
        if (!showAuthors) return '';
        const author = (article?.author || '').trim();
        const substackName =
            (article?.substackName || article?.publication || article?.publicationName || '').trim();

        if (!author && !substackName) return '';
        if (author && substackName) {
            return `<div class="article-author">by ${escapeHTML(author)} from ${escapeHTML(substackName)}</div>`;
        }
        if (author) {
            return `<div class="article-author">by ${escapeHTML(author)}</div>`;
        }
        return `<div class="article-author">from ${escapeHTML(substackName)}</div>`;
    };
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
                            ${renderAuthorLine(article2)}
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
                            ${renderAuthorLine(article3)}
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
                        ${renderAuthorLine(article1)}
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
            allContent += renderAuthorLine(article);
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
                    // Safari-specific: Force remove inline styles on desktop immediately and after delay
                    if (!isMobile()) {
                        // Remove inline styles immediately
                        const pages = document.querySelectorAll('.newsletter-page, .body-pages');
                        pages.forEach(page => {
                            page.style.removeProperty('display'); // Remove inline style to let CSS handle it
                        });
                        // Also remove after a delay in case JavaScript sets them again
                        setTimeout(() => {
                            pages.forEach(page => {
                                page.style.removeProperty('display');
                            });
                        }, 200);
                    }
                    updateArticlePageReferences(limitedArticles);
                    adjustAllTitleSizes();
                    // DISABLED: preventOrphanedHeadings() causes titles to appear in wrong places when CSS columns reflow
                    // preventOrphanedHeadings(); // Prevent headings from being orphaned at bottom of columns
                    preventOrphanedImageCaptions(); // Prevent image captions from being orphaned
                    markFootnotesSections(); // Mark footnotes sections for spacing
                    
                    // DISABLED: preventOrphanedHeadings() causes titles to appear in wrong places when CSS columns reflow
                    // Retry orphaned heading detection after a short delay to catch any that were missed
                    setTimeout(() => {
                        // preventOrphanedHeadings();
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

// --- Choose Articles (article URLs) support ---
// This reuses the same "article-test" approach:
// fetch article HTML (proxy/allorigins) -> extract body_html -> preprocess/clean -> render newspaper

async function fetchArticleViaProxy(url) {
    const proxyUrl = `${CLOUDFLARE_PROXY_URL}?url=${encodeURIComponent(url)}`;
    const response = await fetchWithTimeout(proxyUrl, {}, 10000);
    if (!response.ok) throw new Error(`Proxy fetch failed: ${response.status} ${response.statusText}`);
    const text = await response.text();
    if (!text || text.length === 0) throw new Error('Proxy returned empty response');
    return text;
}

async function fetchArticleViaAllOrigins(url) {
    const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;
    const response = await fetchWithTimeout(proxyUrl, {}, 10000);
    if (!response.ok) throw new Error(`AllOrigins fetch failed: ${response.status} ${response.statusText}`);
    const data = await response.json();
    const content = data.contents || data.content || '';
    if (!content || content.length === 0) throw new Error('AllOrigins returned empty content');
    return content;
}

function extractJSONDataFromArticleHTML(html) {
    try {
        const scriptMatch = html.match(/<script[^>]*>([\s\S]*?window\._preloads[\s\S]*?)<\/script>/);
        if (!scriptMatch) return null;
        const scriptContent = scriptMatch[1];

        const templateLiteralMatch = scriptContent.match(/window\._preloads\s*=\s*JSON\.parse\(`([\s\S]*?)`\)/);
        if (templateLiteralMatch && templateLiteralMatch[1]) {
            try { return JSON.parse(templateLiteralMatch[1]); } catch (_) {}
        }

        const jsonParseMatch = scriptContent.match(/window\._preloads\s*=\s*JSON\.parse\(/);
        if (jsonParseMatch) {
            const startPos = jsonParseMatch.index + jsonParseMatch[0].length;
            const remaining = scriptContent.substring(startPos);
            let quoteChar = null;
            let quotePos = -1;

            const backtickPos = remaining.indexOf('`');
            if (backtickPos !== -1 && (quotePos === -1 || backtickPos < quotePos)) { quoteChar = '`'; quotePos = backtickPos; }
            const doubleQuotePos = remaining.indexOf('"');
            if (doubleQuotePos !== -1 && (quotePos === -1 || doubleQuotePos < quotePos)) { quoteChar = '"'; quotePos = doubleQuotePos; }
            const singleQuotePos = remaining.indexOf("'");
            if (singleQuotePos !== -1 && (quotePos === -1 || singleQuotePos < quotePos)) { quoteChar = "'"; quotePos = singleQuotePos; }

            if (quoteChar && quotePos !== -1) {
                let jsonString = '';
                let i = quotePos + 1;
                let escaped = false;
                while (i < remaining.length) {
                    const char = remaining[i];
                    if (escaped) { jsonString += char; escaped = false; }
                    else if (char === '\\') { jsonString += char; escaped = true; }
                    else if (char === quoteChar) { break; }
                    else { jsonString += char; }
                    i++;
                }
                if (jsonString.length > 0) {
                    try {
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
                    } catch (_) {}
                }
            }
        }

        const jsonParseIndex = scriptContent.indexOf('JSON.parse(');
        if (jsonParseIndex !== -1) {
            let pos = jsonParseIndex + 'JSON.parse('.length;
            while (pos < scriptContent.length && /\s/.test(scriptContent[pos])) pos++;
            if (scriptContent[pos] === '"' || scriptContent[pos] === "'" || scriptContent[pos] === '`') {
                const quoteChar = scriptContent[pos];
                const jsonStart = pos + 1;
                pos++;
                let escaped = false;
                let jsonEnd = -1;
                while (pos < scriptContent.length) {
                    const char = scriptContent[pos];
                    if (escaped) escaped = false;
                    else if (char === '\\') escaped = true;
                    else if (char === quoteChar) { jsonEnd = pos; break; }
                    pos++;
                }
                if (jsonEnd !== -1) {
                    let jsonStr = scriptContent.substring(jsonStart, jsonEnd);
                    if (quoteChar !== '`') {
                        jsonStr = jsonStr
                            .replace(/\\"/g, '"')
                            .replace(/\\'/g, "'")
                            .replace(/\\n/g, '\n')
                            .replace(/\\t/g, '\t')
                            .replace(/\\r/g, '\r')
                            .replace(/\\\\/g, '\\');
                    }
                    try { return JSON.parse(jsonStr); } catch (_) {}
                }
            }
        }
        return null;
    } catch (_) {
        return null;
    }
}

function extractArticleDataFromHTML(html) {
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const metaAuthor = doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() || '';
        // Substack name from RSS <link rel="alternate" type="application/rss+xml" ... title="...">
        const rssLink =
            doc.querySelector('link[rel="alternate"][type="application/rss+xml"][href$="/feed"]') ||
            doc.querySelector('link[rel="alternate"][type="application/rss+xml"][href*="/feed"]');
        const substackName = rssLink?.getAttribute('title')?.trim() || '';

        const cleanSubstackTitle = (rawTitle) => {
            const t = (rawTitle || '').trim();
            if (!t) return '';
            // Common Substack <title> formats:
            // "Post title - by Author - Publication"
            // "Post title | Publication"
            // Only strip obvious suffixes; prefer <h1> when available.
            const byIdx = t.toLowerCase().indexOf(' - by ');
            if (byIdx > 0) return t.slice(0, byIdx).trim();
            const pipeIdx = t.indexOf('|');
            if (pipeIdx > 0) return t.slice(0, pipeIdx).trim();
            return t;
        };
        // Substack post title is typically: <h1 class="post-title ...">Title</h1>
        const h1Title =
            doc.querySelector('h1.post-title')?.textContent?.trim() ||
            doc.querySelector('h1[class*="post-title"]')?.textContent?.trim() ||
            doc.querySelector('h1')?.textContent?.trim() ||
            '';
        const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim() || '';
        const docTitle = doc.querySelector('title')?.textContent?.trim() || '';
        const bestTitle = cleanSubstackTitle(h1Title || ogTitle || docTitle) || 'No title found';

        const bodyMarkup = doc.querySelector('.body.markup, .body-markup, [class*="body"][class*="markup"]');
        if (bodyMarkup) {
            return {
                title: bestTitle,
                body_html: bodyMarkup.innerHTML,
                body_text: bodyMarkup.textContent || bodyMarkup.innerText,
                author: metaAuthor,
                substackName,
                extracted_from: 'HTML DOM'
            };
        }

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
                return {
                    title: bestTitle,
                    body_html: element.innerHTML,
                    body_text: element.textContent || element.innerText,
                    author: metaAuthor,
                    substackName,
                    extracted_from: `HTML DOM (${selector})`
                };
            }
        }

        return null;
    } catch (_) {
        return null;
    }
}

function extractArticleDataFromJSON(jsonData) {
    if (!jsonData || !jsonData.post) return null;
    const post = jsonData.post;
    return {
        title: post.title || 'No title',
        body_html: post.body_html || '',
        body_text: post.body_text || '',
        published_at: post.published_at || '',
        author: post.publishedBylines?.[0]?.name || 'Unknown',
        publication: jsonData.pub?.name || jsonData.pub?.title || 'Unknown',
        substackName: jsonData.pub?.name || jsonData.pub?.title || '',
        extracted_from: 'JSON data'
    };
}

async function fetchSingleArticleURL(url, articleIndex) {
    const normalized = url.startsWith('http') ? url : `https://${url}`;

    let html = null;
    try {
        html = await fetchArticleViaProxy(normalized);
    } catch (proxyError) {
        html = await fetchArticleViaAllOrigins(normalized);
    }

    if (!html || html.length === 0) throw new Error('Failed to fetch article HTML (empty response)');

    let articleData = extractArticleDataFromHTML(html);
    if (!articleData) {
        const jsonData = extractJSONDataFromArticleHTML(html);
        if (jsonData) articleData = extractArticleDataFromJSON(jsonData);
    }
    if (!articleData) throw new Error('Could not find article data in page');

    let processedContent = articleData.body_html || '';
    processedContent = preprocessRSSContent(processedContent, articleIndex);
    processedContent = cleanHTMLContent(processedContent);

    return {
        title: articleData.title || 'No title',
        author: articleData.author || '',
        substackName: articleData.substackName || articleData.publication || '',
        link: normalized,
        content: processedContent,
        pubDate: articleData.published_at || '',
        articleData,
        articleIndex
    };
}

// Choose Articles mode now uses pasted ARTICLE URLs (article-test logic)
async function processMultiPublicationURLs(urlsString, newspaperTitle = 'Choose Articles') {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const newsletterContainer = document.getElementById('newsletter-container');
    const newsletterEl = document.getElementById('newsletter');
    
    loadingEl.classList.remove('hidden');
    errorEl.classList.add('hidden');
    newsletterContainer.classList.add('hidden');
    updateMobileElements();
    
    try {
        const urlStrings = urlsString
            .split(/[\n,]+/)
            .map(s => s.trim())
            .filter(Boolean);

        // Keep path (we expect full /p/... article URLs). Remove protocol + trailing slash only.
        const normalizedUrls = Array.from(new Set(urlStrings.map(u => normalizeURL(u)).filter(Boolean)));
        if (normalizedUrls.length === 0) throw new Error('No valid URLs provided');

        loadingEl.textContent = 'Getting your articles for ya… this may take a couple minutes!';

        const articles = await Promise.all(
            normalizedUrls.map((u, i) => fetchSingleArticleURL(u, i))
        );

        const title = (newspaperTitle || '').trim() || 'Choose Articles';
        const publication = {
            title,
            description: '',
            establishedDate: null,
            isMultiSubstack: true
        };

        const newsletterHTML = generateNewsletter(publication, articles);
        newsletterEl.innerHTML = newsletterHTML;
        
        // Apply mode + post-processing (same as single-publication)
        newsletterContainer.classList.remove('hidden');
        loadingEl.classList.add('hidden');
        updateMobileElements();
        
        applyModeToPages();
        updatePageVisibility();
        updateExampleImages();
        
        setTimeout(() => {
            try { trimArticle1ToFit(); } catch (e) { console.error('Error in trimArticle1ToFit:', e); }
            try { optimizeLeftColumnContent(); } catch (e) { console.error('Error in optimizeLeftColumnContent:', e); }
            
            setTimeout(() => {
                try {
                    splitPagesDynamically();
                    applyModeToPages();
                    updatePageVisibility();
                    updateArticlePageReferences(articles);
                    adjustAllTitleSizes();
                    preventOrphanedImageCaptions();
                    markFootnotesSections();
                    setTimeout(() => {
                        appendMultiSubstackDisclaimer(normalizedUrls);
                        addPageNumbers();
                    }, 100);
                } catch (e) {
                    console.error('Error in post-processing:', e);
                }
            }, 200);
        }, 500);
        
        if (typeof posthog !== 'undefined') {
            posthog.capture('newsletter_generated', {
                publication: 'CHOOSE_ARTICLES',
                article_count: articles.length,
                mode: getCurrentMode(),
                used_cache: false
            });
        }
    } catch (error) {
        console.error('Error processing choose-articles URLs:', error);
        loadingEl.classList.add('hidden');
        errorEl.textContent = 'Problem loading :( make sure each line is a full Substack ARTICLE URL like "publication.substack.com/p/post-slug" and if that doesn\'t work email me at bugs@substackprint.com';
        errorEl.classList.remove('hidden');
        
        if (typeof posthog !== 'undefined') {
            posthog.capture('newsletter_error', {
                error_message: error.message,
                url: 'choose-articles'
            });
        }
    }
}

function appendMultiSubstackDisclaimer(urls) {
    // Remove any previous disclaimer blocks (avoid duplicates on re-generate)
    document.querySelectorAll('.multi-substack-disclaimer').forEach(el => el.remove());

    const allBodyContainers = Array.from(document.querySelectorAll('.newsletter-page .article-columns-three-css'));
    let target = allBodyContainers[allBodyContainers.length - 1] || null;

    // If there is no body page (e.g., single-article case), append to the end of the featured article column.
    if (!target) {
        const firstPage = document.querySelector('.newsletter-page');
        target = firstPage?.querySelector('.article-col-right .article-content-right') || null;
    }
    if (!target) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'multi-substack-disclaimer';

    const hr = document.createElement('hr');
    wrapper.appendChild(hr);

    const heading = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = 'Articles included in your edition of the Substack Print:';
    heading.appendChild(strong);
    wrapper.appendChild(heading);

    const urlsContainer = document.createElement('div');
    urlsContainer.className = 'multi-substack-urls';
    (urls || []).forEach(u => {
        const line = document.createElement('div');
        line.className = 'multi-substack-url';
        line.textContent = u;
        urlsContainer.appendChild(line);
    });
    wrapper.appendChild(urlsContainer);

    const p2 = document.createElement('p');
    p2.textContent =
        'Don’t forget to like, comment, subscribe, and otherwise support these writers online. The Substack Print is designed to be a supplement to help you read without the distraction of the internet, but it’s important to still share your appreciation and compensate writers when financially able!';
    wrapper.appendChild(p2);

    const p3 = document.createElement('p');
    const em = document.createElement('em');
    em.textContent =
        "The Substack Print isn't affiliated with Substack HQ, it was made by artist and mischief-maker raw & feral (rawandferal.substack.com).";
    p3.appendChild(em);
    wrapper.appendChild(p3);

    const p4 = document.createElement('p');
    p4.textContent = 'substackprint.com';
    wrapper.appendChild(p4);

    target.appendChild(wrapper);
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

// Safari print workaround: Split CSS columns into 3 separate divs for print
// Safari doesn't support CSS columns in print mode, so we need to manually split content
function setupSafariPrintWorkaround() {
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (!isSafari) return; // Only needed for Safari
    
    // Store original content for restoration
    const originalContents = new Map();
    
    // Function to split content into 3 columns for print using height-based balancing
    // This matches how CSS columns balance content by height
    function splitContentForPrint(container) {
        if (container.dataset.safariPrintSplit === 'true') {
            return; // Already split
        }
        
        const originalHTML = container.innerHTML;
        originalContents.set(container, originalHTML);
        container.dataset.safariPrintSplit = 'true';
        
        // Get all direct element children (not text nodes)
        const children = Array.from(container.childNodes).filter(node => 
            node.nodeType === Node.ELEMENT_NODE
        );
        
        if (children.length === 0) return;
        
        // Calculate actual column width from container
        // Column width = (container width - 2 gaps of 0.25in) / 3
        const containerWidth = container.offsetWidth || container.getBoundingClientRect().width || 800;
        const gapSize = 96 * 0.25; // 0.25in in pixels (96 DPI)
        const columnWidth = (containerWidth - (2 * gapSize)) / 3;
        
        // Create a temporary measurement container matching print column styles exactly
        const tempContainer = document.createElement('div');
        tempContainer.className = 'safari-print-column';
        tempContainer.style.position = 'absolute';
        tempContainer.style.left = '-9999px';
        tempContainer.style.top = '-9999px';
        tempContainer.style.width = `${columnWidth}px`;
        tempContainer.style.visibility = 'hidden';
        tempContainer.style.display = 'block';
        tempContainer.style.boxSizing = 'border-box';
        // Copy relevant styles from container
        const computedStyle = window.getComputedStyle(container);
        tempContainer.style.fontFamily = computedStyle.fontFamily;
        tempContainer.style.fontSize = computedStyle.fontSize;
        tempContainer.style.lineHeight = computedStyle.lineHeight;
        document.body.appendChild(tempContainer);
        
        // Measure heights of all elements sequentially
        const elementHeights = [];
        children.forEach((child, index) => {
            const clone = child.cloneNode(true);
            // Ensure clone has same styles by copying computed styles if needed
            tempContainer.appendChild(clone);
            // Force multiple reflows for accurate measurements
            void tempContainer.offsetHeight;
            void clone.offsetHeight;
            const rect = clone.getBoundingClientRect();
            const height = rect.height || clone.offsetHeight || clone.scrollHeight || 0;
            elementHeights.push({ index, height, element: child });
            tempContainer.removeChild(clone);
        });
        
        document.body.removeChild(tempContainer);
        
        // CSS column-fill: balance algorithm simulation
        // CSS columns fill sequentially but try to balance heights
        // The key insight: CSS columns process elements in order and try to balance
        // We'll process in original order (not sorted) but balance heights
        
        // Restore original order for processing
        elementHeights.sort((a, b) => a.index - b.index);
        
        const columns = [[], [], []]; // Arrays of {index, element} for each column
        const columnHeights = [0, 0, 0]; // Total height of each column
        
        // Process elements in order (like CSS columns do)
        elementHeights.forEach(({ index, height, element }) => {
            // Find the column with minimum height (balanced fill)
            let targetCol = 0;
            let minHeight = columnHeights[0];
            
            for (let col = 1; col < 3; col++) {
                if (columnHeights[col] < minHeight) {
                    minHeight = columnHeights[col];
                    targetCol = col;
                }
            }
            
            columns[targetCol].push({ index, element });
            columnHeights[targetCol] += height;
        });
        
        // Clone children BEFORE clearing innerHTML (so we can still access them)
        const clonedChildren = children.map(child => child.cloneNode(true));
        
        // Create 3 column containers
        container.innerHTML = '';
        container.style.display = 'block';
        container.style.columnCount = '1';
        container.style.columnGap = '0';
        container.style.width = '100%';
        container.style.overflow = 'hidden';
        
        // Build columns in order, but distribute elements according to height balancing
        // We need to maintain the original order within each column, so sort by original index
        for (let col = 0; col < 3; col++) {
            const columnDiv = document.createElement('div');
            columnDiv.className = 'safari-print-column';
            
            // Get elements for this column, sorted by original index to maintain order
            const columnElements = columns[col]
                .sort((a, b) => a.index - b.index)
                .map(({ element }) => element);
            
            // Find corresponding cloned elements and append them
            columnElements.forEach(element => {
                const originalIndex = children.indexOf(element);
                if (originalIndex !== -1 && clonedChildren[originalIndex]) {
                    columnDiv.appendChild(clonedChildren[originalIndex]);
                }
            });
            
            // Ensure the column has content before appending
            if (columnDiv.children.length > 0) {
                container.appendChild(columnDiv);
            }
        }
    }
    
    // Function to restore original content
    function restoreContent(container) {
        if (container.dataset.safariPrintSplit === 'true' && originalContents.has(container)) {
            container.innerHTML = originalContents.get(container);
            container.removeAttribute('data-safari-print-split');
            container.style.display = '';
            container.style.gap = '';
            container.style.columnCount = '';
            container.style.columnGap = '';
            originalContents.delete(container);
        }
    }
    
    // Function to handle print preparation
    function prepareForPrint() {
        const containers = document.querySelectorAll('.article-columns-three-css');
        containers.forEach(container => {
            splitContentForPrint(container);
        });
    }
    
    // Function to restore after print
    function restoreAfterPrint() {
        const containers = document.querySelectorAll('.article-columns-three-css');
        containers.forEach(container => {
            restoreContent(container);
        });
    }
    
    // Handle beforeprint event
    window.addEventListener('beforeprint', prepareForPrint);
    
    // Handle afterprint event to restore
    window.addEventListener('afterprint', restoreAfterPrint);
    
    // Also handle media query change (when print preview opens)
    const mediaQuery = window.matchMedia('print');
    if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', (e) => {
            if (e.matches) {
                prepareForPrint();
            } else {
                restoreAfterPrint();
            }
        });
    } else {
        // Fallback for older browsers
        mediaQuery.addListener((e) => {
            if (e.matches) {
                prepareForPrint();
            } else {
                restoreAfterPrint();
            }
        });
    }
    
    // Also check periodically when in print preview (Safari sometimes doesn't fire events reliably)
    let printCheckInterval = null;
    window.addEventListener('beforeprint', () => {
        prepareForPrint();
        // Set up a check interval as backup
        printCheckInterval = setInterval(() => {
            if (window.matchMedia('print').matches) {
                prepareForPrint();
            } else {
                if (printCheckInterval) {
                    clearInterval(printCheckInterval);
                    printCheckInterval = null;
                }
                restoreAfterPrint();
            }
        }, 100);
    });
    
    window.addEventListener('afterprint', () => {
        if (printCheckInterval) {
            clearInterval(printCheckInterval);
            printCheckInterval = null;
        }
        restoreAfterPrint();
    });
}

// Initialize Safari print workaround when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupSafariPrintWorkaround);
} else {
    setupSafariPrintWorkaround();
}

// Anonymized user ID for tracking submission count per person (stored in localStorage)
function getAnonymizedUserId() {
    const key = 'sp_uid';
    try {
        let uid = localStorage.getItem(key);
        if (!uid) {
            uid = 'u_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
            localStorage.setItem(key, uid);
        }
        return uid;
    } catch {
        return '';
    }
}

// Fire-and-forget: log submitted URL(s) to spreadsheet (Cloudflare Worker -> Google Sheets)
// urlOrUrls: string (single) or array of strings (choose-articles: one row per URL)
function logUrlSubmission(urlOrUrls, mode) {
    if (!CLOUDFLARE_PROXY_URL || CLOUDFLARE_PROXY_URL.includes('YOUR_CLOUDFLARE')) return;
    const logUrl = CLOUDFLARE_PROXY_URL.replace(/\/?$/, '') + '/log';
    const payload = {
        mode: mode || 'single',
        timestamp: new Date().toISOString(),
        user_id: getAnonymizedUserId()
    };
    if (Array.isArray(urlOrUrls)) {
        payload.urls = urlOrUrls;
    } else {
        payload.url = urlOrUrls;
    }
    fetch(logUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).catch(() => {});
}

// Form submission handler
document.getElementById('substack-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const publicationMode =
        document.querySelector('input[name="publication-mode"]:checked')?.value || 'single';
    
    if (publicationMode === 'multi') {
        const urlsString = (document.getElementById('substack-urls')?.value || '').trim();
        const newspaperTitle = (document.getElementById('multi-newspaper-title')?.value || '').trim();
        if (!urlsString) return;
        
        // Parse URLs and send each as a separate row in Google Sheets
        const urlList = urlsString.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean).map(u => normalizeURL(u)).filter(Boolean);
        logUrlSubmission(urlList.length > 0 ? urlList : [urlsString], 'choose-articles');
        if (typeof posthog !== 'undefined') {
            posthog.capture('newsletter_requested', { url: 'choose-articles' });
        }
        
        processMultiPublicationURLs(urlsString, newspaperTitle);
        return;
    }
    
    let url = document.getElementById('substack-url').value.trim();
    url = normalizeURL(url);
    if (!url) return;
    
    logUrlSubmission(url, 'single');
    if (typeof posthog !== 'undefined') {
        posthog.capture('newsletter_requested', { url: url });
    }
    
    processSubstackURL(url);
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
    
    const article1Content = firstPage.querySelector('.article-col-right .article-content-right');
    if (!article1Content) {
        console.log('trimArticle1ToFit: No article-content-right found in article-col-right');
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
    const authorLine = articleColRight.querySelector('.article-author');
    
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
    if (authorLine) {
        const authorStyle = getComputedStyle(authorLine);
        usedHeight += authorLine.offsetHeight + parseFloat(authorStyle.marginTop) + parseFloat(authorStyle.marginBottom);
    }
    if (subtitle) {
        const subtitleStyle = getComputedStyle(subtitle);
        usedHeight += subtitle.offsetHeight + parseFloat(subtitleStyle.marginTop) + parseFloat(subtitleStyle.marginBottom);
    }
    if (description) {
        const descStyle = getComputedStyle(description);
        usedHeight += description.offsetHeight + parseFloat(descStyle.marginTop) + parseFloat(descStyle.marginBottom);
    }
    // Always reserve space for "Continued on Page 2" text
    // CSS: font-size: 0.7em, margin-top: 6px
    // Base font for article-snippet is 0.85em (typically ~13-14px), so 0.7em = ~9-10px
    // With line-height ~1.4-1.5, text height = ~13-15px
    // Plus 6px margin-top = ~19-21px total
    // Be very conservative: use 45px to ensure it's never cut off
    let continuedHeight = 45;
    if (continued) {
        // If element exists, measure it and add extra padding for safety
        const contStyle = getComputedStyle(continued);
        const actualHeight = continued.offsetHeight + parseFloat(contStyle.marginTop) + parseFloat(contStyle.marginBottom);
        // Use the larger of actual height + 15px padding, or our conservative estimate
        continuedHeight = Math.max(actualHeight + 15, 45);
        console.log('trimArticle1ToFit: continued element height:', actualHeight, 'reserved:', continuedHeight);
    } else {
        console.log('trimArticle1ToFit: continued element not found, reserving 45px');
    }
    usedHeight += continuedHeight;
    
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
        tempContainer.className = 'article-snippet';
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

// Helper function to ensure snippet has at least a few visual lines of content
// Returns HTML with at least ~2-3 lines of text (roughly 100-150 words or ~15-20 words per line estimate)
function ensureMinimumSnippetContent(content, minWords = 30) {
    if (!content || content.trim().length === 0) return '';
    
    // Parse the content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const paragraphs = Array.from(tempDiv.querySelectorAll('p'));
    
    if (paragraphs.length === 0) {
        // No paragraphs, try to extract text directly
        const text = tempDiv.textContent || '';
        const words = text.trim().split(/\s+/);
        if (words.length >= minWords) {
            return content;
        }
        // Return at least first minWords words
        const trimmedWords = words.slice(0, minWords);
        return `<p>${trimmedWords.join(' ')}</p>`;
    }
    
    // Count total words
    let totalWords = 0;
    let selectedParagraphs = [];
    
    for (const p of paragraphs) {
        const text = p.textContent || '';
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        totalWords += words.length;
        selectedParagraphs.push(p);
        
        if (totalWords >= minWords) {
            break;
        }
    }
    
    // If we have enough words, return the selected paragraphs
    if (totalWords >= minWords) {
        return selectedParagraphs.map(p => p.outerHTML).join('');
    }
    
    // Otherwise, ensure we have at least minWords from the first paragraph
    const firstParagraph = paragraphs[0];
    const firstText = firstParagraph.textContent || '';
    const firstWords = firstText.trim().split(/\s+/).filter(w => w.length > 0);
    
    if (firstWords.length >= minWords) {
        // Return first paragraph with just minWords
        const trimmedWords = firstWords.slice(0, minWords);
        return `<p>${trimmedWords.join(' ')}</p>`;
    } else {
        // Return first paragraph as-is (it's short)
        return firstParagraph.outerHTML;
    }
}

// Optimize left column content to fit as much as possible based on available space
// Balanced approach: Article 2 and Article 3 get approximately equal space
function optimizeLeftColumnContent() {
    // Store original snippet content as fallback (declare outside try for catch access)
    const originalSnippetContent = new Map();
    let articleSections = [];
    
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
        
        // Detect Safari for aggressive reflows and delayed checks
        const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
        
        // Get available height for left column - measure directly on the page
        const pagePadding = parseFloat(getComputedStyle(firstPage).paddingTop) + parseFloat(getComputedStyle(firstPage).paddingBottom);
        const masthead = firstPage.querySelector('.newsletter-masthead');
        const mastheadHeight = masthead ? masthead.offsetHeight : 0;
        const pageHeight = parseFloat(getComputedStyle(firstPage).height);
        const maxContentHeight = pageHeight - pagePadding - mastheadHeight;
        
        // Get all article sections
        articleSections = Array.from(articleColLeft.querySelectorAll('.article-section'));
        
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
        // Store original snippet content as fallback before clearing
        articleSections.forEach((section, idx) => {
            const snippet = section.querySelector('.article-snippet');
            if (snippet) {
                const originalContent = snippet.innerHTML;
                originalSnippetContent.set(section, originalContent); // Store original content
                if (!originalContent || originalContent.trim().length === 0) {
                    console.warn(`optimizeLeftColumnContent: Article ${idx + 2} original snippet is empty!`);
                } else {
                    console.log(`optimizeLeftColumnContent: Article ${idx + 2} original snippet has ${snippet.querySelectorAll('p').length} paragraphs`);
                }
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
        
        // Measure actual height of "See Page X" elements for each article
        // This will be used for dynamic margins instead of fixed values
        const article3Continued = articleSections.length >= 2 ? articleSections[articleSections.length - 1].querySelector('.article-continued') : null;
        const article3ContinuedHeight = article3Continued ? (article3Continued.offsetHeight || article3Continued.getBoundingClientRect().height || 24) : 24;
        
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
        articleSections.forEach((section, idx) => {
            const fullContent = section.getAttribute('data-full-content');
            if (fullContent && fullContent.trim().length > 0) {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = fullContent;
                const paragraphs = Array.from(tempDiv.querySelectorAll('p'));
                if (paragraphs.length === 0) {
                    console.warn(`optimizeLeftColumnContent: Article ${idx + 2} has data-full-content but no paragraphs found`);
                }
                articleParagraphs.push(paragraphs);
            } else {
                console.warn(`optimizeLeftColumnContent: Article ${idx + 2} has no data-full-content attribute`);
                articleParagraphs.push([]);
            }
        });
        
        // Early exit if no paragraphs found - keep original content
        const totalParagraphs = articleParagraphs.reduce((sum, paras) => sum + paras.length, 0);
        if (totalParagraphs === 0) {
            console.warn('optimizeLeftColumnContent: No paragraphs found in any article, keeping original content');
            // Restore original content
            articleSections.forEach((section) => {
                const snippet = section.querySelector('.article-snippet');
                if (snippet) {
                    const originalContent = originalSnippetContent.get(section);
                    if (originalContent) {
                        snippet.innerHTML = originalContent;
                        // Force reflow for Safari
                        if (isSafari) {
                            snippet.offsetHeight;
                            articleColLeft.offsetHeight;
                            void snippet.offsetHeight;
                        }
                    }
                }
            });
            return; // Exit early
        }
        
        // Safari-specific: Log paragraph counts for debugging
        if (isSafari) {
            console.log(`optimizeLeftColumnContent: Safari - Article paragraphs: ${articleParagraphs.map((p, i) => `Article ${i + 2}: ${p.length}`).join(', ')}`);
        }
        
        // Track current paragraph index for each article
        const paragraphIndices = new Array(articleSections.length).fill(0);
        let currentArticleIndex = 0;
        let hasMoreContent = true;
        let iterationsWithoutProgress = 0;
        const maxIterations = 1000; // Safety limit to prevent infinite loops
        
        // Ensure all snippets are cleared before starting the optimization loop
        articleSections.forEach((section) => {
            const snippet = section.querySelector('.article-snippet');
            if (snippet) {
                snippet.innerHTML = ''; // Ensure clean start
            }
        });
        
        // Alternate between articles, adding one paragraph at a time
        // But if an article has room and more paragraphs, keep trying that article
        for (let iteration = 0; iteration < maxIterations && hasMoreContent; iteration++) {
            hasMoreContent = false;
            let progressMade = false;
            let stayOnSameArticle = false; // Flag to continue with same article if there's room
            
            // Try to add a paragraph to the current article
            const section = articleSections[currentArticleIndex];
            const snippet = section.querySelector('.article-snippet');
            const paragraphs = articleParagraphs[currentArticleIndex];
            const currentIndex = paragraphIndices[currentArticleIndex];
            
            if (snippet && paragraphs && currentIndex < paragraphs.length) {
                const paragraph = paragraphs[currentIndex];
                const paragraphHTML = paragraph.outerHTML;
                const currentHTML = snippet.innerHTML.trim(); // Trim to avoid whitespace issues
                const testHTML = currentHTML + paragraphHTML;
                
                // Update snippet
                snippet.innerHTML = testHTML;
                // Safari needs multiple reflows
                if (isSafari) {
                    snippet.offsetHeight;
                    articleColLeft.offsetHeight;
                    void snippet.offsetHeight;
                } else {
                articleColLeft.offsetHeight; // Force reflow
                }
                
                // Measure total column height
                // Safari needs extra reflows for accurate measurements
                if (isSafari) {
                    void articleColLeft.offsetHeight;
                    void articleColLeft.scrollHeight;
                    void snippet.offsetHeight;
                }
                const currentHeight = articleColLeft.scrollHeight;
                
                // For article 3 (last article), we need extra margin for "See Page X" element
                // Use the actual measured height plus a small buffer
                const isLastArticle = currentArticleIndex === articleSections.length - 1;
                // Safari: Use slightly smaller margins to be more aggressive about filling space
                const heightMargin = isLastArticle 
                    ? (article3ContinuedHeight + (isSafari ? 5 : 10)) 
                    : (isSafari ? 30 : 50); // Dynamic margin for article 3's "See Page X"
                
                if (currentHeight <= maxContentHeight - heightMargin) {
                    // It fits, keep it
                    paragraphIndices[currentArticleIndex]++;
                    progressMade = true;
                } else {
                    // Doesn't fit, revert and try splitting
                    snippet.innerHTML = currentHTML;
                    articleColLeft.offsetHeight; // Force reflow after revert
                    
                    const text = paragraph.textContent.trim();
                    if (!text) {
                        // Empty paragraph, skip it
                        paragraphIndices[currentArticleIndex]++;
                        progressMade = true;
                        // Continue with next paragraph from same article if there's room
                        continue;
                    }
                    
                    const words = text.split(/\s+/).filter(w => w.length > 0);
                    if (words.length === 0) {
                        paragraphIndices[currentArticleIndex]++;
                        progressMade = true;
                        // Continue with next paragraph from same article if there's room
                        continue;
                    }
                    
                    let fittingWords = [];
                    
                    for (let j = 0; j < words.length; j++) {
                        // Build test paragraph with words up to and including current word
                        const testWords = [...fittingWords, words[j]];
                        const testText = testWords.join(' ');
                        const wordTestHTML = currentHTML + `<p>${testText}</p>`;
                        
                        // Test if this fits
                        snippet.innerHTML = wordTestHTML;
                        // Safari needs extra reflows for accurate measurements
                        if (isSafari) {
                            void articleColLeft.offsetHeight;
                            void articleColLeft.scrollHeight;
                            void snippet.offsetHeight;
                        } else {
                        articleColLeft.offsetHeight;
                        }
                        const wordTestHeight = articleColLeft.scrollHeight;
                        
                        // For article 3 (last article), we need extra margin for "See Page X" element
                        const isLastArticleForWord = currentArticleIndex === articleSections.length - 1;
                        // Safari: Use slightly smaller margins to be more aggressive
                        const wordHeightMargin = isLastArticleForWord 
                            ? (article3ContinuedHeight + (isSafari ? 5 : 10)) 
                            : (isSafari ? 40 : 60); // Dynamic margin for article 3's "See Page X"
                        
                        if (wordTestHeight <= maxContentHeight - wordHeightMargin) {
                            fittingWords.push(words[j]);
                            // Restore snippet to currentHTML for next test
                            snippet.innerHTML = currentHTML;
                        } else {
                            // This word doesn't fit, stop here
                            snippet.innerHTML = currentHTML; // Restore to safe state
                            break;
                        }
                    }
                    
                    // Only add if we have fitting words and it's not empty
                    if (fittingWords.length > 0) {
                        const newParagraph = `<p>${fittingWords.join(' ')}</p>`;
                        // Double-check that currentHTML doesn't already contain this exact paragraph
                        const normalizedCurrent = currentHTML.replace(/\s+/g, ' ').trim();
                        const normalizedNew = newParagraph.replace(/\s+/g, ' ').trim();
                        
                        if (!normalizedCurrent.includes(normalizedNew)) {
                            snippet.innerHTML = currentHTML + newParagraph;
                            paragraphIndices[currentArticleIndex]++;
                            progressMade = true;
                        } else {
                            // Already exists - this shouldn't happen, but skip if it does
                            snippet.innerHTML = currentHTML; // Keep current state
                        paragraphIndices[currentArticleIndex]++;
                        progressMade = true;
                    }
                    } else {
                        // No words fit from this paragraph - check if there's still room in column
                        snippet.innerHTML = currentHTML;
                        articleColLeft.offsetHeight;
                        const remainingHeight = articleColLeft.scrollHeight;
                        
                        // Mark this paragraph as done (we tried, it doesn't fit)
                        paragraphIndices[currentArticleIndex]++;
                        progressMade = true;
                        
                        // If we're still under the limit (with some margin) and this article has more paragraphs,
                        // stay on this article to try the next paragraph
                        const hasMoreParagraphs = paragraphIndices[currentArticleIndex] < paragraphs.length;
                        // For article 3 (last article), we need extra margin for "See Page X" element
                        const isLastArticleForStay = currentArticleIndex === articleSections.length - 1;
                        // Safari: Use smaller margins to be more aggressive about filling space
                        const stayHeightMargin = isLastArticleForStay 
                            ? (article3ContinuedHeight + (isSafari ? 5 : 10)) 
                            : (isSafari ? 20 : 30); // Dynamic margin for article 3's "See Page X"
                        // Use a smaller margin to be more aggressive about filling space, but respect article 3's margin
                        if (hasMoreParagraphs && remainingHeight < maxContentHeight - stayHeightMargin) {
                            // Still room and more paragraphs - stay on this article to fill it up
                            stayOnSameArticle = true;
                            console.log(`optimizeLeftColumnContent: Staying on article ${currentArticleIndex + 2}, remainingHeight: ${remainingHeight}, maxContentHeight: ${maxContentHeight}, margin: ${stayHeightMargin}`);
                        }
                        // Otherwise, move to next article at end of loop
                    }
                    // This article might still have more paragraphs if we didn't hit the limit
                }
            }
            
            // Check if any articles have more content
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
                // Safari: Allow more iterations without progress since measurements might be inconsistent
                // If we've gone through all articles multiple times without progress, stop
                const maxIterationsWithoutProgress = isSafari ? (articleSections.length * 4) : (articleSections.length * 2);
                if (iterationsWithoutProgress >= maxIterationsWithoutProgress) {
                    break;
                }
            }
            
            // Move to next article (round-robin), unless we should stay on same article
            if (!stayOnSameArticle) {
            currentArticleIndex = (currentArticleIndex + 1) % articleSections.length;
            } else {
                // Reset flag for next iteration
                stayOnSameArticle = false;
            }
        }
        
        const maxIterationsWithoutProgress = isSafari ? (articleSections.length * 4) : (articleSections.length * 2);
        if (iterationsWithoutProgress >= maxIterationsWithoutProgress) {
            console.log('optimizeLeftColumnContent: Stopped due to no progress');
            // Log snippet states when loop stops
            articleSections.forEach((section, idx) => {
                const snippet = section.querySelector('.article-snippet');
                if (snippet) {
                    const paragraphs = snippet.querySelectorAll('p');
                    const snippetText = snippet.textContent || snippet.innerHTML.trim();
                    console.log(`optimizeLeftColumnContent: Article ${idx + 2} after loop stop - paragraphs: ${paragraphs.length}, text length: ${snippetText.length}`);
                    
                    // If Safari and snippet is empty, restore immediately
                    if (isSafari && (paragraphs.length === 0 || snippetText.length === 0)) {
                        console.warn(`optimizeLeftColumnContent: Safari - Article ${idx + 2} empty after loop, restoring immediately`);
                        const originalContent = originalSnippetContent.get(section);
                        if (originalContent && originalContent.trim().length > 0) {
                            const minContent = ensureMinimumSnippetContent(originalContent);
                            snippet.innerHTML = minContent;
                            snippet.offsetHeight;
                            articleColLeft.offsetHeight;
                            void snippet.offsetHeight;
                        }
                    }
                }
            });
            
            // Safari-specific: If all snippets are empty after loop, restore all original content
            if (isSafari) {
                let allEmpty = true;
                articleSections.forEach((section) => {
                    const snippet = section.querySelector('.article-snippet');
                    if (snippet) {
                        const paragraphs = snippet.querySelectorAll('p');
                        const snippetText = snippet.textContent || snippet.innerHTML.trim();
                        if (paragraphs.length > 0 && snippetText.length > 0) {
                            allEmpty = false;
                        }
                    }
                });
                
                if (allEmpty) {
                    console.error('optimizeLeftColumnContent: Safari - All snippets empty after optimization loop, restoring all original content');
                    articleSections.forEach((section, idx) => {
                        const snippet = section.querySelector('.article-snippet');
                        if (snippet) {
                            const originalContent = originalSnippetContent.get(section);
                            if (originalContent && originalContent.trim().length > 0) {
                                snippet.innerHTML = originalContent;
                                snippet.offsetHeight;
                                articleColLeft.offsetHeight;
                                void snippet.offsetHeight;
                            }
                        }
                    });
                }
            }
        }
        
        // Immediate check after optimization loop: Restore any empty snippets
        // Safari needs more aggressive restoration
        articleSections.forEach((section, idx) => {
            const snippet = section.querySelector('.article-snippet');
            if (snippet) {
                const paragraphs = snippet.querySelectorAll('p');
                const snippetText = snippet.textContent || snippet.innerHTML.trim();
                if (paragraphs.length === 0 || !snippetText || snippetText.length === 0) {
                    // Snippet is empty - restore with minimum content (few visual lines)
                    // For Safari, use full original content instead of minimum
                    const originalContent = originalSnippetContent.get(section);
                    if (originalContent && originalContent.trim().length > 0) {
                        console.warn(`optimizeLeftColumnContent: Article ${idx + 2} snippet empty after optimization, restoring`);
                        // Safari: use full original content; others: use minimum
                        const contentToRestore = isSafari ? originalContent : ensureMinimumSnippetContent(originalContent);
                        snippet.innerHTML = contentToRestore;
                        // Force reflow for Safari
                        if (isSafari) {
                            snippet.offsetHeight;
                            articleColLeft.offsetHeight;
                            void snippet.offsetHeight;
                        }
                    } else {
                        // Try to get from data-full-content
                        const fullContent = section.getAttribute('data-full-content');
                        if (fullContent) {
                            // For Safari, try to extract at least first 2 paragraphs; others: use minimum
                            if (isSafari) {
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = fullContent;
                                const paragraphs = Array.from(tempDiv.querySelectorAll('p'));
                                if (paragraphs.length > 0) {
                                    const firstFew = paragraphs.slice(0, Math.min(2, paragraphs.length));
                                    snippet.innerHTML = firstFew.map(p => p.outerHTML).join('');
                                } else {
                                    snippet.innerHTML = ensureMinimumSnippetContent(fullContent);
                                }
                            } else {
                                const minContent = ensureMinimumSnippetContent(fullContent);
                                if (minContent) {
                                    snippet.innerHTML = minContent;
                                }
                            }
                            // Force reflow for Safari
                            if (isSafari) {
                                snippet.offsetHeight;
                                articleColLeft.offsetHeight;
                                void snippet.offsetHeight;
                            }
                        }
                    }
                } else if (isSafari) {
                    // Safari: Even if content exists, force a reflow to ensure it's rendered
                    snippet.offsetHeight;
                    articleColLeft.offsetHeight;
                }
            }
        });
        
        // Safari-specific: If snippets have minimal content but there's still room, try to add more
        if (isSafari) {
            articleColLeft.offsetHeight;
            void articleColLeft.scrollHeight;
            const currentHeight = articleColLeft.scrollHeight;
            const hasRoom = currentHeight < maxContentHeight - 100; // 100px buffer
            
            if (hasRoom) {
                console.log(`optimizeLeftColumnContent: Safari - Column has room (${currentHeight} < ${maxContentHeight - 100}), checking for more content`);
                
                // Try to add more paragraphs to each article if they're minimal
                articleSections.forEach((section, idx) => {
                    const snippet = section.querySelector('.article-snippet');
                    if (!snippet) return;
                    
                    const currentParagraphs = snippet.querySelectorAll('p');
                    const currentText = snippet.textContent || '';
                    
                    // If snippet has very few paragraphs (1-2) or short text, try to add more
                    if (currentParagraphs.length <= 2 || currentText.length < 200) {
                        const paragraphs = articleParagraphs[idx] || [];
                        const currentIndex = paragraphIndices[idx] || 0;
                        
                        if (currentIndex < paragraphs.length) {
                            // Try adding a few more paragraphs
                            const paragraphsToAdd = paragraphs.slice(currentIndex, currentIndex + 2);
                            const additionalHTML = paragraphsToAdd.map(p => p.outerHTML).join('');
                            const testHTML = snippet.innerHTML + additionalHTML;
                            
                            snippet.innerHTML = testHTML;
                            // Force multiple reflows for Safari
                            void snippet.offsetHeight;
                            void articleColLeft.offsetHeight;
                            void articleColLeft.scrollHeight;
                            
                            const testHeight = articleColLeft.scrollHeight;
                            const isLastArticle = idx === articleSections.length - 1;
                            const testMargin = isLastArticle ? (article3ContinuedHeight + 5) : 30;
                            
                            if (testHeight <= maxContentHeight - testMargin) {
                                // It fits! Keep it
                                paragraphIndices[idx] = Math.min(currentIndex + 2, paragraphs.length);
                                void snippet.offsetHeight;
                                void articleColLeft.offsetHeight;
                                console.log(`optimizeLeftColumnContent: Safari - Added more content to article ${idx + 2}`);
                            } else {
                                // Doesn't fit, revert
                                snippet.innerHTML = snippet.innerHTML.replace(additionalHTML, '');
                                void articleColLeft.offsetHeight;
                            }
                        }
                    }
                });
            }
        }
        
        // Final verification: Ensure nothing is cut off
        articleColLeft.offsetHeight;
        const finalHeight = articleColLeft.scrollHeight;
        
        // CRITICAL CHECK: Before trimming, verify all snippets have ACTUAL text content (not just empty paragraphs)
        articleSections.forEach((section, idx) => {
            const snippet = section.querySelector('.article-snippet');
            if (snippet) {
                // Filter out empty paragraphs (only whitespace)
                const allParagraphs = Array.from(snippet.querySelectorAll('p'));
                const nonEmptyParagraphs = allParagraphs.filter(p => {
                    const text = p.textContent || p.innerText || '';
                    return text.trim().length > 0;
                });
                
                // Remove empty paragraphs from DOM
                allParagraphs.forEach(p => {
                    const text = p.textContent || p.innerText || '';
                    if (text.trim().length === 0) {
                        p.remove();
                    }
                });
                
                const snippetText = (snippet.textContent || snippet.innerHTML.trim()).replace(/\s+/g, ' ').trim();
                const hasActualContent = snippetText && snippetText.length > 10; // At least 10 characters of actual text
                
                if (nonEmptyParagraphs.length === 0 || !hasActualContent) {
                    console.error(`optimizeLeftColumnContent: PRE-TRIM CHECK - Article ${idx + 2} snippet has no actual text content (${nonEmptyParagraphs.length} non-empty paragraphs, ${snippetText.length} chars)! Restoring immediately.`);
                    const originalContent = originalSnippetContent.get(section);
                    if (originalContent && originalContent.trim().length > 0) {
                        const minContent = ensureMinimumSnippetContent(originalContent);
                        snippet.innerHTML = minContent;
                        // Remove any empty paragraphs from restored content
                        const restoredParagraphs = Array.from(snippet.querySelectorAll('p'));
                        restoredParagraphs.forEach(p => {
                            const text = p.textContent || p.innerText || '';
                            if (text.trim().length === 0) {
                                p.remove();
                            }
                        });
                        console.log(`optimizeLeftColumnContent: Article ${idx + 2} restored from original content before trim`);
                    } else {
                        const fullContent = section.getAttribute('data-full-content');
                        if (fullContent) {
                            const minContent = ensureMinimumSnippetContent(fullContent);
                            if (minContent) {
                                snippet.innerHTML = minContent;
                                // Remove any empty paragraphs from restored content
                                const restoredParagraphs = Array.from(snippet.querySelectorAll('p'));
                                restoredParagraphs.forEach(p => {
                                    const text = p.textContent || p.innerText || '';
                                    if (text.trim().length === 0) {
                                        p.remove();
                                    }
                                });
                                console.log(`optimizeLeftColumnContent: Article ${idx + 2} restored from data-full-content before trim`);
                            }
                        }
                    }
                } else {
                    console.log(`optimizeLeftColumnContent: PRE-TRIM - Article ${idx + 2} has ${nonEmptyParagraphs.length} non-empty paragraphs, ${snippetText.length} chars`);
                }
            }
        });
        
        // For article 3 (last article), we need extra margin for "See Page X" element
        // Re-measure article 3's "See Page X" height now that content is filled (more accurate)
        const article3Section = articleSections[articleSections.length - 1];
        const article3ContinuedFinal = article3Section ? article3Section.querySelector('.article-continued') : null;
        const article3ContinuedHeightFinal = article3ContinuedFinal ? (article3ContinuedFinal.offsetHeight || article3ContinuedFinal.getBoundingClientRect().height || 30) : 30;
        
        // Use dynamic margin based on actual "See Page X" height
        const trimMargin = article3ContinuedHeightFinal + 15; // Dynamic margin with buffer to account for article 3's "See Page X"
        const trimThreshold = maxContentHeight - trimMargin;
        
        // Also check if article 3's "See Page X" would be cut off
        // Get the position of article 3's "See Page X" element
        let article3ContinuedBottom = 0;
        if (article3ContinuedFinal) {
            const rect = article3ContinuedFinal.getBoundingClientRect();
            const articleColLeftRect = articleColLeft.getBoundingClientRect();
            article3ContinuedBottom = rect.bottom - articleColLeftRect.top;
        }
        
        if (finalHeight > trimThreshold || (article3ContinuedFinal && article3ContinuedBottom > maxContentHeight)) {
            console.log(`optimizeLeftColumnContent: Column still overflowing (${finalHeight} > ${trimThreshold}) or article 3 "See Page X" at ${article3ContinuedBottom}px would be cut off, trimming from end...`);
            
            // Trim from the last article backwards until it fits
            // IMPORTANT: Never leave a snippet empty - always ensure minimum content
            // But prioritize article 3's "See Page X" visibility - be more aggressive about trimming article 2
            for (let sectionIndex = articleSections.length - 1; sectionIndex >= 0; sectionIndex--) {
                const section = articleSections[sectionIndex];
                const snippet = section.querySelector('.article-snippet');
                if (!snippet) continue;
                
                const paragraphs = snippet.querySelectorAll('p');
                // For article 3, never trim if we have 1 or fewer paragraphs - ensure minimum content
                // For article 2, be more aggressive - allow trimming to 1 paragraph if needed for article 3
                const isArticle3 = sectionIndex === articleSections.length - 1;
                if (paragraphs.length <= 1 && isArticle3) continue; // Protect article 3 minimum
                // For article 2, we'll allow trimming even if it means going down to minimum content
                
                // Remove paragraphs one by one from the end, but always keep at least minimum content
                let trimmedHTML = '';
                for (let pIdx = 0; pIdx < paragraphs.length - 1; pIdx++) {
                    trimmedHTML += paragraphs[pIdx].outerHTML;
                }
                
                // Ensure we're keeping at least 1 paragraph
                if (trimmedHTML.trim().length === 0 && paragraphs.length > 0) {
                    // Keep the first paragraph as minimum
                    trimmedHTML = paragraphs[0].outerHTML;
                }
                
                // Before setting, ensure trimmedHTML has content
                if (!trimmedHTML || trimmedHTML.trim().length === 0) {
                    console.warn(`optimizeLeftColumnContent: Trimmed HTML is empty for article ${sectionIndex + 2}, skipping trim`);
                    continue; // Skip this article, don't make it empty
                }
                
                snippet.innerHTML = trimmedHTML;
                articleColLeft.offsetHeight;
                const testHeight = articleColLeft.scrollHeight;
                
                // Verify snippet still has content after trimming
                const remainingParagraphs = snippet.querySelectorAll('p');
                if (remainingParagraphs.length === 0) {
                    console.error(`optimizeLeftColumnContent: Trimming left article ${sectionIndex + 2} empty! Restoring immediately.`);
                    // Restore with minimum content immediately
                    const originalContent = originalSnippetContent.get(section);
                    if (originalContent) {
                        const minContent = ensureMinimumSnippetContent(originalContent);
                        snippet.innerHTML = minContent;
                    }
                    continue; // Skip this article
                }
                
                // Use the same margin for trimming check
                if (testHeight <= trimThreshold) {
                    break; // It fits now, stop trimming
                }
                
                // Safety check: If we've trimmed to 1 paragraph and it still doesn't fit, stop trimming this article
                if (remainingParagraphs.length <= 1) {
                    continue; // Move to next article
                }
            }
        }
        
        // Final check: Verify article 3's "See Page X" is actually visible
        // If it's still cut off, trim more aggressively from article 2
        articleColLeft.offsetHeight; // Force reflow
        const finalCheckHeight = articleColLeft.scrollHeight;
        const article3SectionFinal = articleSections[articleSections.length - 1];
        const article3ContinuedFinalCheck = article3SectionFinal ? article3SectionFinal.querySelector('.article-continued') : null;
        
        if (article3ContinuedFinalCheck) {
            const rect = article3ContinuedFinalCheck.getBoundingClientRect();
            const articleColLeftRect = articleColLeft.getBoundingClientRect();
            const article3ContinuedBottomFinal = rect.bottom - articleColLeftRect.top;
            
            // If article 3's "See Page X" is below the max height, trim more aggressively
            if (article3ContinuedBottomFinal > maxContentHeight - 5) {
                console.log(`optimizeLeftColumnContent: Article 3 "See Page X" still cut off at ${article3ContinuedBottomFinal}px (max: ${maxContentHeight}), trimming more aggressively...`);
                
                // Trim from article 2 (index 0) more aggressively
                const article2Section = articleSections[0];
                const article2Snippet = article2Section ? article2Section.querySelector('.article-snippet') : null;
                
                if (article2Snippet) {
                    const article2Paragraphs = article2Snippet.querySelectorAll('p');
                    if (article2Paragraphs.length > 1) {
                        // Remove paragraphs from the end until article 3's "See Page X" is visible
                        for (let pIdx = article2Paragraphs.length - 1; pIdx >= 1; pIdx--) {
                            // Remove last paragraph
                            article2Paragraphs[pIdx].remove();
                            articleColLeft.offsetHeight; // Force reflow
                            
                            // Check if article 3's "See Page X" is now visible
                            const newRect = article3ContinuedFinalCheck.getBoundingClientRect();
                            const newBottom = newRect.bottom - articleColLeftRect.top;
                            
                            if (newBottom <= maxContentHeight - 5) {
                                console.log(`optimizeLeftColumnContent: Article 3 "See Page X" now visible at ${newBottom}px`);
                                break; // It's visible now, stop trimming
                            }
                        }
                    } else if (article2Paragraphs.length === 1) {
                        // Only one paragraph left - try splitting it by words
                        const lastParagraph = article2Paragraphs[0];
                        const text = lastParagraph.textContent || '';
                        const words = text.split(/\s+/).filter(w => w.length > 0);
                        
                        if (words.length > 10) {
                            // Remove words from the end until article 3's "See Page X" is visible
                            for (let wordIdx = words.length - 1; wordIdx >= 10; wordIdx--) {
                                const newText = words.slice(0, wordIdx).join(' ');
                                lastParagraph.textContent = newText;
                                articleColLeft.offsetHeight; // Force reflow
                                
                                // Check if article 3's "See Page X" is now visible
                                const newRect = article3ContinuedFinalCheck.getBoundingClientRect();
                                const newBottom = newRect.bottom - articleColLeftRect.top;
                                
                                if (newBottom <= maxContentHeight - 5) {
                                    console.log(`optimizeLeftColumnContent: Article 3 "See Page X" now visible after word trimming at ${newBottom}px`);
                                    break; // It's visible now, stop trimming
                                }
                            }
                        }
                    }
                }
            }
        }
        
        // Check after trimming: Restore any snippets that became empty
        // Safari needs aggressive restoration and forced reflows
        
        articleSections.forEach((section, idx) => {
            const snippet = section.querySelector('.article-snippet');
            if (snippet) {
                const paragraphs = snippet.querySelectorAll('p');
                const snippetText = snippet.textContent || snippet.innerHTML.trim();
                if (paragraphs.length === 0 || !snippetText || snippetText.length === 0) {
                    // Snippet is empty after trimming - restore with minimum content (few visual lines)
                    const originalContent = originalSnippetContent.get(section);
                    if (originalContent && originalContent.trim().length > 0) {
                        console.warn(`optimizeLeftColumnContent: Article ${idx + 2} snippet empty after trimming, restoring with minimum content`);
                        const minContent = ensureMinimumSnippetContent(originalContent);
                        snippet.innerHTML = minContent;
                        // Force reflow for Safari
                        if (isSafari) {
                            snippet.offsetHeight;
                            articleColLeft.offsetHeight;
                            void snippet.offsetHeight;
                        }
                    } else {
                        // Try to get from data-full-content
                        const fullContent = section.getAttribute('data-full-content');
                        if (fullContent) {
                            const minContent = ensureMinimumSnippetContent(fullContent);
                            if (minContent) {
                                snippet.innerHTML = minContent;
                                // Force reflow for Safari
                                if (isSafari) {
                                    snippet.offsetHeight;
                                    articleColLeft.offsetHeight;
                                    void snippet.offsetHeight;
                                }
                            }
                        }
                    }
                }
            }
        });
        
        // Pre-check: Ensure all snippets have content before fixing widows
        // This prevents fixWidowsInSnippets from making snippets empty
        articleSections.forEach((section) => {
            const snippet = section.querySelector('.article-snippet');
            if (snippet) {
                const snippetText = snippet.textContent || snippet.innerHTML.trim();
                if (!snippetText || snippetText.length === 0) {
                    // Snippet is empty, restore with minimum content (few visual lines)
                    const originalContent = originalSnippetContent.get(section);
                    if (originalContent) {
                        console.warn('optimizeLeftColumnContent: Pre-check - restoring with minimum content for empty snippet');
                        const minContent = ensureMinimumSnippetContent(originalContent);
                        snippet.innerHTML = minContent;
                        // Force reflow for Safari
                        if (isSafari) {
                            snippet.offsetHeight;
                            articleColLeft.offsetHeight;
                            void snippet.offsetHeight;
                        }
                    } else {
                        // If no original content, try to get from data-full-content
                        const fullContent = section.getAttribute('data-full-content');
                        if (fullContent) {
                            const minContent = ensureMinimumSnippetContent(fullContent);
                            if (minContent) {
                                snippet.innerHTML = minContent;
                                // Force reflow for Safari
                                if (isSafari) {
                                    snippet.offsetHeight;
                                    articleColLeft.offsetHeight;
                                    void snippet.offsetHeight;
                                }
                            }
                        }
                    }
                }
            }
        });
        
        // Fix widows (single words at end of line) for articles 2 and 3
        fixWidowsInSnippets(articleSections);
        
        // Final safety check: Ensure all snippets have content after fixing widows
        articleSections.forEach((section, idx) => {
            const snippet = section.querySelector('.article-snippet');
            if (snippet) {
                const snippetText = snippet.textContent || snippet.innerHTML.trim();
                const paragraphs = snippet.querySelectorAll('p');
                if (!snippetText || snippetText.length === 0 || paragraphs.length === 0) {
                    // Snippet is empty, restore with minimum content (few visual lines)
                    const originalContent = originalSnippetContent.get(section);
                    if (originalContent && originalContent.trim().length > 0) {
                        console.warn(`optimizeLeftColumnContent: Final check - Article ${idx + 2} snippet empty, restoring with minimum content`);
                        // For Safari, use full original content; others: use minimum
                        const contentToRestore = isSafari ? originalContent : ensureMinimumSnippetContent(originalContent);
                        snippet.innerHTML = contentToRestore;
                        // Force reflow for Safari
                        if (isSafari) {
                            snippet.offsetHeight;
                            articleColLeft.offsetHeight;
                            void snippet.offsetHeight;
                        }
                    } else {
                        // If no original content, try to get from data-full-content
                        const fullContent = section.getAttribute('data-full-content');
                        if (fullContent) {
                            // For Safari, use first 2 paragraphs; others: use minimum
                            let contentToRestore;
                            if (isSafari) {
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = fullContent;
                                const paragraphs = Array.from(tempDiv.querySelectorAll('p'));
                                if (paragraphs.length > 0) {
                                    const firstTwo = paragraphs.slice(0, Math.min(2, paragraphs.length));
                                    contentToRestore = firstTwo.map(p => p.outerHTML).join('');
                                } else {
                                    contentToRestore = ensureMinimumSnippetContent(fullContent);
                                }
                            } else {
                                contentToRestore = ensureMinimumSnippetContent(fullContent);
                            }
                            if (contentToRestore) {
                                console.warn(`optimizeLeftColumnContent: Article ${idx + 2} using content from data-full-content`);
                                snippet.innerHTML = contentToRestore;
                                // Force reflow for Safari
                                if (isSafari) {
                                    snippet.offsetHeight;
                                    articleColLeft.offsetHeight;
                                    void snippet.offsetHeight;
                                }
                            }
                        }
                    }
                }
            }
        });
        
        // Safari-specific final verification: Double-check content is actually visible
        if (isSafari) {
            setTimeout(() => {
                let needsRestore = false;
                articleSections.forEach((section, idx) => {
                    const snippet = section.querySelector('.article-snippet');
                    if (snippet) {
                        const paragraphs = snippet.querySelectorAll('p');
                        const snippetText = snippet.textContent || snippet.innerHTML.trim();
                        if (paragraphs.length === 0 || snippetText.length === 0) {
                            console.error(`optimizeLeftColumnContent: Safari final check - Article ${idx + 2} still empty, restoring original`);
                            needsRestore = true;
                            const originalContent = originalSnippetContent.get(section);
                            if (originalContent && originalContent.trim().length > 0) {
                                snippet.innerHTML = originalContent;
                                snippet.offsetHeight;
                                articleColLeft.offsetHeight;
                                void snippet.offsetHeight;
                            }
                        }
                    }
                });
                if (needsRestore) {
                    console.warn('optimizeLeftColumnContent: Safari - Had to restore content in final check');
                }
            }, 1500); // Longer delay for Safari
        }
        
        // ULTIMATE SAFETY CHECK: Force all snippets to have content before returning
        // This is a last resort to ensure content is never empty
        articleSections.forEach((section, idx) => {
            const snippet = section.querySelector('.article-snippet');
            if (snippet) {
                const snippetText = snippet.textContent || snippet.innerHTML.trim();
                const paragraphs = snippet.querySelectorAll('p');
                if (!snippetText || snippetText.length === 0 || paragraphs.length === 0) {
                    console.error(`optimizeLeftColumnContent: Article ${idx + 2} snippet STILL empty after all checks - forcing restore`);
                    
                    // Try original content first - full content for Safari, minimum for others
                    const originalContent = originalSnippetContent.get(section);
                    if (originalContent && originalContent.trim().length > 0) {
                        const contentToRestore = isSafari ? originalContent : ensureMinimumSnippetContent(originalContent);
                        snippet.innerHTML = contentToRestore;
                        if (isSafari) {
                            snippet.offsetHeight;
                            articleColLeft.offsetHeight;
                            void snippet.offsetHeight;
                        }
                        console.log(`optimizeLeftColumnContent: Article ${idx + 2} restored with ${isSafari ? 'full' : 'minimum'} content from original`);
                        return;
                    }
                    
                    // Try data-full-content - first 2 paragraphs for Safari, minimum for others
                    const fullContent = section.getAttribute('data-full-content');
                    if (fullContent) {
                        let contentToRestore;
                        if (isSafari) {
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = fullContent;
                            const paragraphs = Array.from(tempDiv.querySelectorAll('p'));
                            if (paragraphs.length > 0) {
                                const firstTwo = paragraphs.slice(0, Math.min(2, paragraphs.length));
                                contentToRestore = firstTwo.map(p => p.outerHTML).join('');
                            } else {
                                contentToRestore = ensureMinimumSnippetContent(fullContent);
                            }
                        } else {
                            contentToRestore = ensureMinimumSnippetContent(fullContent);
                        }
                        if (contentToRestore) {
                            snippet.innerHTML = contentToRestore;
                            if (isSafari) {
                                snippet.offsetHeight;
                                articleColLeft.offsetHeight;
                                void snippet.offsetHeight;
                            }
                            console.log(`optimizeLeftColumnContent: Article ${idx + 2} restored with ${isSafari ? 'first 2 paragraphs' : 'minimum content'} from data-full-content`);
                            return;
                        }
                    }
                    
                    // Last resort: at least show a placeholder
                    snippet.innerHTML = '<p>Content unavailable</p>';
                    console.error(`optimizeLeftColumnContent: Article ${idx + 2} could not be restored, showing placeholder`);
                }
            }
        });
        
        // Delayed verification check: Ensure content persists after a short delay
        // This catches cases where something might clear content after we return
        // Safari needs longer delays and more aggressive checks
        const delayedCheckDelay = isSafari ? 1000 : 500;
        setTimeout(() => {
            const stillEmptySnippets = [];
            articleSections.forEach((section, idx) => {
                const snippet = section.querySelector('.article-snippet');
                if (snippet) {
                    const snippetText = snippet.textContent || snippet.innerHTML.trim();
                    const paragraphs = snippet.querySelectorAll('p');
                    if (!snippetText || snippetText.length === 0 || paragraphs.length === 0) {
                        console.error(`optimizeLeftColumnContent: Article ${idx + 2} snippet empty after ${delayedCheckDelay}ms delay - restoring`);
                        stillEmptySnippets.push({section, idx});
                    }
                }
            });
            
            // Restore empty snippets with forced reflows for Safari
            stillEmptySnippets.forEach(({section, idx}) => {
                const snippet = section.querySelector('.article-snippet');
                if (snippet) {
                    const originalContent = originalSnippetContent.get(section);
                    if (originalContent && originalContent.trim().length > 0) {
                        // Safari: use full original content; others: use minimum
                        const contentToRestore = isSafari ? originalContent : ensureMinimumSnippetContent(originalContent);
                        snippet.innerHTML = contentToRestore;
                        // Force multiple reflows for Safari
                        if (isSafari) {
                            snippet.offsetHeight;
                            articleColLeft.offsetHeight;
                            void snippet.offsetHeight;
                            // Force another reflow after a micro-delay
                            setTimeout(() => {
                                snippet.offsetHeight;
                                articleColLeft.offsetHeight;
                            }, 10);
                        }
                    } else {
                        const fullContent = section.getAttribute('data-full-content');
                        if (fullContent) {
                            // Safari: use first 2 paragraphs; others: use minimum
                            let contentToRestore;
                            if (isSafari) {
                                const tempDiv = document.createElement('div');
                                tempDiv.innerHTML = fullContent;
                                const paragraphs = Array.from(tempDiv.querySelectorAll('p'));
                                if (paragraphs.length > 0) {
                                    const firstTwo = paragraphs.slice(0, Math.min(2, paragraphs.length));
                                    contentToRestore = firstTwo.map(p => p.outerHTML).join('');
                                } else {
                                    contentToRestore = ensureMinimumSnippetContent(fullContent);
                                }
                            } else {
                                contentToRestore = ensureMinimumSnippetContent(fullContent);
                            }
                            if (contentToRestore) {
                                snippet.innerHTML = contentToRestore;
                                // Force multiple reflows for Safari
                                if (isSafari) {
                                    snippet.offsetHeight;
                                    articleColLeft.offsetHeight;
                                    void snippet.offsetHeight;
                                    // Force another reflow after a micro-delay
                                    setTimeout(() => {
                                        snippet.offsetHeight;
                                        articleColLeft.offsetHeight;
                                    }, 10);
                                }
                            }
                        }
                    }
                }
            });
        }, delayedCheckDelay);
        
    } catch (error) {
        console.error('optimizeLeftColumnContent error:', error);
        // Restore original content on error with minimum content
        articleSections.forEach((section) => {
            const snippet = section.querySelector('.article-snippet');
            if (snippet) {
                const originalContent = originalSnippetContent.get(section);
                if (originalContent) {
                    const minContent = ensureMinimumSnippetContent(originalContent);
                    snippet.innerHTML = minContent;
                }
            }
        });
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
        
        // Never remove the last paragraph if it's the only paragraph
        if (paragraphs.length === 1) {
            return; // Keep at least one paragraph
        }
        
        // Check the last paragraph
        const lastParagraph = paragraphs[paragraphs.length - 1];
        const text = lastParagraph.textContent || '';
        const words = text.trim().split(/\s+/);
        
        // If the last paragraph has only one word, remove it (only if we have more than one paragraph)
        if (words.length === 1 && paragraphs.length > 1) {
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
    const mobile = isMobile();
    pages.forEach((p, idx) => {
        if (mobile) {
            // On mobile, only show first page
            if (idx === 0) {
        p.style.display = 'flex';
            } else {
                p.style.display = 'none';
            }
        } else {
            // On desktop, remove inline styles to let CSS handle it (important for Safari)
            p.style.display = '';
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
        // Safari may need explicit calculation instead of relying on computed maxHeight
        const pageHeight = parseFloat(getComputedStyle(page).height) || 11 * 96; // 11in in pixels
        const mastheadHeight = page.querySelector('.newsletter-masthead') ? 
            page.querySelector('.newsletter-masthead').offsetHeight : 0;
        const padding = parseFloat(getComputedStyle(page).paddingTop) + parseFloat(getComputedStyle(page).paddingBottom);
        const maxHeight = (pageHeight - mastheadHeight - padding) || parseFloat(getComputedStyle(contentArea).maxHeight) || (10.5 * 96);
        console.log('Page', pageIndex, 'maxHeight:', maxHeight, 'pageHeight:', pageHeight, 'mastheadHeight:', mastheadHeight);
        if (!maxHeight || maxHeight <= 0) {
            console.warn('Invalid maxHeight, using fallback');
            continue;
        }
        
        // Check if content overflows
        // CSS columns with overflow:hidden clips content, so scrollHeight might equal clientHeight
        // We need to temporarily remove overflow to measure actual content height
        const originalOverflow = contentDiv.style.overflow;
        const originalMaxHeight = contentDiv.style.maxHeight;
        const originalColumnCount = contentDiv.style.columnCount;
        
        // Temporarily allow overflow to measure actual content height
        contentDiv.style.overflow = 'visible';
        contentDiv.style.maxHeight = 'none';
        contentDiv.style.columnCount = 'auto'; // Temporarily disable columns to get true height
        
        // Force reflow - Safari needs multiple reflows
        contentDiv.offsetHeight;
        void contentDiv.offsetHeight; // Force another reflow
        
        const contentHeight = contentDiv.scrollHeight;
        const containerHeight = contentArea.clientHeight || maxHeight;
        
        // Restore original styles
        contentDiv.style.overflow = originalOverflow;
        contentDiv.style.maxHeight = originalMaxHeight;
        contentDiv.style.columnCount = originalColumnCount;
        
        const elementCount = contentDiv.children.length;
        const overflowRatio = contentHeight / containerHeight;
        
        console.log('Page', pageIndex, 'contentHeight:', contentHeight, 'containerHeight:', containerHeight, 'ratio:', overflowRatio.toFixed(2), 'elements:', elementCount);
        
        // Check if content overflows - if so, split into multiple pages
        // Use a threshold that accounts for CSS column balancing
        // Also check element count as a fallback - if we have many elements, likely overflow
        const hasOverflow = contentHeight > containerHeight * 1.05 || (elementCount > 50 && contentHeight > containerHeight * 0.8);
        
        if (hasOverflow) {
            console.log('Content overflows on page', pageIndex, '- splitting. Content height:', contentHeight, 'Container height:', containerHeight, 'Elements:', elementCount);
            
            // Content overflows - split into multiple pages
            // Get all child elements
            const elements = Array.from(contentDiv.children);
            console.log('Found', elements.length, 'elements to split');
            if (elements.length === 0) continue;
            
            // Split pages element by element - allows articles to span multiple pages
            let currentPage = page;
            let currentContentDiv = contentDiv;
            let currentPageContent = '';
            let pagesCreated = 0;
            
            for (let i = 0; i < elements.length; i++) {
                const element = elements[i];
                const elementHTML = element.outerHTML;
                
                // Normal element processing: Test if adding this element would cause overflow
                const testContent = currentPageContent + elementHTML;
                
                // Create a temporary div to measure height - must match actual CSS exactly
                const testDiv = document.createElement('div');
                testDiv.className = 'article-columns-three-css';
                const computedStyle = getComputedStyle(contentDiv);
                testDiv.style.position = 'absolute';
                testDiv.style.visibility = 'hidden';
                testDiv.style.width = contentDiv.offsetWidth + 'px';
                testDiv.style.height = 'auto';
                testDiv.style.fontSize = computedStyle.fontSize;
                testDiv.style.lineHeight = computedStyle.lineHeight;
                testDiv.style.columnCount = computedStyle.columnCount || '3';
                testDiv.style.columnGap = computedStyle.columnGap || '20px';
                testDiv.style.columnFill = computedStyle.columnFill || 'auto';
                testDiv.style.maxHeight = maxHeight + 'px';
                testDiv.style.overflow = 'visible';
                testDiv.innerHTML = testContent;
                document.body.appendChild(testDiv);
                
                // Force reflow - Safari needs multiple reflows
                testDiv.offsetHeight;
                void testDiv.offsetHeight;
                
                // Check if content overflows - temporarily remove maxHeight to get true height
                const testMaxHeight = testDiv.style.maxHeight;
                testDiv.style.maxHeight = 'none';
                const testHeight = testDiv.scrollHeight;
                testDiv.style.maxHeight = testMaxHeight;
                document.body.removeChild(testDiv);
                
                // If adding this element causes overflow, create a new page
                // Use a threshold very close to maxHeight to fill pages more before splitting
                // Also check if we've accumulated enough elements (every ~40-50 elements should be a page)
                const overflowThreshold = maxHeight * 0.98; // 98% of maxHeight - fill pages more
                const elementCountOnPage = (currentPageContent.match(/<[^>]+>/g) || []).length;
                const shouldCreatePage = testHeight > overflowThreshold || (elementCountOnPage > 50 && testHeight > maxHeight * 0.90);
                
                if (shouldCreatePage) {
                    // If current page already has content, finalize it and create new page
                    if (currentPageContent.trim() !== '') {
                        console.log('Creating new page after element', i, 'testHeight:', testHeight, 'maxHeight:', maxHeight, 'threshold:', overflowThreshold);
                        
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
                        const parentNode = currentPage.parentNode;
                        if (parentNode) {
                            parentNode.insertBefore(newPage, currentPage.nextSibling);
                            console.log('Inserted new page into DOM. Total pages now:', document.querySelectorAll('.newsletter-page').length);
                        } else {
                            console.error('ERROR: Cannot insert new page - parentNode is null!');
                            // Fallback: try to append to newsletter container
                            const newsletterContainer = document.getElementById('newsletter-container');
                            if (newsletterContainer) {
                                const newsletter = newsletterContainer.querySelector('#newsletter .newsletter') || newsletterContainer.querySelector('.newsletter');
                                if (newsletter) {
                                    newsletter.appendChild(newPage);
                                    console.log('Inserted new page into newsletter container as fallback');
                                } else {
                                    console.error('ERROR: Cannot find newsletter container to append page!');
                                }
                            }
                        }
                        
                        // Force reflow
                        newPage.offsetHeight;
                        newContentDiv.offsetHeight;
                        
                        // On mobile, immediately hide this new page (only first page should be visible)
                        if (isMobile()) {
                            newPage.style.display = 'none';
                        }
                        
                        // Move to new page
                        currentPage = newPage;
                        currentContentDiv = newContentDiv;
                        currentPageContent = elementHTML; // Start new page with the element that overflowed
                        pagesCreated++;
                        console.log('Pages created so far:', pagesCreated);
                    } else {
                        // Current page is empty but element overflows - add it anyway
                        // This handles edge case where a single large element exceeds page height
                        console.log('Element', i, 'overflows empty page, adding anyway. testHeight:', testHeight);
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
                // On mobile, only show first page; on desktop, remove inline styles to let CSS handle it
                const pageIndex = Array.from(document.querySelectorAll('.newsletter-page')).indexOf(currentPage);
                const mobile = isMobile();
                if (mobile) {
                    if (pageIndex === 0) {
                currentPage.style.display = 'flex';
                    } else {
                        currentPage.style.display = 'none';
                    }
                } else {
                    currentPage.style.display = ''; // Remove inline style on desktop
                }
                currentPage.offsetHeight; // Force reflow
            }
            
            console.log('Created', pagesCreated, 'new pages. Total elements processed:', elements.length);
            
            // Final verification: Ensure all elements were processed
            const finalPages = document.querySelectorAll('.newsletter-page');
            console.log('FINAL PAGE COUNT:', finalPages.length, 'pages found in DOM');
            finalPages.forEach((p, idx) => {
                const contentDiv = p.querySelector('.article-columns-three-css');
                const elementCount = contentDiv ? contentDiv.children.length : 0;
                const display = window.getComputedStyle(p).display;
                const inlineDisplay = p.style.display;
                console.log(`Page ${idx}: class="${p.className}", elements=${elementCount}, display=${display}, inline=${inlineDisplay || 'none'}`);
            });
            
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
                    // On mobile, only show first page; on desktop, remove inline styles to let CSS handle it
                    const pageIndex = Array.from(document.querySelectorAll('.newsletter-page')).indexOf(page);
                    const mobile = isMobile();
                    if (mobile) {
                        if (pageIndex === 0) {
                    page.style.display = 'flex';
                        } else {
                            page.style.display = 'none';
                        }
                    } else {
                        page.style.display = ''; // Remove inline style on desktop
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
            const mobile = isMobile();
            if (mobile) {
                if (lastPageIndex === 0) {
            lastPage.style.display = 'flex';
                } else {
                    lastPage.style.display = 'none';
                }
            } else {
                lastPage.style.display = ''; // Remove inline style on desktop
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
    
    // CRITICAL: Define globalFootnoteCounter OUTSIDE page loop to maintain numbering across pages
    // But reset it per article so each article starts at 1
    let globalFootnoteCounter = 0; // Sequential counter within each article (resets per article)
    let lastArticleTitle = null; // Track which article we're processing footnotes for (using title text as unique identifier)
    const articlesWithFootnotesLabels = new Set(); // Track which articles already have "Footnotes:" labels
    
    // FIRST PASS: Collect ALL footnote numbers from ALL pages BEFORE processing references
    // But footnotes sections might not be fully processed yet, so we need to look for them more broadly
    const allActualFootnoteNumbers = new Set();
    let currentMaxFootnoteNum = 0; // Track max footnote number found so far (for sequential numbering)
    
    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
        const page = pages[pageIndex];
        const contentDivs = [
            page.querySelector('.article-columns-three-css'),
            page.querySelector('.article-content'),
            page.querySelector('.article-content-right'),
            page.querySelector('.article-snippet')
        ].filter(div => div !== null);
        
        contentDivs.forEach(contentDiv => {
            // Look for footnote numbers in multiple ways:
            // 1. In footnotes sections (already processed or not yet marked)
            const footnoteSections = contentDiv.querySelectorAll('.footnotes-section, .footnotes-list, [class*="footnote"], [id*="footnote"]');
            console.log(`Page ${pageIndex}: Found ${footnoteSections.length} potential footnote sections`);
            footnoteSections.forEach(section => {
                // Never treat inline footnote references as footnote sections
                if (
                    section.classList?.contains('footnote-reference') ||
                    section.classList?.contains('footnote-anchor') ||
                    section.getAttribute?.('data-footnote-ref')
                ) {
                    return;
                }
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
            page.querySelector('.article-content-right'),
            page.querySelector('.article-snippet')
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
            // CRITICAL: Exclude inline footnote references (these are not footnote sections)
            if (
                el.classList?.contains('footnote-reference') ||
                el.classList?.contains('footnote-anchor') ||
                el.getAttribute?.('data-footnote-ref')
            ) {
                return false;
            }

            // Must have footnote-related class or ID
            const hasFootnoteClass = el.classList.toString().toLowerCase().includes('footnote');
            const hasFootnoteId = el.id.toLowerCase().includes('footnote');
            
            // Must NOT be an article title or heading
            const isTitle = el.classList.contains('article-title') || el.tagName.match(/^H[1-6]$/);

            // Must be a container-ish element (avoid stray inline elements being treated as sections)
            const isInline = el.tagName === 'SPAN' || el.tagName === 'A' || el.tagName === 'SUP';
            if (isInline) {
                return false;
            }
            
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
        
        // NOTE: globalFootnoteCounter, lastArticleTitle, and articlesWithFootnotesLabels are defined at function level, 
        // outside page loop, to maintain numbering across pages but reset per article
        
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
            
            // CRITICAL: Detect which article this footnote belongs to using data-article-index attribute
            // This attribute was added during preprocessing to mark footnotes with their source article
            let currentArticleIndex = null;
            
            // Try to find data-article-index on the footnote container or any child elements
            const articleIndexAttr = el.getAttribute('data-article-index');
            if (articleIndexAttr !== null) {
                currentArticleIndex = articleIndexAttr;
            } else {
                // Try to find it in child list items (ol > li), list containers (ol/ul), or paragraphs
                const listItemsWithIndex = Array.from(el.querySelectorAll('li[data-article-index], ol[data-article-index], ul[data-article-index]'));
                if (listItemsWithIndex.length > 0) {
                    // Use the first one found
                    currentArticleIndex = listItemsWithIndex[0].getAttribute('data-article-index');
                    // Also set it on the container for future reference
                    el.setAttribute('data-article-index', currentArticleIndex);
                } else {
                    // Fallback: Determine article by finding which article content container this is in
                    // Check all article content containers and see which one contains this footnote
                    const articleContentRight = el.closest('.article-content-right');
                    if (articleContentRight) {
                        // Article 1 (index 0) uses .article-content-right on front page
                        currentArticleIndex = '0';
                        el.setAttribute('data-article-index', '0');
                    } else {
                        // Check if it's in article-columns-three-css (articles on subsequent pages)
                        const articleColumns = el.closest('.article-columns-three-css');
                        if (articleColumns) {
                            // Find the closest article title that comes before this footnote in DOM order
                            const page = el.closest('.newsletter-page');
                            if (page) {
                                const allTitles = Array.from(page.querySelectorAll('.article-title'));
                                // Find all elements between each title and this footnote
                                let articleCount = -1;
                                for (let i = 0; i < allTitles.length; i++) {
                                    const title = allTitles[i];
                                    // Check if this footnote comes after this title in DOM order
                                    const position = title.compareDocumentPosition(el);
                                    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                                        // el comes after this title, so it might belong to this article
                                        // But we need to check if there's another title after this one and before el
                                        const nextTitle = allTitles[i + 1];
                                        if (!nextTitle || !(nextTitle.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING)) {
                                            // This is the closest title before el
                                            // Determine article index: first title on page 2+ is usually article 1 continuing (0)
                                            // But this is unreliable. Better: check if we can find article sections.
                                            const articleSection = el.closest('.article-section');
                                            if (articleSection) {
                                                // Article sections on front page are articles 2 (index 1) or 3 (index 2)
                                                // But on subsequent pages, we're in article-columns-three-css
                                                // For now, try to count titles before this one
                                                articleCount = i;
                                            } else {
                                                articleCount = i;
                                            }
                                            break;
                                        }
                                    }
                                }
                                if (articleCount >= 0) {
                                    // The article index is the count of titles before this footnote
                                    // But we need to account for front page vs subsequent pages
                                    // For now, use the title count as a heuristic
                                    currentArticleIndex = articleCount.toString();
                                    el.setAttribute('data-article-index', currentArticleIndex);
                                }
                            }
                        } else {
                            // Check if it's in an article-section (front page, articles 2 or 3)
                            const articleSection = el.closest('.article-section');
                            if (articleSection) {
                                // Count article sections before this one on the same page
                                const page = el.closest('.newsletter-page');
                                if (page) {
                                    const allSections = Array.from(page.querySelectorAll('.article-section'));
                                    const sectionIndex = allSections.indexOf(articleSection);
                                    // Article sections are indexed: first = article 2 (index 1), second = article 3 (index 2)
                                    if (sectionIndex >= 0) {
                                        currentArticleIndex = (sectionIndex + 1).toString(); // 0 -> 1 (article 2), 1 -> 2 (article 3)
                                        el.setAttribute('data-article-index', currentArticleIndex);
                                    }
                                }
                            }
                        }
                    }
                }
            }
            
            // If still no index found, try one more fallback: check all paragraphs in the container
            if (currentArticleIndex === null) {
                const paragraphsWithIndex = Array.from(el.querySelectorAll('p[data-article-index]'));
                if (paragraphsWithIndex.length > 0) {
                    currentArticleIndex = paragraphsWithIndex[0].getAttribute('data-article-index');
                    el.setAttribute('data-article-index', currentArticleIndex);
                } else {
                    // Last resort: check if we can find any element with data-article-index in the container
                    const anyElementWithIndex = el.querySelector('[data-article-index]');
                    if (anyElementWithIndex) {
                        currentArticleIndex = anyElementWithIndex.getAttribute('data-article-index');
                        el.setAttribute('data-article-index', currentArticleIndex);
                    } else {
                        console.warn('Footnote container has no data-article-index attribute and could not determine article, continuing with current counter', {
                            container: el,
                            className: el.className,
                            id: el.id,
                            children: Array.from(el.children).map(c => ({ tag: c.tagName, class: c.className, id: c.id }))
                        });
                    }
                }
            }
            
            // If this is a different article than the last one, reset the counter
            if (currentArticleIndex !== null && currentArticleIndex !== lastArticleTitle) {
                // Reset counter for new article
                globalFootnoteCounter = 0;
                console.log('Resetting footnote counter for new article (index:', currentArticleIndex + ')');
                lastArticleTitle = currentArticleIndex;
            } else if (currentArticleIndex === null) {
                // If no article index found, assume it's the same article (continue counter)
                // This handles cases where footnotes span pages or weren't marked
            } else {
                // Same article, continue with current counter
            }
            
            // Add "Footnotes:" label only once per article, at the start of the first footnotes container
            // Only if there's no heading inside and this article hasn't had a label yet
            const articleKey = currentArticleIndex !== null ? currentArticleIndex : 'unknown';
            if (!articlesWithFootnotesLabels.has(articleKey)) {
                const hasHeading = el.querySelector('h1, h2, h3, h4, h5, h6');
                const hasExistingLabel = el.querySelector('.footnotes-label');
                
                if (!hasHeading && !hasExistingLabel) {
                    // Insert "Footnotes:" label as first child
                    const label = document.createElement('div');
                    label.className = 'footnotes-label';
                    label.textContent = 'Footnotes:';
                    el.insertBefore(label, el.firstChild);
                    articlesWithFootnotesLabels.add(articleKey); // Mark that this article has a label
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
                    text: numMatch ? numMatch[2].trim() : text.trim(),
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
                        footnoteText = item.text.trim();
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
                        footnoteText = textContent.trim();
                        console.log('Using number from data attribute:', footnoteNum);
                    } else {
                        // Try to get from id
                        const id = li.getAttribute('id') || '';
                        const idMatch = id.match(/(\d+)/);
                        if (idMatch) {
                            footnoteNum = idMatch[1];
                            footnoteText = textContent.trim();
                        } else {
                            // Last resort: use index (but this shouldn't happen if numbering worked)
                            console.warn('Could not find footnote number, using index:', index + 1, 'textContent:', textContent.substring(0, 50));
                            footnoteNum = (index + 1).toString();
                            footnoteText = textContent.trim();
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
        
        const contentDivClass = contentDiv.className || 'unknown';
        console.log(`Found ${footnoteRefData.length} footnote references to process in contentDiv (${contentDivClass})`);
        console.log('Footnote numbers:', footnoteRefData.map(d => d.num));
        if (footnoteRefData.length > 0) {
            console.log('Sample elements:', footnoteRefData.slice(0, 3).map(d => ({
                tag: d.element.tagName,
                dataRef: d.element.getAttribute('data-footnote-ref'),
                text: d.element.textContent?.substring(0, 20),
                num: d.num,
                className: d.element.className
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
                console.log(`Converted footnote ${num} to superscript in ${contentDivClass}`);
            } else {
                console.log(`Footnote ${num} not in allActualFootnoteNumbers (has: ${Array.from(allActualFootnoteNumbers).join(', ')})`);
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
        
        // REMOVED: Text node processing that incorrectly converted numbers to footnotes
        // Only elements with class="footnote-anchor" or class="footnote-reference" should be treated as footnotes
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

    // Publication mode toggle (One Substack vs Choose Articles)
    const singleFields = document.getElementById('single-publication-fields');
    const multiFields = document.getElementById('multi-publication-fields');
    const singleInput = document.getElementById('substack-url');
    const multiInput = document.getElementById('substack-urls');
    
    const getPublicationMode = () =>
        document.querySelector('input[name="publication-mode"]:checked')?.value || 'single';

    const applyPublicationMode = () => {
        const mode = getPublicationMode();
        const isMulti = mode === 'multi';
        
        if (singleFields) singleFields.classList.toggle('hidden', isMulti);
        if (multiFields) multiFields.classList.toggle('hidden', !isMulti);
        
        if (singleInput) singleInput.required = !isMulti;
        if (multiInput) multiInput.required = isMulti;
        
        // Clear any previous output/error when switching modes
        const errorEl = document.getElementById('error');
        const newsletterContainer = document.getElementById('newsletter-container');
        const newsletterEl = document.getElementById('newsletter');
        if (errorEl) errorEl.classList.add('hidden');
        if (newsletterContainer) newsletterContainer.classList.add('hidden');
        if (newsletterEl) newsletterEl.innerHTML = '';
        updateMobileElements();

        // Auto-generate on first switch to Choose Articles (mirrors One Substack auto-load)
        if (isMulti && multiInput) {
            const hasAutoLoaded = multiFields?.dataset?.autoLoaded === 'true';
            const urlsString = (multiInput.value || '').trim();
            if (!hasAutoLoaded && urlsString) {
                if (multiFields) multiFields.dataset.autoLoaded = 'true';
                const newspaperTitle = (document.getElementById('multi-newspaper-title')?.value || '').trim();
                processMultiPublicationURLs(urlsString, newspaperTitle);
            }
        }
    };
    
    const publicationModeRadios = document.querySelectorAll('input[name="publication-mode"]');
    if (publicationModeRadios.length > 0) {
        publicationModeRadios.forEach(r => r.addEventListener('change', applyPublicationMode));
        applyPublicationMode();
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


