from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from pathlib import Path
import json,urllib.parse
root=Path(__file__).resolve().parent
source=root.parent/'pr50-qa/apps/frontend/src/estimated'
class H(BaseHTTPRequestHandler):
 def do_GET(self):
  p=urllib.parse.urlparse(self.path).path
  with (root/'requests.jsonl').open('a') as f:f.write(json.dumps({'path':self.path})+'\n')
  if p=='/v1/preflop/datasets':b=json.dumps({'datasets':{str(x.relative_to(source))[:-5]:{} for x in source.rglob('*.json')}}).encode();typ='application/json'
  elif p.startswith('/v1/preflop/datasets/'):
   x=(source/p[len('/v1/preflop/datasets/'):]).with_suffix('.json').resolve()
   if not x.is_relative_to(source.resolve()) or not x.exists():self.send_error(404);return
   b=x.read_bytes();typ='application/json'
  elif p in ['/qa.js','/qa.css']:b=(root/p[1:]).read_bytes();typ='text/javascript' if p.endswith('.js') else 'text/css'
  elif p.startswith('/v1/'):self.send_error(404);return
  else:b=b'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/qa.css"><div id="root"></div><script type="module" src="/qa.js"></script>';typ='text/html'
  self.send_response(200);self.send_header('Content-Type',typ);self.end_headers();self.wfile.write(b)
ThreadingHTTPServer(('127.0.0.1',18450),H).serve_forever()
