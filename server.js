const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto'),os=require('os');
const{spawn,spawnSync,exec}=require('child_process');
const PORT=+process.env.PORT||3000;
const D=process.env.DATA_DIR||path.join(__dirname,'data'),U=path.join(D,'uploads'),DB=path.join(D,'items.json'),TK=path.join(D,'token.txt');
fs.mkdirSync(U,{recursive:true});
let items=fs.existsSync(DB)?JSON.parse(fs.readFileSync(DB)):[];
const save=()=>fs.writeFileSync(DB,JSON.stringify(items));
const TOKEN=fs.existsSync(TK)?fs.readFileSync(TK,'utf8').trim():(()=>{const t=crypto.randomBytes(12).toString('hex');fs.writeFileSync(TK,t);return t})();
const json=(s,o,c=200)=>{s.writeHead(c,{'content-type':'application/json'});s.end(JSON.stringify(o))};
const body=r=>new Promise(ok=>{let b='';r.on('data',c=>b+=c);r.on('end',()=>ok(b))});
// "local" = really the PC itself, not a tunnel that forwards from 127.0.0.1
const isLocal=r=>/^(::1|127\.|::ffff:127\.)/.test(r.socket.remoteAddress)&&!r.headers['x-forwarded-for']&&!r.headers['cf-connecting-ip']&&/^(localhost|127\.0\.0\.1)/.test(r.headers.host||'');
const authed=r=>isLocal(r)||(r.headers.cookie||'').includes('t='+TOKEN);
const ips=()=>Object.entries(os.networkInterfaces()).flatMap(([name,a])=>a.filter(i=>(i.family===4||i.family==='IPv4')&&!i.internal&&!i.address.startsWith('169.254')).map(i=>({name,ip:i.address})))
 .sort((a,b)=>(b.ip.startsWith('192.168')-a.ip.startsWith('192.168')));
// Online mode: temporary public tunnel (cloudflared if installed, else ssh -> localhost.run)
let tun={state:'off',url:'',msg:''},proc=null;
function startTunnel(){
 if(proc)return;tun={state:'starting',url:'',msg:''};
 const has=spawnSync(process.platform==='win32'?'where':'which',['cloudflared']).status===0;
 proc=has?spawn('cloudflared',['tunnel','--url','http://localhost:'+PORT,'--no-autoupdate'])
  :spawn('ssh',['-o','StrictHostKeyChecking=no','-o','ServerAliveInterval=30','-R','80:localhost:'+PORT,'nokey@localhost.run']);
 const me=proc,on=d=>{const m=String(d).match(/https:\/\/(?!admin)[\w-]+\.(trycloudflare\.com|lhr\.life|localhost\.run)/);if(m&&tun.state!=='on')tun={state:'on',url:m[0],msg:''}};
 me.stdout.on('data',on);me.stderr.on('data',on);
 me.on('error',()=>{tun={state:'error',url:'',msg:'Needs internet plus cloudflared or OpenSSH installed.'};proc=null});
 me.on('exit',()=>{if(tun.state!=='error')tun={state:'off',url:'',msg:''};if(proc===me)proc=null});
 setTimeout(()=>{if(proc===me&&tun.state==='starting'){me.kill();tun={state:'error',url:'',msg:'Could not go online. Check your internet connection.'}}},30000);
}
const stopTunnel=()=>{if(proc)proc.kill();tun={state:'off',url:'',msg:''}};
process.on('exit',()=>proc&&proc.kill());process.on('SIGINT',()=>process.exit());
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
 if(p==='/api/info')return json(res,local?{local,token:TOKEN,port:PORT,ips:ips(),tun}:{local});
 if(p==='/api/tunnel'&&req.method==='POST'){
  if(!local)return json(res,{error:'local only'},403);
  JSON.parse(await body(req)).on?startTunnel():stopTunnel();return json(res,tun)}
 if(p==='/api/items'&&req.method==='GET')return json(res,items);
 if(p==='/api/items'&&req.method==='DELETE'){for(const i of items)fs.rm(path.join(U,i.id),()=>{});items=[];save();return json(res,{ok:1})}
 const from=/Android|iPhone|iPad|Mobile/i.test(req.headers['user-agent']||'')?'Phone':'PC';
 if(p==='/api/text'&&req.method==='POST'){
  const{text}=JSON.parse(await body(req));if(!text||!text.trim())return json(res,{error:'empty'},400);
  const it={id:crypto.randomUUID(),kind:'text',text:text.trim(),from,t:Date.now()};items.unshift(it);save();return json(res,it)}
 if(p==='/api/upload'&&req.method==='POST'){
  const id=crypto.randomUUID(),name=decodeURIComponent(req.headers['x-filename']||'file');
  const ws=fs.createWriteStream(path.join(U,id));req.pipe(ws);
  ws.on('finish',()=>{const it={id,kind:'file',name,size:ws.bytesWritten,mime:req.headers['content-type']||'application/octet-stream',from,t:Date.now()};items.unshift(it);save();json(res,it)});
  return}
 let m;
 if((m=p.match(/^\/api\/items\/([\w-]+)$/))&&req.method==='DELETE'){
  items=items.filter(i=>i.id!==m[1]);save();fs.rm(path.join(U,m[1]),()=>{});return json(res,{ok:1})}
 if((m=p.match(/^\/f\/([\w-]+)$/))){
  const it=items.find(i=>i.id===m[1]);if(!it)return json(res,{error:'nf'},404);
  const f=path.join(U,it.id),size=fs.statSync(f).size,h={'content-type':it.mime,'accept-ranges':'bytes',
   'content-disposition':`${u.searchParams.has('dl')?'attachment':'inline'}; filename="${it.name.replace(/[^\x20-\x7e]|["\\]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(it.name)}`};
  const r=(req.headers.range||'').match(/bytes=(\d*)-(\d*)/);
  if(r){const s=r[1]?+r[1]:0,e=r[2]?+r[2]:size-1;
   res.writeHead(206,{...h,'content-range':`bytes ${s}-${e}/${size}`,'content-length':e-s+1});return fs.createReadStream(f,{start:s,end:e}).pipe(res)}
  res.writeHead(200,{...h,'content-length':size});return fs.createReadStream(f).pipe(res)}
 json(res,{error:'nf'},404);
 }catch(e){json(res,{error:String(e)},500)}
}).listen(PORT,'0.0.0.0',()=>{
 console.log(`\nDropBridge running\n  On this PC:  http://localhost:${PORT}`);ips().forEach(i=>console.log(`  ${i.name}: http://${i.ip}:${PORT}`));
 if(process.env.OPEN!=='0')exec((process.platform==='win32'?'start ""':process.platform==='darwin'?'open':'xdg-open')+` http://localhost:${PORT}`);
});
