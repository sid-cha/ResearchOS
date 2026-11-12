/**
 * Provider-independent market observations (schema v1).
 * US_EQUITY:<symbol> is a local pilot key, not a permanent security identifier.
 * Missing optional source fields remain null. No exchange or price is inferred.
 */
const EVENT_TYPES = Object.freeze({t:'trade', q:'quote', b:'bar'});
const own = (object, key) => Object.hasOwn(object, key) && object[key] !== undefined && object[key] !== null;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const positive = value => finite(value) && value > 0;
const quantity = value => finite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;
const code = value => typeof value === 'string' && /^[A-Za-z0-9@#*?._:+/-]{1,32}$/.test(value);
const condition = value => code(value) || (Number.isSafeInteger(value) && value >= 0);

/** RFC3339 instants with up to nanosecond precision; rejects Date's rollover dates. */
export function validEventTimestamp(value){
  if(typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if(!match) return false;
  const [,ys,ms,ds,hs,mins,ss,,zone] = match;
  const [year,month,day,hour,minute,second] = [ys,ms,ds,hs,mins,ss].map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if(month < 1 || month > 12 || day < 1 || day > days[month-1] || hour > 23 || minute > 59 || second > 59) return false;
  if(zone !== 'Z' && (Number(zone.slice(1,3)) > 23 || Number(zone.slice(4,6)) > 59)) return false;
  // RFC3339 -00:00 means the local offset is unknown; it is not an identified instant.
  return zone !== '-00:00' && Number.isFinite(Date.parse(value));
}

function utcTimestamp(value){
  const fraction = /\.(\d{1,9})/.exec(value)?.[1];
  return new Date(value).toISOString().replace(/\.\d{3}Z$/, (fraction ? `.${fraction}` : '') + 'Z');
}

function sourceId(value){
  if(Number.isSafeInteger(value) && value >= 0) return String(value);
  if(typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value)) return value;
  return null;
}

/** Normalize one Alpaca message. The connector supplies actual receipt/ingestion clocks. */
export function normalizeAlpacaEvent(message,{symbols=[],receivedAt=new Date().toISOString(),ingestedAt=receivedAt}={}){
  if(!message || typeof message !== 'object' || Array.isArray(message)) return null;
  const eventType = EVENT_TYPES[message.T];
  if(!eventType || typeof message.S !== 'string' || !/^[A-Z][A-Z0-9.\-]{0,14}$/.test(message.S)) return null;
  if(!(symbols instanceof Set ? symbols.has(message.S) : Array.isArray(symbols) && symbols.includes(message.S))) return null;
  if(!validEventTimestamp(receivedAt) || !validEventTimestamp(ingestedAt)) return null;
  if(own(message,'t') && !validEventTimestamp(message.t)) return null;
  if(own(message,'i') && sourceId(message.i) === null) return null;
  if(own(message,'x') && !code(message.x)) return null;
  if(own(message,'z') && !code(message.z)) return null;
  if(eventType !== 'bar' && own(message,'c') && (!Array.isArray(message.c) || message.c.length > 32 || !message.c.every(condition))) return null;

  const missingFields = [];
  const optional = (key,name=key) => {
    if(own(message,key)) return Array.isArray(message[key])?[...message[key]]:message[key];
    missingFields.push(name);
    return null;
  };
  const event = {
    schemaVersion:1,provider:'alpaca',feed:'iex',coverage:'single-venue',mode:'LIVE',
    instrumentId:`US_EQUITY:${message.S}`,symbol:message.S,eventType,
    sourceEventId:own(message,'i')?sourceId(message.i):null,
    exchange:optional('x','exchange'),
    exchangeEventTime:own(message,'t')?utcTimestamp(message.t):null,
    receivedAt:utcTimestamp(receivedAt),ingestedAt:utcTimestamp(ingestedAt),
    trade:null,quote:null,bar:null,
    quality:{validation:'valid',missingFields,timestampStatus:own(message,'t')?'provided':'missing',gapStatus:'unknown'}
  };
  if(!own(message,'i')) missingFields.push('sourceEventId');
  if(!own(message,'t')) missingFields.push('exchangeEventTime');
  if(eventType === 'trade'){
    if(!positive(message.p) || (own(message,'s') && !quantity(message.s))) return null;
    event.trade = {price:message.p,size:optional('s','trade.size'),conditions:optional('c','trade.conditions'),tape:optional('z','trade.tape')};
  }else if(eventType === 'quote'){
    if(!positive(message.bp) || !positive(message.ap)) return null;
    if(['bs','as'].some(key=>own(message,key) && !quantity(message[key]))) return null;
    if(['bx','ax'].some(key=>own(message,key) && !code(message[key]))) return null;
    event.quote = {
      bidPrice:message.bp,askPrice:message.ap,bidSize:optional('bs','quote.bidSize'),askSize:optional('as','quote.askSize'),
      bidExchange:optional('bx','quote.bidExchange'),askExchange:optional('ax','quote.askExchange'),
      conditions:optional('c','quote.conditions'),tape:optional('z','quote.tape')
    };
    event.quality.crossedQuote = message.bp > message.ap;
  }else{
    if(['o','h','l','c'].some(key=>!positive(message[key]))) return null;
    if(message.h < message.l || message.o > message.h || message.o < message.l || message.c > message.h || message.c < message.l) return null;
    if(['v','n'].some(key=>own(message,key) && !quantity(message[key])) || (own(message,'vw') && !positive(message.vw))) return null;
    event.bar = {open:message.o,high:message.h,low:message.l,close:message.c,volume:optional('v','bar.volume'),tradeCount:optional('n','bar.tradeCount'),vwap:optional('vw','bar.vwap')};
  }
  return event;
}

/** Identity ignores local clocks and includes source values to preserve same-time changes. */
export function marketEventIdentity(event){
  // Without a source identifier or event time, two equal observations may be distinct.
  if(!event.sourceEventId && !event.exchangeEventTime) return null;
  // Pad fractional digits only for identity: .1Z and .100Z identify the same instant.
  const timestamp = event.exchangeEventTime?.replace(/(?:\.(\d{1,9}))?Z$/,(_,digits)=>`.${(digits||'').padEnd(9,'0')}Z`) ?? null;
  return JSON.stringify([event.schemaVersion,event.provider,event.feed,event.symbol,event.eventType,event.sourceEventId,event.exchange,timestamp,event.trade,event.quote,event.bar]);
}
