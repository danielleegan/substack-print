#!/usr/bin/env python3
"""
Simple CORS proxy server for fetching Substack RSS feeds
Run this alongside the main HTTP server
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.request import urlopen, Request
from urllib.error import URLError
import ssl
import json
import sys

class ProxyHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        # Extract URL from query parameter
        if self.path.startswith('/proxy?'):
            try:
                # Get the URL parameter
                query_string = self.path.split('?', 1)[1]
                params = {}
                for param in query_string.split('&'):
                    if '=' in param:
                        key, value = param.split('=', 1)
                        params[key] = value
                
                target_url = params.get('url', '')
                if not target_url:
                    self.send_error(400, "Missing 'url' parameter")
                    return
                
                # Decode URL
                import urllib.parse
                target_url = urllib.parse.unquote(target_url)
                
                # Fetch the target URL
                try:
                    # Create SSL context that doesn't verify certificates (for local dev)
                    ssl_context = ssl.create_default_context()
                    ssl_context.check_hostname = False
                    ssl_context.verify_mode = ssl.CERT_NONE
                    
                    # Create request with user agent
                    req = Request(target_url, headers={
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
                    })
                    
                    response = urlopen(req, timeout=10, context=ssl_context)
                    content = response.read()
                    content_type = response.headers.get('Content-Type', 'text/plain')
                    
                    # Send response with CORS headers
                    self.send_response(200)
                    self.send_header('Content-Type', content_type)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
                    self.send_header('Access-Control-Allow-Headers', 'Content-Type')
                    self.end_headers()
                    self.wfile.write(content)
                    
                except URLError as e:
                    self.send_error(502, f"Failed to fetch URL: {str(e)}")
                    
            except Exception as e:
                self.send_error(500, f"Server error: {str(e)}")
        else:
            self.send_error(404, "Not Found")
    
    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
    
    def log_message(self, format, *args):
        # Suppress default logging
        pass

def run(port=8001):
    server_address = ('', port)
    httpd = HTTPServer(server_address, ProxyHandler)
    print(f"Proxy server running on http://localhost:{port}")
    print("Press Ctrl+C to stop")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping proxy server...")
        httpd.shutdown()

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8001
    run(port)

