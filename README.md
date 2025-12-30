# Substack to Printable Newsletter

Transform any Substack publication into a beautiful, printable newspaper-style newsletter formatted for letter-size paper (8.5" x 11").

## Features

- 📰 **Newspaper-style layout** - Multi-column grid layout with featured articles
- 🖨️ **Print-optimized** - Formatted specifically for letter-size paper
- 📱 **Easy to use** - Simply paste a Substack URL and generate
- 🎨 **Clean design** - Professional typography and spacing
- 📄 **Multiple articles** - Automatically fetches and formats recent articles

## How to Use

### Quick Start (with Proxy Server - Recommended)

1. Start the proxy server (in one terminal):
   ```bash
   python3 proxy_server.py
   ```

2. Start the web server (in another terminal):
   ```bash
   python3 -m http.server 8000
   ```

3. Open `http://localhost:8000` in your web browser

4. Enter a Substack publication URL (e.g., `https://example.substack.com` or a specific article URL)

5. Click "Generate Newsletter"

6. Review the formatted newsletter

7. Click "Print Newsletter" to print or save as PDF

### Alternative: Without Proxy Server

If you prefer not to run the proxy server, the app will try external CORS proxies, but these may be blocked by your browser's security settings.

## Supported URLs

- Publication homepage: `https://publication.substack.com`
- Individual article: `https://publication.substack.com/p/article-slug`

The tool will automatically fetch the RSS feed and format the most recent articles.

## Technical Details

- **Pure HTML/CSS/JavaScript** - No build process required
- **RSS Feed Integration** - Uses Substack's public RSS feeds
- **CORS Proxy** - Includes a local Python proxy server to handle CORS issues
- **Print CSS** - Optimized print stylesheet for letter-size paper

## Troubleshooting

### CORS Errors

If you encounter CORS errors:
1. Make sure the proxy server is running (`python3 proxy_server.py`)
2. The proxy server runs on port 8001 by default
3. If port 8001 is in use, you can change it: `python3 proxy_server.py 8002` and update the port in `script.js`

## Browser Compatibility

Works in all modern browsers (Chrome, Firefox, Safari, Edge).

## Notes

- The tool fetches articles from the RSS feed, which typically includes the most recent posts
- Limited to 10 articles per newsletter for optimal formatting
- Images and formatting are preserved from the original articles
- Links are included with URLs for reference when printing

## Future Enhancements

Potential improvements:
- Custom date range selection
- Article selection/filtering
- Custom styling options
- PDF export functionality
- Local storage for recent publications

