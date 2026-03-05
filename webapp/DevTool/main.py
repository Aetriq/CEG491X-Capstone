import http.server
import socketserver
import webbrowser
import threading
import os

PORT = 8000

def start_server():
    handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        httpd.serve_forever()

if __name__ == "__main__":
    # Start server in a separate thread so it doesn't block the browser launch
    threading.Thread(target=start_server, daemon=True).start()
    
    # Open the local HTML file
    webbrowser.open(f"http://localhost:{PORT}")
    
    # Keep the main thread alive
    input("Press Enter to stop the server...")