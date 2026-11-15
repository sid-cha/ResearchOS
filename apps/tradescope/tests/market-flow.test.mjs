/** Exercise native Node WebSocket -> normalizer -> HTTP SSE, using a local
 * RFC6455 provider fixture. No external market connection or credentials.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import http from 'node:http';
import {createMarketStream} from '../lib/alpaca-stream.mjs';
import {createServer} from '../server.mjs';

function textFrame(value) {
  const payload=Buffer.from(JSON.stringify(value));
  const header=payload.length<126?Buffer.from([0x81,payload.length]):Buffer.from([0x81,126,payload.length>>8,payload.length&255]);
  return Buffer.concat([header,payload]);
}

test('native WebSocket authenticates/resubscribes and sends normalized observations to SSE without secrets',async t=>{
  let connectionCount=0;
  const sockets=new Set(),handshakes=[];
  const provider=http.createServer();
  provider.on('upgrade',(req,socket)=>{
    connectionCount++;sockets.add(socket);socket.on('close',()=>sockets.delete(socket));
    const accept=createHash('sha1').update(req.headers['sec-websocket-key']+'258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    socket.write(textFrame([{T:'success',msg:'connected'}]));
    let buffer=Buffer.alloc(0);
    socket.on('data',chunk=>{
      buffer=Buffer.concat([buffer,chunk]);
      while(buffer.length>=2){
        const opcode=buffer[0]&15,masked=Boolean(buffer[1]&128);let length=buffer[1]&127,offset=2;
        if(length===126){if(buffer.length<4)return;length=buffer.readUInt16BE(2);offset=4;}
        if(length===127){socket.destroy();return;}
        const total=offset+(masked?4:0)+length;if(buffer.length<total)return;
        const mask=masked?buffer.subarray(offset,offset+4):null;offset+=masked?4:0;
        const payload=Buffer.from(buffer.subarray(offset,total));buffer=buffer.subarray(total);
        if(mask)for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4];
        if(opcode===8){socket.end(Buffer.from([0x88,0]));return;}
        if(opcode!==1)continue;
        const message=JSON.parse(payload.toString());handshakes.push(message);
        if(message.action==='auth')socket.write(textFrame([{T:'success',msg:'authenticated'}]));
        if(message.action==='subscribe'){
          const observation={T:'t',S:'AAPL',i:321,x:'V',p:255.5,s:10,t:'2026-11-12T15:00:00.123456789Z'};
          socket.write(textFrame([{T:'subscription',trades:message.trades,quotes:message.quotes,bars:message.bars},observation,observation]));
        }
      }
    });
  });
  await new Promise(r=>provider.listen(0,'127.0.0.1',r));
  const endpoint=`ws://127.0.0.1:${provider.address().port}`;
  class LocalWebSocket extends WebSocket {
    constructor(url){assert.equal(url,'wss://stream.data.alpaca.markets/v2/iex');super(endpoint);}
  }
  const stream=createMarketStream({key:'mock-local-key',secret:'mock-local-secret',symbols:['AAPL'],WebSocketImpl:LocalWebSocket,random:()=>0});
  const server=createServer({marketStream:stream,deliveryOptions:{heartbeatMs:20}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const ctrl=new AbortController();
  t.after(async()=>{
    ctrl.abort();server.closeMarketData();server.closeAllConnections();
    for(const socket of sockets)socket.destroy();
    await Promise.all([new Promise(r=>server.close(r)),new Promise(r=>provider.close(r))]);
  });
  const base=`http://127.0.0.1:${server.address().port}`;
  const response=await fetch(base+'/api/stream',{signal:ctrl.signal});
  const reader=response.body.getReader(),decoder=new TextDecoder();
  let text='';
  const limit=setTimeout(()=>ctrl.abort(),5000);
  try {
    while(!text.includes('event: observation')){
      const chunk=await reader.read();assert.equal(chunk.done,false);text+=decoder.decode(chunk.value);
    }
  }finally{clearTimeout(limit);}
  const frame=text.split('\n\n').find(frame=>frame.startsWith('event: observation'));
  const observation=JSON.parse(frame.split('\ndata: ')[1]);
  assert.equal(observation.exchangeEventTime,'2026-11-12T15:00:00.123456789Z');
  assert.equal(observation.trade.price,255.5);assert.equal(observation.provider,'alpaca');
  assert.equal(handshakes[0].action,'auth');assert.equal(handshakes[0].secret,'mock-local-secret');
  assert.equal(handshakes[1].action,'subscribe');assert.deepEqual(handshakes[1].quotes,['AAPL']);
  const health=await (await fetch(base+'/api/health')).json();
  assert.equal(health.marketData.status,'streaming');
  assert.equal(health.marketData.duplicatesDiscarded,1);
  assert.equal(connectionCount,1);
  assert(!text.includes('mock-local-key'));assert(!text.includes('mock-local-secret'));
  assert(!JSON.stringify(health).includes('mock-local-secret'));
  // A provider disconnect creates a bounded retry and a fresh auth/subscription.
  for(const socket of sockets)socket.destroy();
  let reconnectText='';const retryLimit=setTimeout(()=>ctrl.abort(),5000);
  try {
    while(connectionCount<2||stream.getHealth().status!=='streaming'){
      const chunk=await reader.read();assert.equal(chunk.done,false);reconnectText+=decoder.decode(chunk.value);
    }
  }finally{clearTimeout(retryLimit);}
  assert.equal(connectionCount,2);assert.equal(handshakes.filter(x=>x.action==='auth').length,2);
  assert.equal(stream.getHealth().observationsEmitted,1,'reconnect duplicate is suppressed');
  assert.equal(stream.getHealth().duplicatesDiscarded,3);
  assert.match(reconnectText,/reconnecting/);
});
