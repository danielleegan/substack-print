#!/usr/bin/env python3
"""
Script to generate cache file for rawandferal.substack.com

Usage: python3 generate-cache.py

This script fetches the RSS feed, parses it, and saves it as cache/rawandferal.json
"""

import json
import os
import sys
import ssl
import urllib.request
import urllib.parse
from datetime import datetime
from email.utils import parsedate_to_datetime
from xml.etree import ElementTree as ET
from html import unescape

# RSS feed URL
RSS_URL = 'https://rawandferal.substack.com/feed'
CACHE_FILE = os.path.join(os.path.dirname(__file__), 'cache', 'rawandferal.json')

# Ensure cache directory exists
cache_dir = os.path.join(os.path.dirname(__file__), 'cache')
os.makedirs(cache_dir, exist_ok=True)

def fetch_rss_feed(url):
    """Fetch RSS feed from URL"""
    print(f'Fetching RSS feed from: {url}')
    try:
        # Create SSL context that doesn't verify certificates (for local dev)
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (compatible; RSS-Cache-Generator/1.0)'
        })
        with urllib.request.urlopen(req, timeout=10, context=ssl_context) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f'Error fetching RSS feed: {e}')
        sys.exit(1)

def parse_rss_feed(xml_text):
    """Parse RSS feed XML and extract articles"""
    print('Parsing RSS feed...')
    
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        print(f'Error parsing XML: {e}')
        sys.exit(1)
    
    # Extract publication metadata
    channel = root.find('channel')
    if channel is None:
        print('Error: No channel element found in RSS feed')
        sys.exit(1)
    
    pub_title = channel.findtext('title', '')
    pub_description = channel.findtext('description', '')
    
    items = channel.findall('item')
    articles = []
    earliest_date = None
    
    # Get the earliest date from the last item in the RSS feed (earliest published article)
    # RSS feeds are typically ordered newest first, so the last item is the oldest
    if items:
        last_item = items[-1]
        pub_date_elem = last_item.find('pubDate')
        if pub_date_elem is not None and pub_date_elem.text:
            try:
                # Parse RFC 822 date format (common in RSS feeds)
                earliest_date = parsedate_to_datetime(pub_date_elem.text)
            except (ValueError, TypeError, AttributeError):
                pass
    
    # Second pass: Only fully process the first 3 articles
    MAX_ARTICLES = 3
    for index, item in enumerate(items[:MAX_ARTICLES]):
        title_elem = item.find('title')
        title = title_elem.text if title_elem is not None else 'Untitled'
        
        # Try to get full content from content:encoded first
        content = ''
        
        # Check for content:encoded (handles namespaces)
        for child in item:
            # Check if it's the encoded element
            tag_name = child.tag
            if 'encoded' in tag_name.lower() or tag_name.endswith('}encoded'):
                content = child.text or ''
                if content:
                    break
        
        # Fall back to description if no content:encoded
        if not content:
            desc_elem = item.find('description')
            if desc_elem is not None and desc_elem.text:
                content = desc_elem.text
                # Unescape HTML entities
                content = unescape(content)
        
        # Only store what we actually use
        articles.append({
            'title': title,
            'content': content,
            'isFeatured': index == 0
        })
    
    return {
        'articles': articles,
        'publication': {
            'title': pub_title,
            'description': pub_description,
            'establishedDate': earliest_date.isoformat() if earliest_date else None
        }
    }

def generate_cache():
    """Main function to generate cache file"""
    # Fetch RSS feed
    rss_text = fetch_rss_feed(RSS_URL)
    print('RSS feed fetched successfully')
    
    # Parse RSS feed
    feed_data = parse_rss_feed(rss_text)
    
    if not feed_data['articles']:
        print('Error: No articles found in RSS feed')
        sys.exit(1)
    
    print(f"Found {len(feed_data['articles'])} articles")
    
    # Add timestamp
    cache_data = {
        'timestamp': int(datetime.now().timestamp() * 1000),  # Milliseconds
        'publication': feed_data['publication'],
        'articles': feed_data['articles']
    }
    
    # Save to file
    with open(CACHE_FILE, 'w', encoding='utf-8') as f:
        json.dump(cache_data, f, indent=2, ensure_ascii=False)
    
    print(f'Cache file saved to: {CACHE_FILE}')
    print(f'Cache timestamp: {datetime.fromtimestamp(cache_data["timestamp"] / 1000).isoformat()}')
    print(f'Articles cached: {len(cache_data["articles"])}')

if __name__ == '__main__':
    generate_cache()

