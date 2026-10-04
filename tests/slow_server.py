# Dev helper: a tiny server whose /sleep?ms=N responds after N ms. A test page that loads
# an image from it keeps headless Chrome's "load" event waiting, so real-time audio
# tests get to run before --dump-dom captures the page.
import http.server, time, urllib.parse
class H(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        time.sleep(int(q.get('ms', ['1000'])[0]) / 1000)
        self.send_response(200); self.send_header('Content-Type', 'image/gif'); self.end_headers()
        self.wfile.write(b'GIF89a\x01\x00\x01\x00\x00\x00\x00;')
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8766), H).serve_forever()
