escapeshellarg = (arg)-> 
  # // http://kevin.vanzonneveld.net
  # // +   original by: Felix Geisendoerfer (http://www.debuggable.com/felix)
  # // +   improved by: Brett Zamir (http://brett-zamir.me)
  # // *     example 1: escapeshellarg("kevin's birthday");
  # // *     returns 1: "'kevin\'s birthday'"
  ret = '';

  ret = arg.replace(/[^\\]'/g, (m, i, s)->
    return m.slice(0, 1) + '\\\'';
  );

  return "'" + ret + "'";


App = 
		io: null
		redis:require('redis')
		redisWorker: null
		fs:null
		httpServer:null
		express:null
		config:
			port:8080
			redisHost:'localhost'
			redisPort:6379
			wwwPath:'./../'
			twilio:
				responses:
					intro:'./intro.xml'
					outro:'./outro.xml'
			updateStatsTimer:5000
			allowedFormats:['wav', 'mp3', 'ogg']
		events:[]

		init: (config)->

				# Load libs only on init
				if config?
						@config = @_mergeOptions @config config

				if process.argv.length > 2
					@config.port = process.argv[2];

				@fs = require('fs');
				express = require('express')
				@express = express.call(this);
				@httpServer = require('http').createServer(@express);
				@httpServer.listen(@config.port)
				@io = require('socket.io').listen(@httpServer);
				@io.set('log level', 1);

				@express.get '/api/*', @_handleAPICalls
				@express.post '/api/*', @_handleAPICalls
				@express.get '/*', @_handleHttpRequest

				@express.use express.bodyParser()
				@express.use (err, req, res, next)->
				  console.error(err.stack);
				  res.send(500, 'Oops ! Something went super wrong.');

				@redisWorker = @redis.createClient(App.config.redisPort, App.config.redisHost)
				
				@redisWorker.zrange 'clowntriste:events', 0, -1, (err,reply)=>
					if reply? && reply.length?
						events = reply;
						for i in [0...events.length]
							_event = @_parseEvent(JSON.parse(events[i]));
							if _event
								@events.push _event;


				@io.on 'connection', (socket)->
					socket.emit 'events', App.events;
		_parseEvent: (event)=>
			try
				_event = 
					From:''
					Type:''
					Data:''
					id:''
				if event.Body
					_event.Type= 'sms'
					_event.Data= event.Body
					_event.id= event.MessageSid
				else if event.Media
					_event.Type= 'mms'
					_event.Data= event.Media
					_event.id= event.MessageSid
				else
					_event.Type= 'voice'
					_event.Data= event.RecordingUrl
					_event.id = event.CallSid

				_event.From = event.From;
				
				if _event.From? && _event.From.length? && typeof _event.From == 'object'
					_event.From = _event.From[0];


				if _event.id? && _event.id.length? && typeof _event.id == 'object'
					_event.id = _event.id[0];
				
				_event.From = ''+_event.From;
				_event.From = _event.From.split('+').join('');
				if _event.From.length > 10
					_event.From = _event.From.substr(_event.From.length-10);
				_event.From = _event.From.substr(0, _event.From.length-2)+"XX";
				_event.From = _event.From.substr(0,3)+'-'+_event.From.substr(3,3)+'-'+_event.From.substr(6);
				console.log _event;
				return _event;
			catch e
				console.log e.message, event
				return false;

		_handleAPICalls: (req, res) ->
			parts = req.url.split('?')[0].split('/'); #Very primitive module/method parsing at the moment. This is a small project, this works for now.
			if parts.length < 4
				res.writeHead '500'
				res.end 'API calls expect at least a module/parameter combo.'
				return;
			module = parts[2];
			method = parts[3];
			
			switch module
				when "twilio" 
					App._handleTwilioCall method, req, res;
					return false;
				when "voice"
					res.setHeader 'Content-Type', 'audio/x-wav'
					res.writeHead '200';

					spawn = require('child_process').spawn
					format = 'wav';
					if req.query.format?
						format = req.query.format;
					isAllowedFormat = false;
					for i in [0...App.config.allowedFormats.length]
						if App.config.allowedFormats[i] == format
							isAllowedFormat = true;
							break;
					if !isAllowedFormat
						format = 'wav'
					cmd = spawn(__dirname + '/speak.sh', [escapeshellarg(req.query.text), format]);
					#cmd = spawn('ssh', ['newyork.zloche.net', './clown/server/speak.sh', escapeshellarg(req.query.text)]);

					cmd.stdout.on 'data', (data)=>
						res.write data;
					cmd.on 'close', ()=>
						res.end();
				else
					res.writeHead '404'
					res.end 'Module ' + module + ' not found'

		_sendEvent:(event) =>
			App.io.sockets.emit 'event', event;

		_handleTwilioCall: (method, req,  res) ->
			#This handles everything coming from Twilio. Right now, we only support calling - we could eventually support texting if we needed/wanted to.
			switch method
				when 'text'

					event=
						SmsMessageSid:req.query.SmsMessageSid
						AccountSid:req.query.AccountSid,
						MessageSid:req.query.MessageSid,
						To: req.query.To,
						Media: req.query.MediaUrl0
						From: req.query.From,
						Body: req.query.Body,
					@_saveEvent event, (data)=>
						if data
							_event = @_parseEvent event;
							@events.push(_event);
							@_sendEvent _event
						res.end();
					
				when 'call'
					console.log 'call'
					file = App.config.twilio.responses.intro
					if req.query.RecordingUrl?
						event = 
							AccountSid: req.query.AccountSid
							CallSid: req.query.CallSid
							To: req.query.To,
							RecordingUrl: req.query.RecordingUrl
							From: req.query.From,
							RecordingDuration:req.query.RecordingDuration
						@_saveEvent event, (data)=>
							if data
								_event = @_parseEvent event;
								@.events.push(_event);
								@_sendEvent _event
							res.end();

						file = App.config.twilio.responses.outro

					App.fs.readFile file, (err, data)->
						if(err)
							res.writeHead '500'
							return res.end('Error loading xml file')
						res.setHeader 'Content-Type', 'text/xml'
						res.writeHead '200'
						res.end data;
				else
					res.writeHead '404'
					res.end 'Method not found'


		_saveEvent: (data, callback)=>
			App.redisWorker.zadd ['clowntriste:events', new Date().getTime(), JSON.stringify data], (err, reply)=>
				callback(reply);

		_handleHttpRequest: (req, res) ->

				file = req.url.split('?')[0];
				file = if file == '/' then 'index.html' else file;
				file = file.split('..').join(''); #Quick & Dirty, no ../ allowed.

				path = __dirname + '/' + App.config.wwwPath + file;

				App.fs.readFile path, (err, data)->
						if(err)
								res.writeHead '500'
								return res.end('Error loading '+file)
						res.writeHead '200'
						res.end data;



App.init();