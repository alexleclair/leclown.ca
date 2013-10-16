// Generated by CoffeeScript 1.6.3
(function() {
  var App, escapeshellarg,
    _this = this;

  escapeshellarg = function(arg) {
    var ret;
    ret = '';
    ret = arg.replace(/[^\\]'/g, function(m, i, s) {
      return m.slice(0, 1) + '\\\'';
    });
    return "'" + ret + "'";
  };

  App = {
    io: null,
    redis: require('redis'),
    redisWorker: null,
    fs: null,
    httpServer: null,
    express: null,
    config: {
      port: 8080,
      redisHost: 'localhost',
      redisPort: 6379,
      wwwPath: './../',
      twilio: {
        responses: {
          intro: './intro.xml',
          outro: './outro.xml'
        }
      },
      updateStatsTimer: 5000,
      allowedFormats: ['wav', 'mp3', 'ogg']
    },
    events: [],
    init: function(config) {
      var express,
        _this = this;
      if (config != null) {
        this.config = this._mergeOptions(this.config(config));
      }
      if (process.argv.length > 2) {
        this.config.port = process.argv[2];
      }
      this.fs = require('fs');
      express = require('express');
      this.express = express.call(this);
      this.httpServer = require('http').createServer(this.express);
      this.httpServer.listen(this.config.port);
      this.io = require('socket.io').listen(this.httpServer);
      this.io.set('log level', 1);
      this.express.get('/api/*', this._handleAPICalls);
      this.express.post('/api/*', this._handleAPICalls);
      this.express.get('/*', this._handleHttpRequest);
      this.express.use(express.bodyParser());
      this.express.use(function(err, req, res, next) {
        console.error(err.stack);
        return res.send(500, 'Oops ! Something went super wrong.');
      });
      this.redisWorker = this.redis.createClient(App.config.redisPort, App.config.redisHost);
      this.redisWorker.zrange('clowntriste:events', 0, -1, function(err, reply) {
        var events, i, _event, _i, _ref, _results;
        if ((reply != null) && (reply.length != null)) {
          events = reply;
          _results = [];
          for (i = _i = 0, _ref = events.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
            _event = _this._parseEvent(JSON.parse(events[i]));
            if (_event) {
              _results.push(_this.events.push(_event));
            } else {
              _results.push(void 0);
            }
          }
          return _results;
        }
      });
      return this.io.on('connection', function(socket) {
        return socket.emit('events', App.events);
      });
    },
    _parseEvent: function(event) {
      var e, _event;
      try {
        _event = {
          From: '',
          Type: '',
          Data: '',
          id: ''
        };
        if (event.Body) {
          _event.Type = 'sms';
          _event.Data = event.Body;
          _event.id = event.MessageSid;
        } else if (event.Media) {
          _event.Type = 'mms';
          _event.Data = event.Media;
          _event.id = event.MessageSid;
        } else {
          _event.Type = 'voice';
          _event.Data = event.RecordingUrl;
          _event.id = event.CallSid;
        }
        _event.From = event.From;
        if ((_event.From != null) && (_event.From.length != null) && typeof _event.From === 'object') {
          _event.From = _event.From[0];
        }
        if ((_event.id != null) && (_event.id.length != null) && typeof _event.id === 'object') {
          _event.id = _event.id[0];
        }
        _event.From = '' + _event.From;
        _event.From = _event.From.split('+').join('');
        if (_event.From.length > 10) {
          _event.From = _event.From.substr(_event.From.length - 10);
        }
        _event.From = _event.From.substr(0, _event.From.length - 2) + "XX";
        _event.From = _event.From.substr(0, 3) + '-' + _event.From.substr(3, 3) + '-' + _event.From.substr(6);
        console.log(_event);
        return _event;
      } catch (_error) {
        e = _error;
        console.log(e.message, event);
        return false;
      }
    },
    _handleAPICalls: function(req, res) {
      var cmd, format, i, isAllowedFormat, method, module, parts, spawn, _i, _ref,
        _this = this;
      parts = req.url.split('?')[0].split('/');
      if (parts.length < 4) {
        res.writeHead('500');
        res.end('API calls expect at least a module/parameter combo.');
        return;
      }
      module = parts[2];
      method = parts[3];
      switch (module) {
        case "twilio":
          App._handleTwilioCall(method, req, res);
          return false;
        case "voice":
          res.setHeader('Content-Type', 'audio/x-wav');
          res.writeHead('200');
          spawn = require('child_process').spawn;
          format = 'wav';
          if (req.query.format != null) {
            format = req.query.format;
          }
          isAllowedFormat = false;
          for (i = _i = 0, _ref = App.config.allowedFormats.length; 0 <= _ref ? _i < _ref : _i > _ref; i = 0 <= _ref ? ++_i : --_i) {
            if (App.config.allowedFormats[i] === format) {
              isAllowedFormat = true;
              break;
            }
          }
          if (!isAllowedFormat) {
            format = 'wav';
          }
          cmd = spawn(__dirname + '/speak.sh', [escapeshellarg(req.query.text), format]);
          cmd.stdout.on('data', function(data) {
            return res.write(data);
          });
          return cmd.on('close', function() {
            return res.end();
          });
        default:
          res.writeHead('404');
          return res.end('Module ' + module + ' not found');
      }
    },
    _sendEvent: function(event) {
      return App.io.sockets.emit('event', event);
    },
    _handleTwilioCall: function(method, req, res) {
      var event, file,
        _this = this;
      switch (method) {
        case 'text':
          event = {
            SmsMessageSid: req.query.SmsMessageSid,
            AccountSid: req.query.AccountSid,
            MessageSid: req.query.MessageSid,
            To: req.query.To,
            Media: req.query.MediaUrl0,
            From: req.query.From,
            Body: req.query.Body
          };
          return this._saveEvent(event, function(data) {
            var _event;
            if (data) {
              _event = _this._parseEvent(event);
              _this.events.push(_event);
              _this._sendEvent(_event);
            }
            return res.end();
          });
        case 'call':
          console.log('call');
          file = App.config.twilio.responses.intro;
          if (req.query.RecordingUrl != null) {
            event = {
              AccountSid: req.query.AccountSid,
              CallSid: req.query.CallSid,
              To: req.query.To,
              RecordingUrl: req.query.RecordingUrl,
              From: req.query.From,
              RecordingDuration: req.query.RecordingDuration
            };
            this._saveEvent(event, function(data) {
              var _event;
              if (data) {
                _event = _this._parseEvent(event);
                _this.events.push(_event);
                _this._sendEvent(_event);
              }
              return res.end();
            });
            file = App.config.twilio.responses.outro;
          }
          return App.fs.readFile(file, function(err, data) {
            if (err) {
              res.writeHead('500');
              return res.end('Error loading xml file');
            }
            res.setHeader('Content-Type', 'text/xml');
            res.writeHead('200');
            return res.end(data);
          });
        default:
          res.writeHead('404');
          return res.end('Method not found');
      }
    },
    _saveEvent: function(data, callback) {
      return App.redisWorker.zadd(['clowntriste:events', new Date().getTime(), JSON.stringify(data)], function(err, reply) {
        return callback(reply);
      });
    },
    _handleHttpRequest: function(req, res) {
      var file, path;
      file = req.url.split('?')[0];
      file = file === '/' ? 'index.html' : file;
      file = file.split('..').join('');
      path = __dirname + '/' + App.config.wwwPath + file;
      return App.fs.readFile(path, function(err, data) {
        if (err) {
          res.writeHead('500');
          return res.end('Error loading ' + file);
        }
        res.writeHead('200');
        return res.end(data);
      });
    }
  };

  App.init();

}).call(this);
