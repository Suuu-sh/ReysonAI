// Local, GET-only status monitor. It cannot enqueue, lease or invoke a provider.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { stripTypeScriptTypes } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createWorkersReader, readSafeBytes } from './projection.ts';
const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=resolve(HERE,'../../..');
const ORIGIN='http://127.0.0.1:5189';
const assets:Record<string,{file:string;mime:string}>={'/':{file:'index.html',mime:'text/html; charset=utf-8'},'/app.js':{file:'app.ts',mime:'text/javascript; charset=utf-8'},'/style.css':{file:'style.css',mime:'text/css; charset=utf-8'}};
export function permittedRequest(request:Pick<IncomingMessage,'method'|'url'|'headers'|'socket'>){
 if(request.method!=='GET'||request.headers.host!=='127.0.0.1:5189'||!['127.0.0.1','::ffff:127.0.0.1'].includes(request.socket.remoteAddress??''))return false;
 if(Object.keys(request.headers).some(key=>key.toLowerCase()==='forwarded'||key.toLowerCase().startsWith('x-forwarded-')))return false;
 if(request.headers.origin!==undefined&&request.headers.origin!==ORIGIN)return false;
 if(request.headers['sec-fetch-site']&& !['same-origin','none'].includes(String(request.headers['sec-fetch-site'])))return false;
 if(request.headers.referer){try{if(new URL(String(request.headers.referer)).origin!==ORIGIN)return false;}catch{return false;}}
 return request.url==='/api/workers'||Object.hasOwn(assets,request.url??'');
}
export function workersHandler(options:{root?:string;assets?:string;reader?:()=>Promise<unknown>}={}){
 const reader=options.reader??createWorkersReader(options.root??ROOT),staticRoot=options.assets??HERE;
 return async(request:IncomingMessage,response:ServerResponse)=>{
  response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','no-referrer');response.setHeader('Cross-Origin-Resource-Policy','same-origin');
  response.setHeader('Content-Security-Policy',"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'");
  const fail=(status:number)=>{response.statusCode=status;response.setHeader('Content-Type','application/json');response.end('{"error":"monitor_unavailable"}');};
  if(!permittedRequest(request)){fail(403);return;}
  try{
   if(request.url==='/api/workers'){response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify(await reader()));return;}
   const asset=assets[request.url!],file=await readSafeBytes(resolve(staticRoot,asset.file),512*1024);if(!file){fail(404);return;}
   response.setHeader('Content-Type',asset.mime);response.end(request.url==='/app.js'?stripTypeScriptTypes(file.bytes.toString('utf8'),{mode:'strip'}):file.bytes);
  }catch{fail(503);}
 };
}
export function createWorkersServer(){return createServer(workersHandler());}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)createWorkersServer().listen(5189,'127.0.0.1');
