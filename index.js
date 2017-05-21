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
    this.count = null;

    this.connected = false;
    this.shutdown = false;
  }

  /**
   * Connects to the cluster manager
   */
  connect() {
    this.ws = new WebSocket(this.host);
    this.ws.on('open', this.onConnect.bind(this));
    this.ws.on('close', this.onDisconnect.bind(this));
    this.ws.on('error', this.onError.bind(this));
  }

  /**
   * Sends data to the websocket
   * @param  {Object?} obj The data to send
   */
  sendWS(obj) {
    this.ws.send(JSON.stringify(obj));
  }

  /**
   * Called when an error happens
   * @param  {Error} error The error
   */
  onError(error) {
    this.emit('error', error);
  }

  /**
   * Called when the websocket connects
   */
  onConnect() {
    this.attempts = 1;
    this.connected = true;
    this.emit('connect');
    this.ws.on('message', msg => {
      msg = JSON.parse(msg);
      this.onMessage(msg);
    });
  }

  /**
   * Called when the websocket disconnects
   * @param  {Number} code    The disconnect code
   * @param  {String} message The message sent with the disconnect
   */
  onDisconnect(code, message) {
    if(this.shutdown) return;
    this.emit('error', message);
    this.connected = false;
    this.attempts++;
    this.connect();
  }

  /**
   * Pings the cluster manager
   * @param  {String} [id=uuid()] An ID to reqresent the request
   */
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

  /**
   * Makes a request
   * @param  {String} to   Where to send the request to
   * @param  {Object} data The data to send
   * @param  {String} id   The ID for the request
   */
  request(to, data, id = uuid()) {
    this.sendWS({
      op: OPCODES.request,
      to,
      data,
      id
    });

    return id;
  }

  awaitRequest(to, data, id = uuid()) {
    return new Promise((resolve, reject) => {
      this.request(to, data, id);
      this.once(`resolve_${id}`, resolve);
    })
  }

  /**
   * Resolves a request
   * @param  {String} id   The ID of the request
   * @param  {Object} data The resolved data
   */
  resolve(id, data) {
    this.sendWS({
      op: OPCODES.resolve,
      id,
      data
    });
  }

  /**
   * Called when the websocket recieves a message
   * @param  {Object} msg The message
   */
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
        this.range = msg.range;
        this.count = msg.count;
        this.emit('range', msg.range, msg.count);
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
        return;
      }
      case OPCODES.resolve: {
        this.emit(`resolve_${msg.id}`, msg);
        return;
      }
      case OPCODES.request: {
        this.emit('request', msg.id, msg.data);
      }
    }
  }
}

module.exports = Worker;
