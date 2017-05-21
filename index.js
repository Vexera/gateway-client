const EventEmitter = require('events');
const WebSocket = require('ws');
const OPCODES = require('./constants/OPCODES.js');
const uuid = require('./util/uuid.js');

class Worker extends EventEmitter {
  constructor(host, secret) {
    super();

    this.host = host;
    this.secret = secret;
    this.attempts = 0;
    this.range = null;

    this.connected = false;
    this.shutdown = false;
  }

  connect() {
    this.ws = new WebSocket(this.host);
    this.ws.on('open', this.onConnect.bind(this));
    this.ws.on('close', this.onDisconnect.bind(this));
    this.ws.on('error', this.onError.bind(this));
  }

  sendWS(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  onError(error) {
    this.emit('error', error);
  }

  onConnect() {
    this.attempts = 1;
    this.connected = true;
    this.emit('connect');
    this.ws.on('message', msg => {
      msg = JSON.parse(msg);
      this.onMessage(msg);
    });
  }

  onDisconnect(code, message) {
    if(this.shutdown) return;
    this.emit('error', message);
    this.connected = false;
    this.attempts++;
    this.connect();
  }

  ping(id = uuid()) {
    return new Promise((resolve, reject) => {
      const startTime = new Date().getTime();
      this.sendWS({
        op: OPCODES.ping,
        id
      });
      this.once(`pong_${id}`, msg => {
        resolve(new Date().getTime() - startTime);
      })
    });
  }

  onMessage(msg) {
    this.emit('message', msg);
    switch (msg.op) {
      case OPCODES.identify: {
        this.sendWS({
          op: OPCODES.identify,
          secret: this.secret,
          range: this.range ? this.range : 'new'
        });
        return;
      }
      case OPCODES.ready: {
        this.emit('range', msg.range);
        return;
      }
      case OPCODES.shutdown: {
        this.emit('shutdown');
        this.shutdown = true;
        this.ws.close();
        return;
      }
      case OPCODES.ping: {
        this.sendWS({
          op: OPCODES.pong,
          id: msg.id
        });
        return;
      }
      case OPCODES.pong: {
        this.emit(`pong_${msg.id}`, msg);
      }
    }
  }
}

module.exports = Worker;
