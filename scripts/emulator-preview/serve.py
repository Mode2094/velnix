"""Loopback-only preview; fixed public SDK downloads with normal TLS verification."""
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import re,urllib.request,urllib.parse,hashlib,os
project=Path(__file__).resolve().parents[2]
root=project/'build/qa/emulator-ui/web'
cache=project/'build/qa/emulator-ui/public-sdk';cache.mkdir(exist_ok=True)
class Handler(SimpleHTTPRequestHandler):
 def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(root),**kwargs)
 def end_headers(self):
  self.send_header('Content-Security-Policy',"connect-src 'self' http://127.0.0.1:9099 http://127.0.0.1:8080 http://127.0.0.1:5001; frame-src 'self' http://127.0.0.1:9099; form-action 'self'")
  super().end_headers()
 def do_GET(self):
  route=self.path.split('?')[0]
  if route=='/verified-public':
   url=urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get('url',[''])[0]
   u=urllib.parse.urlsplit(url)
   allowed=(u.hostname=='apis.google.com' and (u.path.startswith('/js/') or u.path.startswith('/_/'))) or (u.hostname=='fonts.gstatic.com' and u.path.endswith('.woff2'))
   if u.scheme!='https' or u.username or u.password or u.port or not allowed:self.send_error(403);return
   target=cache/hashlib.sha256(url.encode()).hexdigest()
   try:
    if not target.exists():
     with urllib.request.urlopen(url,timeout=30) as response:target.write_bytes(response.read())
    body=target.read_bytes()
   except Exception:self.send_error(502,'Verified public library unavailable');return
   self.send_response(200);self.send_header('Content-Type','font/woff2' if u.path.endswith('.woff2') else 'text/javascript');self.send_header('Content-Length',str(len(body)));self.send_header('Access-Control-Allow-Origin','*');self.end_headers();self.wfile.write(body);return
  if route=='/local-appcheck.js':
   body=Path(__file__).with_name('appcheck.js').read_bytes()
   self.send_response(200);self.send_header('Content-Type','text/javascript');self.end_headers();self.wfile.write(body);return
  if route=='/':
   body=(root/'index.html').read_bytes().replace(b'<head>',b'<head><script src="/local-appcheck.js"></script>')
   self.send_response(200);self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(body);return
  match=re.fullmatch(r'/firebase-sdk/(12\.19\.0)/(firebase-[a-z-]+\.js)',route)
  if match or route=='/local-gsi-client.js':
   name=match[2] if match else 'gsi-client.js'
   url=f'https://www.gstatic.com/firebasejs/{match[1]}/{name}' if match else 'https://accounts.google.com/gsi/client'
   target=cache/name
   try:
    if not target.exists():
     with urllib.request.urlopen(url,timeout=30) as response:
      if response.status!=200:raise ValueError('Public SDK download refused')
      body=response.read()
     target.write_bytes(body)
    body=target.read_bytes().replace(b'https://www.gstatic.com/firebasejs/',b'http://127.0.0.1:8767/firebase-sdk/')
   except Exception:
    self.send_error(502,'Verified public SDK download unavailable');return
   self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
  if route=='/main.dart.js':
   body=(root/'main.dart.js').read_bytes().replace(b'https://www.gstatic.com/firebasejs/',b'http://127.0.0.1:8767/firebase-sdk/').replace(b'https://accounts.google.com/gsi/client',b'http://127.0.0.1:8767/local-gsi-client.js')
   self.send_response(200);self.send_header('Content-Type','text/javascript');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body);return
  super().do_GET()
ThreadingHTTPServer(('127.0.0.1',8767),Handler).serve_forever()
