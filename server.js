const http=require('http'),https=require('https'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const{Readable}=require('stream'),{exec}=require('child_process');
const PORT=+process.env.PORT||3000;
const D=process.env.DATA_DIR||path.join(__dirname,'data'),U=path.join(D,'uploads'),DB=path.join(D,'items.json'),TK=path.join(D,'token.txt'),OL=path.join(D,'online.json');
fs.mkdirSync(U,{recursive:true});
let items=fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):[];
const save=()=>fs.writeFileSync(DB,JSON.stringify(items));
const TOKEN=fs.existsSync(TK)?fs.readFileSync(TK,'utf8').trim():(()=>{const t=crypto.randomBytes(12).toString('hex');fs.writeFileSync(TK,t);return t})();
const json=(s,o,c=200)=>{s.writeHead(c,{'content-type':'application/json'});s.end(JSON.stringify(o))};
const body=r=>new Promise(ok=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>ok(b))});
const isLocal=r=>/^(::1|127\.|::ffff:127\.)/.test(r.socket.remoteAddress)&&!r.headers['x-forwarded-for']&&!r.headers['cf-connecting-ip']&&/^(localhost|127\.0\.0\.1)/.test(r.headers.host||'');
const authed=r=>isLocal(r)||(r.headers.cookie||'').includes('t='+TOKEN);
const ips=()=>Object.entries(os.networkInterfaces()).flatMap(([name,a])=>a.filter(i=>(i.family===4||i.family==='IPv4')&&!i.internal&&!i.address.startsWith('169.254')).map(i=>({name,ip:i.address})))
 .sort((a,b)=>(b.ip.startsWith('192.168')-a.ip.startsWith('192.168')));

// ---------- Online session = one Filebin bin (https://filebin.net/<bin>) ----------
const FB=new URL(process.env.FILEBIN_URL||'https://filebin.net'),lib=FB.protocol==='https:'?https:http;
const jar={},texts=new Map();let bin=null;
try{bin=JSON.parse(fs.readFileSync(OL,'utf8')).bin||null}catch(_){}
const setBin=b=>{bin=b;texts.clear();if(b)fs.writeFileSync(OL,JSON.stringify({bin:b}));else fs.rmSync(OL,{force:true})};
const keep=r=>{const sc=r.headers.getSetCookie?r.headers.getSetCookie():[r.headers.get('set-cookie')||''];
 for(const c of sc){const kv=c.split(';')[0],i=kv.indexOf('=');if(i>0)jar[kv.slice(0,i).trim()]=kv.slice(i+1)}};
const fb=(p,o={})=>{const h={...(o.headers||{})},c=Object.entries(jar).map(([k,v])=>k+'='+v).join('; ');if(c)h.cookie=c;
 return fetch(new URL(p,FB),{redirect:'manual',...o,headers:h})};
const enc=encodeURIComponent,safe=n=>n.replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^\.+/,'').slice(-100)||'file';
const nm=(k,from,name)=>`${k}${from}-${Date.now()}-${crypto.randomBytes(2).toString('hex')}-${name}`;
const NAME=/^([tf])([PM])-(\d+)-[a-z0-9]{4}-(.*)$/;
const MIME={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',pdf:'application/pdf',txt:'text/plain'};
const mimeOf=n=>MIME[(n.split('.').pop()||'').toLowerCase()]||'application/octet-stream';
// Downloads redirect to a short-lived presigned URL; a first request may only set a verification cookie
async function presigned(name){
 for(let i=0;i<3;i++){
  const r=await fb(`/${bin}/${enc(name)}`);
  if(r.status>=300&&r.status<400)return r.headers.get('location');
  keep(r);await r.arrayBuffer();
  if(r.status!==200)throw new Error('download '+r.status)}
 throw new Error('verification failed')}
async function textOf(n){if(texts.has(n))return texts.get(n);
 const t=await(await fetch(await presigned(n))).text();texts.set(n,t);return t}
async function flist(){
 const r=await fb(`/${bin}`,{headers:{accept:'application/json'}});
 if(r.status===404)return[];if(r.status!==200)throw new Error('list '+r.status);
 return(await r.json()).files||[]}
async function olist(){
 const out=(await flist()).map(f=>{const n=f.filename,m=n.match(NAME),o=m?m[4]:n;
  return{id:n,kind:m&&m[1]==='t'?'text':'file',from:m?(m[2]==='P'?'PC':'Phone'):'Web',name:o,size:f.bytes,
   mime:(f['content-type']&&f['content-type']!=='application/octet-stream')?f['content-type']:mimeOf(o),t:m?+m[3]:Date.parse(f.created_at)||0}});
 await Promise.all(out.filter(i=>i.kind==='text').map(async i=>{try{i.text=await textOf(i.id)}catch(_){i.text='(could not load)'}}));
 return out.sort((a,b)=>b.t-a.t)}
const up=(name,len,src)=>new Promise((ok,bad)=>{
 const r=lib.request({hostname:FB.hostname,port:FB.port||undefined,path:`/${bin}/${enc(name)}`,method:'POST',headers:{'content-length':len,'content-type':'application/octet-stream'}},res=>{
  let b='';res.on('data',c=>b+=c);res.on('end',()=>res.statusCode===201?ok():bad(new Error('upload '+res.statusCode+' '+b.slice(0,80))))});
 r.on('error',bad);Buffer.isBuffer(src)?r.end(src):src.pipe(r)});
async function onlineUpload(req,name,fl){
 let len=req.headers['content-length'],src=req,tmp;
 if(!len){tmp=path.join(os.tmpdir(),'db-'+crypto.randomUUID());await new Promise(ok=>req.pipe(fs.createWriteStream(tmp)).on('finish',ok));len=fs.statSync(tmp).size;src=fs.createReadStream(tmp)}
 try{await up(nm('f',fl,safe(name)),len,src)}finally{if(tmp)fs.rm(tmp,()=>{})}}

const pub={'/':'index.html','/sw.js':'sw.js','/manifest.json':'manifest.json','/icon.svg':'icon.svg','/qr.js':'qr.js'};
const types={'.html':'text/html','.js':'text/javascript','.json':'application/manifest+json','.svg':'image/svg+xml'};
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://x'),p=u.pathname;
 try{
 if(u.searchParams.get('k')===TOKEN&&req.method==='GET'){
  res.writeHead(302,{'set-cookie':`t=${TOKEN}; Path=/; Max-Age=31536000; SameSite=Lax`,location:'/'});return res.end()}
 if(pub[p]){const f=path.join(__dirname,'public',pub[p]);res.writeHead(200,{'content-type':types[path.extname(f)]+'; charset=utf-8'});return res.end(fs.readFileSync(f))}
 if(!authed(req))return json(res,{error:'auth'},401);
 const local=isLocal(req);
 if(p==='/api/info')return json(res,local?{local,token:TOKEN,port:PORT,ips:ips(),online:bin?{bin,url:`https://filebin.net/${bin}`}:null}:{local,online:!!bin});
 if(p==='/api/online'&&req.method==='POST'){
  if(!local)return json(res,{error:'local only'},403);
  if(JSON.parse(await body(req)).on){if(!bin)setBin('db'+crypto.randomBytes(10).toString('hex'))}
  else if(bin){await fb(`/${bin}`,{method:'DELETE'}).catch(()=>{});setBin(null)}
  return json(res,{ok:1,online:!!bin})}
 if(p==='/api/items'&&req.method==='GET')return json(res,bin?await olist():items);
 if(p==='/api/items'&&req.method==='DELETE'){
  if(bin)await Promise.all((await flist()).map(f=>fb(`/${bin}/${enc(f.filename)}`,{method:'DELETE'})));
  else{for(const i of items)fs.rm(path.join(U,i.id),()=>{});items=[];save()}
  return json(res,{ok:1})}
 const from=/Android|iPhone|iPad|Mobile/i.test(req.headers['user-agent']||'')?'Phone':'PC',fl=from==='Phone'?'M':'P';
 if(p==='/api/text'&&req.method==='POST'){
  const{text}=JSON.parse(await body(req));if(!text||!text.trim())return json(res,{error:'empty'},400);
  if(bin){const t=text.trim(),n=nm('t',fl,'text.txt');await up(n,Buffer.byteLength(t),Buffer.from(t));texts.set(n,t);return json(res,{ok:1})}
  const it={id:crypto.randomUUID(),kind:'text',text:text.trim(),from,t:Date.now()};items.unshift(it);save();return json(res,it)}
 if(p==='/api/upload'&&req.method==='POST'){
  const name=decodeURIComponent(req.headers['x-filename']||'file');
  if(bin){await onlineUpload(req,name,fl);return json(res,{ok:1})}
  const id=crypto.randomUUID(),ws=fs.createWriteStream(path.join(U,id));req.pipe(ws);
  ws.on('finish',()=>{const it={id,kind:'file',name,size:ws.bytesWritten,mime:req.headers['content-type']||'application/octet-stream',from,t:Date.now()};items.unshift(it);save();json(res,it)});
  return}
 let m;
 if((m=p.match(/^\/api\/items\/([^/]+)$/))&&req.method==='DELETE'){
  const id=decodeURIComponent(m[1]);
  if(bin)await fb(`/${bin}/${enc(id)}`,{method:'DELETE'});
  else{items=items.filter(i=>i.id!==id);save();fs.rm(path.join(U,id),()=>{})}
  return json(res,{ok:1})}
 if((m=p.match(/^\/f\/([^/]+)$/))){
  const id=decodeURIComponent(m[1]),dl=u.searchParams.has('dl');
  const disp=n=>`${dl?'attachment':'inline'}; filename="${n.replace(/[^\x20-\x7e]|["\\]/g,'_')}"; filename*=UTF-8''${enc(n)}`;
  if(bin){
   const o=(id.match(NAME)||[0,0,0,0,id])[4],r=await fetch(await presigned(id),{headers:req.headers.range?{range:req.headers.range}:{}});
   const h={'content-type':mimeOf(o),'accept-ranges':'bytes','content-disposition':disp(o)};
   for(const k of['content-length','content-range'])if(r.headers.get(k))h[k]=r.headers.get(k);
   res.writeHead(r.status,h);return Readable.fromWeb(r.body).pipe(res)}
  const it=items.find(i=>i.id===id);if(!it)return json(res,{error:'nf'},404);
  const f=path.join(U,it.id),size=fs.statSync(f).size,h={'content-type':it.mime,'accept-ranges':'bytes','content-disposition':disp(it.name)};
  const r=(req.headers.range||'').match(/bytes=(\d*)-(\d*)/);
  if(r){const s=r[1]?+r[1]:0,e=r[2]?+r[2]:size-1;
   res.writeHead(206,{...h,'content-range':`bytes ${s}-${e}/${size}`,'content-length':e-s+1});return fs.createReadStream(f,{start:s,end:e}).pipe(res)}
  res.writeHead(200,{...h,'content-length':size});return fs.createReadStream(f).pipe(res)}
 json(res,{error:'nf'},404);
 }catch(e){if(!res.headersSent)json(res,{error:String(e)},502);else res.end()}
}).listen(PORT,'0.0.0.0',()=>{
 console.log(`\nDropBridge running\n  On this PC:  http://localhost:${PORT}`);ips().forEach(i=>console.log(`  ${i.name}: http://${i.ip}:${PORT}`));
 if(process.env.OPEN!=='0')exec((process.platform==='win32'?'start ""':process.platform==='darwin'?'open':'xdg-open')+` http://localhost:${PORT}`);
});
