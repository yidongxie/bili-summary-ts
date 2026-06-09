const http = require("http");
function r(m, p, b) {
  return new Promise((res, rej) => {
    const d = b ? Buffer.from(JSON.stringify(b), "utf8") : null;
    const req = http.request({host:"127.0.0.1",port:8080,path:p,method:m,headers:d?{"Content-Type":"application/json","Content-Length":d.length}:{}}, (resp) => {
      let c = []; resp.on("data", x => c.push(x)); resp.on("end", () => res({s:resp.statusCode,b:Buffer.concat(c).toString("utf8")}));
    }); req.on("error", rej); if (d) req.write(d); req.end();
  });
}
(async () => {
  const r1 = await r("POST", "/api/summarize", {url:"https://www.bilibili.com/video/BV1FV7C6KESW/", mode:"brief", use_whisper:true});
  const j1 = JSON.parse(r1.b);
  console.log("subtitle_count:", j1.subtitle_count);
  console.log("transcript_source:", j1.transcript_source);
  console.log("error:", j1.error ? j1.error.slice(0,300) : "(none)");
})().catch(e => console.error(e.message));
