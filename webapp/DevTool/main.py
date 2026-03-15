import http.server, socketserver, threading, os, sys, subprocess, time

PORT = 8080
# Set working directory to the bundled folder or current script folder
os.chdir(sys._MEIPASS if getattr(sys, 'frozen', False) else os.path.dirname(os.path.abspath(__file__)))

last_ping = time.time()

class HeartbeatHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        global last_ping
        if self.path == '/ping':
            last_ping = time.time()
            self.send_response(200)
            self.end_headers()
        else:
            super().do_GET()
            
    # Suppress console logging to keep things fast
    def log_message(self, format, *args): pass 

# Ensure the port can be reused instantly if you restart the app
class FastTCPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True

httpd = FastTCPServer(("", PORT), HeartbeatHandler)

def monitor_heartbeat():
    while True:
        time.sleep(2)
        # If no ping is received for 5 seconds, shut down the server
        if time.time() - last_ping > 5:
            httpd.shutdown()
            os._exit(0)

threading.Thread(target=monitor_heartbeat, daemon=True).start()

# Launch Edge or Chrome in App Mode without blocking
paths = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"]
for p in paths:
    if os.path.exists(p):
        subprocess.Popen([p, f"--app=http://localhost:{PORT}", "--window-size=1200,800"])
        break

# Keep the script alive to serve files
httpd.serve_forever()