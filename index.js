const EventEmitter = require('events');
const WebSocket = require('ws');
const OPCODES = require('./constants/OPCODES.js');

class Worker extends EventEmitter {
  constructor(host, secret) {
    super();

    this.host = host;
    this.secret = secret;
    this.attempts = 0;
    this.range = null;

    this.connected = false;
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
    this.ws.on('message', msg => {
      msg = JSON.parse(msg);
      this.onMessage(msg);
    });
  }

  onDisconnect(code, message) {
    this.emit('error', message);
    this.connected = false;
    this.attempts++;
    this.connect();
  }

  onMessage(msg) {
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
        console.log(`Starting cluster ${msg.range.join(', ')}`)
      }
    }
  }
}

module.exports = Worker;
