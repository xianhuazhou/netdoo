// NetDoo Player V1.0 dev

var Player = (function(){

	var Logger = {
		info: function(message) {
			$('debug').update(message);
		}
	};

	var Util = {
		songs: [],
		images: {
			play:   'images/play.png',
			stop:   'images/stop.png',
			pause:  'images/pause.png',
			resume: 'images/resume.png',
			volume: 'images/volume.png'
		},

		updateSongsList: function(songs, searchEngine) {
			this.songs = songs;
			var songNode = $('songs').update('');
			songs.each(function(song, index){
				 songNode.insert(
					 "<ul>" +
					 "<li>" + song.name + "</li>" +
					 "<li>" + song.singer + "</li>" +
					 "<li>" + song.album + "</li>" +
					 "<li><a href=\"#\" songIndex=\"" + index + "\"><img src=\"" + Player.Util.images.resume + "\"></a></li>" +
					 "</ul>"
				 );
			});
			songNode.select('a').each(function(a) {
				a.onclick = function(){return false};
				a.observe('click', function(){
					searchEngine.parseAndPlay(this.readAttribute('songIndex'));
				});
			});
		},

		addFile: function(file) {
			var song = {
				name: file.nativePath.split('/').last().split('.')[0],
				singer: '',
				musicUrl: file.url
			};
			this.addToPlayLists(song);
			return song;
		},

		openFromLocal: function() {
			var file = air.File.documentsDirectory;
			var filter = new air.FileFilter('Music', '*.mp3; *.MP3');
			file.browseForOpenMultiple('Open', new window.runtime.Array(filter));
			var self = this;
			file.addEventListener(air.FileListEvent.SELECT_MULTIPLE, function(e){
				var files = $A(e.files);
				if (files.size() < 1) {
					return;
				}

				var _song = song = null;
				files.each(function(file){
					_song = self.addFile(file);
					if (!song) {
						song = _song;
					}
				});

				setTimeout(function(){Music.start(song.musicUrl, song.name)}, 100);
			});
		},

		addToPlayLists: function(song) {
			var lists = $('lists');
			if (lists.childElements().any(function(it){
				return it.childElements().last().down('a').href == song.musicUrl;
			})) {
				return;
			}
			lists.insert(
				"<ul>" +
				"<li>" + song.name + "</li>" +
				"<li>" + song.singer + "</li>" +
				"<li><a href=\"" + song.musicUrl + "\"><img src=\"" + Player.Util.images.resume + "\"></a></li>" +
				"</ul>"
			);
			var link = lists.childElements().last().down('a');
			link.onclick = function(){return false};
			link.observe('click', function(){
				Music.start(this.href, $(this.parentNode.parentNode).childElements()[0].innerHTML);
			});
		},

		playNext: function() {
			air.trace('Play next');
			var lists = $('lists').childElements();
			var i = 0, length = lists.length, list = null;
			if (length == 1) {
				return;
			}
			for (; i < length; i++) {
				list = lists[i];
				if (list.hasClassName('ACT')) {
					if (i < length - 1) {
						list = lists[i + 1];
					} else {
						list = lists[0];
					}
					Music.start(list.down('a').href, list.select('li')[0].innerHTML);
					break;
				}
			}
		},

		getPlaybackSlider: function() {
			return new Control.Slider('playbackSlideHandle', 'playbackSlide', {
				axis:'horizontal',
				range: $R(1, 100),
				sliderValue: 1
			});
		},

		getVolumeSlider: function() {
			return new Control.Slider('volumeSlideHandle', 'volumeSlide', {
				axis:'vertical',
				range: $R(1, 100),
				sliderValue: 1,
				values: $A($R(1, 99))
			});
		},

		clickVolume: function() {
			if (!Music.snd) {
				return false;
			}
			var pos = $('volume').cumulativeOffset(), 
			    size = $('playbackSlide').getDimensions(), 
			    vs = $('volumeSlide');
			if (parseInt(vs.getStyle('left')) < 0) {
				vs.hide();
				$('volumeSlideFill').hide();
			}
			vs.setStyle({
				left: pos.left + 'px',
				top: (pos.top + size.height) + 'px',
				position: 'absolute'
			}).toggle();

			// fill the volumeSlide
			var pos = $('volumeSlideHandle').cumulativeOffset(),
			    size = $('volumeSlideHandle').getDimensions();	
			$('volumeSlideFill').setStyle({
				top: (pos.top + size.height) + 'px',
				left: (pos.left + 1) + 'px',
				width: (vs.getWidth() - 2) + 'px',
				height: ($('volumeSlide').cumulativeOffset().top + $('volumeSlide').getHeight() 
					- pos.top - size.height - 1) + 'px',
				display: vs.getStyle('display')
			});
		}
	};

	var Music = {
		snd: null,
		channel: null,
		position: null,
		timer: null,
		soundLength: 0,
		volumeSlider: null,
		volumeValue: 1,
		playbackSlider: null,
		playbackStatus: true,
		isDragSliding: false,
		transform: null,
		url: null,
		name: null,

		start: function(url, name) {
			air.trace("Playing: " + url);
			var self = this;

			// playback slider
			if (null === this.playbackSlider) {
				this.playbackSlider = Util.getPlaybackSlider();
				this.playbackSlider.options.onSlide = function(v) {
					self.isDragSliding = true;
					self.playbackStatus = false;
				}
				this.playbackSlider.options.onChange = function(v) {
					if (!self.isDragSliding || !self.soundLength) {
						return false;
					}
					self.position = v / 100.0 * self.soundLength;
					self.channel.stop();
					self.pauseOrResume();
					self.playbackStatus = true;
					self.isDragSliding = false;
				}
			} 

			// reset the position of playback and downloading
			this.playbackSlider.setValue(0);
			$('downloadedHandle').setStyle({width: '1px'});

			if (null === this.volumeSlider) {
				this.volumeSlider = Util.getVolumeSlider();
				this.volumeSlider.options.onSlide = function(v) {
					self.volumeValue = v;
					self.transform.volume = (100 - v) / 100.0;
					self.channel.soundTransform = self.transform;

					var pos = $('volumeSlideHandle').cumulativeOffset(),
				      size = $('volumeSlideHandle').getDimensions();	
					$('volumeSlideFill').setStyle({
						top: (pos.top + size.height) + 'px',
						height: ($('volumeSlide').cumulativeOffset().top + $('volumeSlide').getHeight() 
							- pos.top - size.height - 1) + 'px'
				  });
				}
				this.volumeSlider.options.onChange = function(v) {
					$('volumeSlide', 'volumeSlideFill').invoke('hide');
				}
			}

			this.url = url;
			this.name = name;

			// do some cleanning
			this.close(true);

			// start a new player
			var req = new air.URLRequest(url), snd = this.snd = new air.Sound();
			snd.load(req, new air.SoundLoaderContext(8000, true));

			// completed downloading
			snd.addEventListener(air.Event.COMPLETE, function(e){});

			// progress
			snd.addEventListener(air.ProgressEvent.PROGRESS, function(e){
				var downloadedPercent = Math.ceil((e.bytesLoaded / e.bytesTotal) * 100),
				    pos = $('playbackSlide').cumulativeOffset(),
				    size = $('playbackSlide').getDimensions();
				var rate = size.width / 100.0;
				$('downloadedHandle').setStyle({
					display: 'block',
					height: size.height + 'px',
					width: (downloadedPercent * rate) + 'px',
					position: 'absolute',
					left: pos.left + 'px',
					top: pos.top + 'px'
				});
			});

			// can't open the file to play
			snd.addEventListener(air.IOErrorEvent.IO_ERROR, function(e){
				alert('Can not load the file: ' + url);
			});	

			// playing song's name
			$('songName').update(name);

			this.play(0);
		},

		play: function(position) {
			if (!this.snd) {
				alert('Can not find any file to be play');
				return;
			}

			var self = this;
			$('resumePause').src = Util.images.pause;
			$('stopPlay').src = Util.images.stop;

			// transform
			self.transform = new air.SoundTransform(
				(100 - self.volumeValue) / 100.0, 
				0
			);

			// start to play
			this.channel = this.snd.play(position);
			this.channel.soundTransform = self.transform;
			this.resetSoundCompleteEvent();

			var playbackPercent = 0, bytes = new air.ByteArray();

			// update the status of playback silder
			this.timer = setInterval(function(){
				if (self.snd.bytesLoaded < self.snd.bytesTotal) {
					self.soundLength = Math.ceil(self.snd.length / (self.snd.bytesLoaded / self.snd.bytesTotal));
					playbackPercent = Math.ceil(100 * (self.channel.position / self.soundLength));
				} else {
					self.soundLength = self.snd.length;
					playbackPercent = Math.ceil(100 * (self.channel.position / self.soundLength));
				}
				if (self.playbackStatus) {
					self.playbackSlider.setValue(self.position === 0 ? 1 : playbackPercent - 1);
				}
				$('soundBuffering').setStyle({display: self.snd.isBuffering ? 'inline' : 'none'});

				// drawing
				var n = 0;
				air.SoundMixer.computeSpectrum(bytes, true, 0);
				for (var i = 0; i < 128; i++) {
					bytes.position = i * 8;
					n = bytes.readFloat();
					height = n * 30;
					if (height > 30) height = 30;
					$('soundBytes_' + i).setStyle({height: height + 'px'});
				}
			}, 100);

			// highlight the playing song
			var currentSong;
			$('lists').childElements().each(function(it){
				currentSong = it.childElements().last().down('a');
				if (currentSong.href == self.url) {
					it.addClassName('ACT');
					currentSong.hide();
				} else {
					it.removeClassName('ACT');
					currentSong.show();
				}
			});
		},

		close: function(closeAll) {
			if (this.snd) {
				air.trace('Stopping and closing: ' + this.snd.url);
				if (closeAll) {
					try{this.snd.close();}catch(e){}
					this.snd = null;
					clearInterval(this.timer);
				}
				this.channel.stop();
			}
			$('resumePause').src = Util.images.resume;
			$('stopPlay').src = Util.images.play;
		},

		stopOrPlay: function() {
			if (!this.snd) {
				return;
			}
			if (0 !== this.position) {
				this.close(false);
				this.position = 0;
			} else {
				$('resumePause').src = Util.images.pause;
				$('stopPlay').src = Util.images.stop;
				this.channel = this.snd.play(0);
				this.resetSoundCompleteEvent();
				this.position = null;
			}
		},

		pauseOrResume: function() {
			if (!(this.channel && this.snd)) {
				return;
			}
			if (null === this.position) {
				this.position = this.channel.position;
				this.channel.stop();
				$('resumePause').src = Util.images.resume;
			} else {
				this.channel = this.snd.play(this.position);
				this.resetSoundCompleteEvent();
				this.position = null;
				$('stopPlay').src = Util.images.stop;
				$('resumePause').src = Util.images.pause;
			}
		},

		resetSoundCompleteEvent: function() {
			var self = this;
			// play finished
			this.channel.addEventListener(air.Event.SOUND_COMPLETE, function(e){
				$('resumePause').src = Util.images.resume;
				$('stopPlay').src = Util.images.play;
				if ($('songLoop').hasClassName('ACT')) {
					self.close(false);
					self.play(0);
				} else {
					Util.playNext();
				}
			});
		}
	};

	var Search = Class.create({
		initialize: function(key) {
			this.key = key;
			air.trace('Searching: ' + key);
		},
	});

	var SearchGoogle = Class.create(Search, {
		url: 'http://www.google.cn/music/search',

		search: function() {
			var self = this;
			air.trace('Start to search: ' + self.key);
			new Ajax.Request(self.url, {
				parameters: {
					q: self.key,
					aq: 'f'
				},
				method: 'get',
				onLoading: function() {
					air.trace("loading");
				},
				onFailure: function(res) {
					air.trace("Failed: " + res.ponseText);
				},
				onSuccess: function(res) {
					var songs = self.getSongs(res.responseText);
					air.trace("Finished, found " + songs.size() + " songs");
					if (songs.size() < 1) {
						return alert('Can not find anything!');
					}
					Util.updateSongsList(songs, self);
				}
			});
		},

		getSongs: function(data) {
			var songs = [], items = data.split('freemusic_song_result');
			items.each(function(it){
				if (!it.include('Download BottomBorder')) {
					return;
				}
				var song = {};
				it.scan(/<td\sclass="Title\sBottomBorder">(.+?)<\/a>/i, function(match){
					song.name = match[1].stripTags();
				});
				it.scan(/white-space:nowrap;">(.+?)<\/a><\/td>/, function(match){
					song.singer = match[1].stripTags();
				});
				it.scan(/<td\sclass="Album\sBottomBorder">(.+?)<\/a>/i, function(match){
					song.album = match[1].stripTags();
				});
				it.scan(/<td\sclass="Download\sBottomBorder">(.+?),/im, function(match){
					match[1].scan(/\/music\/url\?q\\x3d(.+)&quot;/i, function(m){
						song.url = unescape(m[1]).gsub(/\\x26/, '&').gsub(/\\x3d/, '=');
					});
				});
				songs.push(song);
			});
			return songs;
		},

		parseAndPlay: function(songIndex) {
			var song = Util.songs[songIndex];
			if (!song) {
				air.trace("Error: can not found the song to play");
			}
			if (!Object.isUndefined(song.musicUrl)) {
				Music.start(song.musicUrl, song.name);
				return;
			}
			url = song.url.split('?');
			url = 'http://www.google.cn/music/top100/musicdownload?' + url[1].gsub(/\\x26/, '&').gsub(/\\x3d/, '=');
			new Ajax.Request(url, {
				method: 'get',
				onComplete: function(res) {
					res.responseText.scan(/url\?q=(.+?)"/, function(match){
						var url = "http://www.google.cn/music/top100/url?q=" + match[1].gsub('&amp;', '&');
						var song = Util.songs[songIndex];
						song.musicUrl = url;
						Util.addToPlayLists(song);
						Music.start(url, song.name);
					});
				}
			});
		}
	});

	function search(key) {
		var searchEngine = new SearchGoogle(key);
		try {
			searchEngine.search();
		} catch (e) {
			air.trace("Exception: " + e);
		}
	}

	function init() {
		var pos = $('playbackSlide').cumulativeOffset(), size = $('playbackSlide').getDimensions();
		$('controller').setStyle({
			display: 'block',
			position: 'absolute',
			left: (pos.left + size.width + 10) + 'px',
			top: pos.top + 'px'
		});

		$('soundBuffering').setStyle({
			left: (pos.left + size.width - $('soundBuffering').getWidth()) + 'px',
			top: pos.top + 'px',
			height: size.height + 'px'
		});
		$('playbackSlideHandle').setOpacity(0.7);

		// controllers...
		$('controller').insert({
			top: '<img src="' + Util.images.resume + '" id="resumePause" />' + 
			'<img src="' + Util.images.stop + '" id="stopPlay" />' +
			'<img src="' + Util.images.volume + '" id="volume" />'
		});
		$('resumePause').observe('click', function(){Music.pauseOrResume()});
		$('stopPlay').observe('click', function(){Music.stopOrPlay()});
		$('volume').observe('click', function(){Util.clickVolume()});

		// soundBytes
		var soundBytes = ["<tbody><tr>"];
		for (var i = 0; i < 128; i++) {
			soundBytes.push("<td valign=\"bottom\"><div id=\"soundBytes_" + i + "\"></div></td>");
		}
		soundBytes.push("</tr></tbody>");
		$('soundBytes').update(soundBytes.join(''));

		// dragDrop supported
		$(document.body).observe('dragenter', function(e){
			e.preventDefault();
		}).observe('dragover', function(e){
			e.preventDefault();
		}).observe('drop', function(e){
			var _song = song = null, self = this;

			$A(e.dataTransfer.getData('application/x-vnd.adobe.air.file-list')).each(function(file){
				if (/\.(mp3)$/i.test(file.url)) {
					_song = Util.addFile(file);
					if (!song) {
						song = _song;
					}
				}
			});

			if (song) {
			  setTimeout(function(){Music.start(song.musicUrl, song.name)}, 100);
		  }
		});
	}

	return {
		Music: Music,
		search: search,
		Util: Util,
		init: init
	}

})();

document.observe('dom:loaded',  Player.init);
