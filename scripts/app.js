/*global define */
define([], function () {
    

    return '\'Allo \'Allo!';
});

App = {

	config:{
		endpoint:'http://www.leclown.ca:8084/'
	},

	talkTimer:null,

	clownImg:$('img.clown-img'),
	$events:$('.events .event-container'),
	$controls:$('.events a.prev, .events a.next'),
	socket:null,


	init:function(){
		App.clownImg.removeClass('hide');
		App.clownImg.last().hide();
		App.socket = io.connect(App.config.endpoint);

		App.socket.on('event', function(event){
			App.addEvent(event);
		})

		App.socket.on('events', function(events){
			for(var i=0; i<events.length; ++i){
				App.addEvent(events[i], false);
			}
			App.goToEvent(App.$events.find('>.event').first().attr('data-id'));
		})

		App.$controls.on('click', function(e){
			e.preventDefault();
			if($(this).is('.next')){
				var $current = App.$events.find('.event.current');
				App.goToEvent($current.prev().attr('data-id'));
			}
			else{
				var $current = App.$events.find('.event.current');
				App.goToEvent($current.next().attr('data-id'));
			}
			return false;
		})
	},
	addEvent:function(event, playIfPossible){
		console.log('ADDED EVENT', event);
		playIfPossible = playIfPossible? playIfPossible : true;

		var $skeleton = $('#skeletons .event.type-'+event.Type).html();
		for(var key in event){
			$skeleton = $skeleton.split('{{'+key+'}}').join($('<div />').text(event[key]).html());
		}
		console.log($skeleton);
		$skeleton = $($skeleton);
		$skeleton.attr('data-id', event.id);
		if(App.$events.find('.event').length > 0)
			$skeleton.hide();
		App.$events.prepend($skeleton)
		App.redrawControls();

		if(playIfPossible && !App.clownIsTalking()){
			App.goToEvent(event.id);
		}
	},

	goToEvent:function(id){
		var $event = App.$events.find('>.event[data-id='+id+']');
		if($event.length == 0){
			return;
		}
		App.$events.find('>.event').not($event).removeClass('current').fadeOut('fast', function(){
			$event.fadeIn('fast');
		});
		$event.addClass('current');
		App.playEvent($event);
		App.redrawControls();
		ga('send', 'pageview', '/media/'+$event.attr('data-id'));


	},
	redrawControls:function(){
		if(App.$events.find('.event.current').index() == 0){
			App.$controls.filter('.next').css('opacity',0);
		}
		else{
			App.$controls.filter('.next').css('opacity',1);
		}

		if(App.$events.find('.event.current').index() == App.$events.find('.event').length -1){
			App.$controls.filter('.prev').css('opacity',0);
		}
		else{
			App.$controls.filter('.prev').css('opacity',1);
		}

	},

	playEvent:function($event){
		if($event.is('.type-sms')){
			var url = App.config.endpoint+'api/voice/say?text='+encodeURIComponent($event.find('p').text());
			App.playSound([url+'&format=wav',url+'&format=ogg'])
		}
		else if($event.is('.type-voice')){
			var url = $event.attr('data-media-url');
			App.playSound([url, url+'.mp3']);
		}
	},

	playSound:function(urls){
		App.stopSounds();
		App.startTalking();
		var $player = $('<audio />').attr('autoplay', 'autoplay');
		for(var i=0; i<urls.length; ++i){
			$player.append('<source />').attr('src', urls[i]);
		}
		$player.on('ended', function(){
			App.stopSounds();
		})
		$player.appendTo($('#audio-player'));
	},

	stopSounds:function(){
		$('#audio-player').children().remove();
		App.stopTalking();
	},

	clownIsTalking:function(){
		return App.talkTimer == null ? false : true;
	},

	startTalking:function(){
		clearInterval(App.talkTimer);
		var timerFunction = function(){
			if($(App.clownImg.get(0)).is(':visible')){
				$(App.clownImg.get(0)).hide();
				$(App.clownImg.get(1)).show();
			}
			else{
				$(App.clownImg.get(1)).hide();
				$(App.clownImg.get(0)).show();
			}
		}
		App.talkTimer = setInterval(timerFunction, 200);

	},

	stopTalking:function(){
		clearInterval(App.talkTimer);
		App.talkTimer = null;
		App.clownImg.show();
		App.clownImg.last().hide();
	}
}


App.init();