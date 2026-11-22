const express=require("express");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const rateLimit=require("express-rate-limit");
const mineflayer=require("mineflayer");
const dns=require("node:dns").promises;
const net=require("node:net");
const fs=require("node:fs");
const path=require("node:path");
const app=express(),PORT=Number(process.env.PORT||3000);
const dataDir=path.join(__dirname,"data"),usersFile=path.join(dataDir,"users.json");
fs.mkdirSync(dataDir,{recursive:true});
if(!fs.existsSync(usersFile))fs.writeFileSync(usersFile,"[]");
app.set("trust proxy",1);
app.use(express.json({limit:"20kb"}));
app.use(session({name:"botgdl3.sid",secret:process.env.SESSION_SECRET||"dev-secret-change-me",resave:false,saveUninitialized:false,cookie:{httpOnly:true,sameSite:"strict",secure:process.env.NODE_ENV==="production",maxAge:604800000}}));
const limiter=rateLimit({windowMs:900000,limit:12});
app.use("/api/login",limiter);app.use("/api/register",limiter);
const readUsers=()=>{try{return JSON.parse(fs.readFileSync(usersFile,"utf8"))}catch{return []}};
const saveUsers=u=>fs.writeFileSync(usersFile,JSON.stringify(u,null,2));
const auth=(req,res,next)=>req.session.user?next():res.status(401).json({error:"Önce giriş yapmalısın."});
let bot=null,state="stopped",message="Bot henüz başlatılmadı.",timer=null,stopRequested=false,connecting=false;
async function resolveServer(){
 const host=(process.env.MC_HOST||"").trim();
 if(!host||host==="your-voltra-server-address")throw Error("Render Environment bölümünde MC_HOST ayarlanmamış.");
 if(process.env.MC_PORT){const port=Number(process.env.MC_PORT);if(!Number.isInteger(port)||port<1||port>65535)throw Error("MC_PORT geçerli değil.");return{host,port};}
 if(net.isIP(host))return{host,port:25565};
 try{const records=await dns.resolveSrv("_minecraft._tcp."+host);if(records.length){records.sort((a,b)=>a.priority-b.priority||b.weight-a.weight);return{host:records[0].name.replace(/\\.$/,""),port:records[0].port}}}catch{}
 return{host,port:25565};
}
function retry(){if(stopRequested||timer)return;timer=setTimeout(()=>{timer=null;startBot().catch(()=>{})},10000)}
async function startBot(){
 if((bot||connecting)&&state!=="stopped")return;
 connecting=true;stopRequested=false;state="connecting";message="Minecraft sunucusuna bağlanılıyor...";
 try{
  const target=await resolveServer();if(stopRequested)return;
  const options={host:target.host,port:target.port,username:process.env.BOT_USERNAME||"Botgdl3",auth:(process.env.MC_AUTH||"offline").toLowerCase()==="microsoft"?"microsoft":"offline"};
  if(process.env.MC_VERSION)options.version=process.env.MC_VERSION;
  const b=mineflayer.createBot(options);bot=b;
  b.once("login",()=>{state="online";message="Minecraft sunucusuna bağlandı."});
  b.once("spawn",()=>{state="online";message="Bot oyunda; komutlar gönderiliyor.";setTimeout(()=>{if(bot!==b||stopRequested)return;b.chat("/tp 93.71 -61 45.32");setTimeout(()=>{if(bot===b&&!stopRequested)b.chat("/gamemode creative")},1800)},1200)});
  b.on("kicked",reason=>{message="Sunucudan çıkarıldı: "+String(reason).slice(0,160)});
  b.on("error",err=>{message="Bağlantı hatası: "+err.message;if(state!=="stopped")state="error"});
  b.once("end",()=>{if(bot===b)bot=null;connecting=false;if(!stopRequested){state="reconnecting";message="Bağlantı kesildi; 10 saniye sonra tekrar denenecek.";retry()}else{state="stopped";message="Bot durduruldu."}});
 }catch(e){connecting=false;state="error";message=e.message;retry();throw e}finally{connecting=false}
}
function stopBot(){stopRequested=true;if(timer){clearTimeout(timer);timer=null}const b=bot;bot=null;if(b)try{b.quit("Dashboard stop")}catch{}state="stopped";message="Bot durduruldu."}
app.get("/health",(req,res)=>{const o=process.env.UPTIME_ORIGIN;if(o&&req.headers.origin===o){res.setHeader("Access-Control-Allow-Origin",o);res.setHeader("Vary","Origin")}else if(!o)res.setHeader("Access-Control-Allow-Origin","*");res.json({ok:true,service:"Botgdl3",bot:state,timestamp:new Date().toISOString()})});
app.post("/api/register",async(req,res)=>{const username=String(req.body.username||"").trim(),password=String(req.body.password||"");if(!/^[a-zA-Z0-9_]{3,20}$/.test(username))return res.status(400).json({error:"Kullanıcı adı 3-20 karakter olmalı."});if(password.length<8||password.length>72)return res.status(400).json({error:"Şifre 8-72 karakter arasında olmalı."});const users=readUsers();if(users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({error:"Bu kullanıcı adı zaten kayıtlı."});users.push({username,passwordHash:await bcrypt.hash(password,12)});saveUsers(users);req.session.user={username};startBot().catch(()=>{});res.json({ok:true,username})});
app.post("/api/login",async(req,res)=>{const username=String(req.body.username||"").trim(),password=String(req.body.password||""),u=readUsers().find(x=>x.username.toLowerCase()===username.toLowerCase());if(!u||!(await bcrypt.compare(password,u.passwordHash)))return res.status(401).json({error:"Kullanıcı adı veya şifre hatalı."});req.session.user={username:u.username};startBot().catch(()=>{});res.json({ok:true,username:u.username})});
app.post("/api/logout",auth,(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",auth,(req,res)=>res.json({username:req.session.user.username}));
app.get("/api/status",auth,(req,res)=>res.json({state,message,botUsername:process.env.BOT_USERNAME||"Botgdl3"}));
app.post("/api/bot/start",auth,async(req,res)=>{try{await startBot();res.json({ok:true,state,message})}catch(e){res.status(503).json({error:e.message,state})}});
app.post("/api/bot/stop",auth,(req,res)=>{stopBot();res.json({ok:true,state})});
app.use(express.static(path.join(__dirname,"public")));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log("Botgdl3 listening on "+PORT));
