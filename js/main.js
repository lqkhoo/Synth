/**
 * @author Li Quan Khoo
 */


/*
 * Currently global scope to be accessible from developer console
 */
var SYNTH = SYNTH || {};

(function($, Backbone, Handlebars, Timbre, MUSIC, Note, Interval) {
    
    // Template cacher ------------------------------------------------------------------------------
    function cacheTemplates(cacheObject, templateUrl, templateSelector) {
        if(! cacheObject) {
            cacheObject = {};
        }
        
        var templateString;
        $.ajax({
            url: templateUrl,
            method: 'GET',
            async: false,
            success: function(data) {
                templateString = $(data).filter(templateSelector);
                var i;
                for(i = 0; i < templateString.length; i++) {
                    cacheObject[templateString[i].id] = $(templateString[i]).html();
                    //cacheObject[templateString[i].id] = Handlebars.compile($(templateString[i]).html());
                }
            },
            error: function() {
                console.error('Error fetching templates');
            }
        });
    }
    
    // Define the template cache object and cache them
    SYNTH.templateCache = {};
    cacheTemplates(SYNTH.templateCache, 'templates/templates.html', '.template');
    
    
    // Augment Music.js library scale definition with chromatic scale
    MUSIC.scales['chromatic'] = MUSIC.scales['chromatic'] || ['minor second', 'major second', 'minor third', 'major third', 'fourth', 'augmented fourth', 'fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh'];
    
    
    // Generate frequency table -------------------------------------------------------
    (function() {
        var tones = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        var octaves = ['1', '2', '3', '4', '5', '6', '7', '8'];
        
        SYNTH.TONES = ['A0', 'Bb0', 'B0'];
        (function() {
            var i, j;
            for(i = 0; i < octaves.length; i++) {
                for(j = 0; j < tones.length; j++) {
                    SYNTH.TONES.push(tones[j] + octaves[i]);
                    if(SYNTH.TONES.length >= 88) {
                        return;
                    }
                }
            }
        }());
        
        SYNTH.FREQS = [];
        (function() {
            var i;
            for(i = 0; i < SYNTH.TONES.length; i++) {
                SYNTH.FREQS.push(Note.fromLatin(SYNTH.TONES[i]).frequency());
            }
        }());
    }());
    
    
    // Sound definitions ----------------------------------------------------------------------------
    
    function makeTimbre(soundCode, frequencyArray, loudness, attack, decay, sustain, release) {
        
        switch(soundCode) {
        case 'synthPiano':
            var i;
            var oscArray = [];
            
            for(i = 0; i < frequencyArray.length; i++) {
                oscArray.push(Timbre('sin', {freq: frequencyArray[i], mul: loudness}));
            }
            var env = Timbre('perc', {r: release}, oscArray).bang();
            return env;
            
        default:
            // do nothing
            return;
        }
        
    }
    
    // Models ---------------------------------------------------------------------------------------
    
    /**
     * A part (of a musical score)
     * A part consists of a 88-row boolean array with a (virtually) unbounded right end.
     * Each row corresponds to a Timbre object. If true, it's supposed to be played.
     */
    var Part = Backbone.Model.extend({
        
        defaults: {
            'instrument': undefined,
            'array': undefined
        },
        
        /** Gets instrument which this part controls */
        getInstrument: function() {
            var instrument = this.get('instrument');
            return instrument;
        },
        
        /** Set instrument reference to part */
        setInstrument: function(instrument) {
            this.set({'instrument': instrument});
        },
        
        /** Gets controller array of part */
        getArray: function() {
            var array = this.get('array');
            return array;
        },
        
        /** Sets value for controller array */
        setArray: function(newArray) {
            this.set({'array': newArray});
        },
        
        /** Constructs a new controller array based on arguments */
        setArrayFromArgs: function(tonalRange, scoreLength) {
            var array = [];
            for(var i = 0; i < tonalRange; i++) {
                array.push([]);
                for(var j = 0; j < scoreLength; j++) {
                    array[i].push(false);
                }
            }
            this.setArray(array);
        },
        
        /** Updates array coordinates with new value */
        setArrayPoint: function(tone, beat, value) {
            var array = this.getArray();
            array[tone][beat] = value;
            this.setArray(array);
        },
        
        /** Gets orchestra of the instrument which this part controls */
        getOrchestra: function() {
            var orchestra = this.getInstrument().getOrchestra();
            return orchestra;
        }
        
    });
    
    var Instruments = Backbone.Collection.extend({
        model: Instrument
    });
    
    
    /**
     * An instrument
     * One instrument contains:
     *   88 instances of Timbre objects - one the frequency of each piano key
     *   An Score object, controlling how the instrument is supposed to be played
     */
    var Instrument = Backbone.Model.extend({ // Instrument. Timbre object tagged with numeric id
        defaults: {
            'orchestra': undefined,
            'id': null,
            'name': '(unnamed)',
            'part': undefined,
            'loudness': 1,
            'soundCode': null
        },
        
        /** Gets orchestra */
        getOrchestra: function() {
            var orchestra = this.get('orchestra');
            return orchestra;
        },
        
        /** Returns the integer id of the instrument */
        getId: function() {
            var id = this.get('id');
            return id;
        },
        
        /** Returns the name of the instrument */
        getName: function() {
            var name = this.get('name');
            return name;
        },
        
        /** Sets the name of the instrument */
        setName: function(newName) {
            this.set({'name': newName});
        },
        
        /** Gets part */
        getPart: function() {
            var part = this.get('part');
            return part;
        },
        
        /** Gets loudness */
        getLoudness: function() {
            var loudness = this.get('loudness');
            return loudness;
        },
        
        /** Sets loudness */
        setLoudness: function(newLoudness) {
            this.set({'loudness': newLoudness});
        },
        
        /** Gets sound code */
        getSoundCode: function() {
            var soundCode = this.get('soundCode');
            return soundCode;
        },
        
        /** Sets sound code */
        setSoundCode: function(newsoundCode) {
            this.set({'soundCode': newsoundCode});
        },
        
    });
    
    /**
     * The Orchestra
     * Responsible for keeping track of the tempo, all active instruments.
     */
    var Orchestra = Backbone.Model.extend({
        defaults: function() {
            var instruments = new Instruments();
            return {
                'TONES': undefined,
                'FREQS': undefined,
                'key': 'A',
                'scale': 'chromatic',   // 'chromatic', 'major', 'harmonic minor', 'melodic minor', 'major pentatonic', 'minor pentatonic'
                'mspb': 300,            // milliseconds per beat
                'currentBeat': 0,
                'isLooping': true,
                'isPlaying': false,
                'player': null,         // the interval Timbre.js object responsible for keeping beat and playing everything
                'instruments': instruments,
                'nextInstrumentId': 0,  // id given to next instrument added to orchestra
                'scoreLength': 24       // 24 beats
            };
        },
        
        // Instrument controls
        
        /** Gets the Collection of Instruments */
        getInstrumentCollection: function() {
            var collection = this.get('instruments');
            return collection;
        },
        
        /** Get the list of instruments registered on the orchestra */
        getInstruments: function() {
            var instruments = this.get('instruments');
            return instruments.models;
        },
        
        /** Get instrument with specified Id */
        getInstrumentById: function(id) {
            var instruments = this.getInstruments();
            var i;
            for(i = 0; i < instruments.length; i++) {
                if(instruments[i].getId() === id) {
                    return instruments[i];
                }
            }
        },
                       
        /** Add an Instrument to the orchestra */
        addInstrument: function(soundCode, instrumentName) {
            
            // Grab next id
            var nextInstrumentId = this.get('nextInstrumentId');
            
            // Initialize the part controlling the instrument
            var part = new Part();
            part.setArrayFromArgs(this.get('TONES').length, this.getScoreLength());
            
            // Initialize new instrument
            var instrument = new Instrument({
                'orchestra': this,
                'id': nextInstrumentId,
                'name': instrumentName,
                'part': part,
                'soundCode': soundCode
            });
            
            part.setInstrument(instrument);
            
            // Update orchestra
            this.getInstrumentCollection().add(instrument);
            
            nextInstrumentId += 1;
            this.set({
                'nextInstrumentId': nextInstrumentId
            });
            
        },
        
        /** Remove an Instrument from the orchestra */
        removeInstrument: function(id) {
            var instruments = this.getInstruments();
            var i;
            for(i = 0; i < instruments.length; i++) {
                if(instruments[i].getId() === id) {
                    instruments[i].destroy();
                }
            }
        },
        
        
        // Score controls
        
        /** Gets score length */
        getScoreLength: function() {
            var scoreLength = this.get('scoreLength');
            return scoreLength;
        },
        
        /** Set score length */
        setScoreLength: function(newScoreLength) {
            this.set({'scoreLength': newScoreLength});
        },
        
        // Key and scale (tonality) controls
        
        /** Gets key */
        getKey: function() {
            var key = this.get('key');
            return key;
        },
        
        /** Sets key */
        setKey: function(newKey) {
            this.set({'key': newKey});
        },
        
        /** Get scale */
        getScale: function() {
            var scale = this.get('scale');
            return scale;
        },
        
        /** Set scale */
        setScale: function(newScale) {
            this.set({'scale': newScale});
        },
        
        // Beat controls
        
        /** Set how many milliseconds to take for a beat */
        setMspb: function() {
            var mspb = this.get('mspb');
            this.set({'mspb': mspb});
        },
        
        /** Get current beat */
        getCurrentBeat: function() {
            var currentBeat = this.get('currentBeat');
            return currentBeat;
        },
        
        /** Set current beat */
        setCurrentBeat: function(newCurrentBeat) {
            this.set({'currentBeat': newCurrentBeat});
        },
        
        // Player controls
        
        /** Get loop */
        getIsLooping: function(bool) {
            var isLooping = this.get('isLooping');
            return isLooping;
        },
        
        /** Set loop */
        setIsLooping: function(bool) {
            this.set({'isLooping': bool});
        },
        
        /** Get is playing status */
        getIsPlaying: function() {
            var isPlaying = this.get('isPlaying');
            return isPlaying;
        },
        
        /** Play all instruments registered within the orchestra */
        play: function() {
            this.playFromBeat(0);
        },
        
        /** Play from beat n */
        playFromBeat: function(startBeat) {
            
            var self = this;
            
            // get milliseconds per beat
            var mspb = this.get('mspb');
            
            // set current beat to given offset
            this.setCurrentBeat(startBeat);
                        
            // initialize interval Timbre.js object, set to play the instruments
            this.set({'player': Timbre('interval', {interval: mspb}, function(count) {
                    (function() {
                        var i, j;
                        var controlArray;
                        var timbreArray;
                        var instruments = self.getInstruments();
                        for(i = 0; i < instruments.length; i++) {
                            controlArray = instruments[i].getPart().getArray();
                            timbreArray = [];
                            for(j = 0; j < controlArray.length; j++) {
                                if(controlArray[j][self.getCurrentBeat()] === true) {
                                    timbreArray.push(self.get('FREQS')[j]);
                                }
                            }
                            makeTimbre(instruments[i].getSoundCode(), timbreArray).play();
                        }
                    }());
                    self.setCurrentBeat(startBeat + count + 1);
                })
            });
            var player = this.get('player');
            player.start();
            this.set({'isPlaying': true});
        },
        
        /** Stop all instruments registered within the orchestra */
        stop: function() {
            var player = this.get('player');
            player.stop();
            this.set({'isPlaying': false});
        },
        
        /** Toggles stop or play depending on current state */
        togglePlay: function() {
            if(this.getIsPlaying()) {
                this.stop();
            } else {
                this.play();
            }
        }
        
    });
    
    // Views ----------------------------------------------------------------------------------------
    
    var PlayerControlView = Backbone.View.extend({
        el: '#player-controls-inner',
        _template: SYNTH.templateCache['template-player-controls-inner'],
        _modelBinder: undefined,
        initialize: function() {
            this._modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        
        render: function() {
            var converter = function(direction, value) {
                if(value) {
                    return 'glyphicon glyphicon-stop';
                } else {
                    return 'glyphicon glyphicon-play';
                }
            };
            this.$el.html(this._template);
            var bindings = {
                'isPlaying': {
                    selector: '#button-play-pause',
                    elAttribute: "class",
                    converter: converter
                },
                'currentBeat': '[data-attr="beat"]'
            };
            this._modelBinder.bind(this.model, this.el, bindings);
            return this;
        },
        
        close: function() {
            this._modelBinder.unbind();
        },
        
        events: {
            'click #button-play-pause': 'togglePlay'
        },
        
        togglePlay: function() {
            this.model.togglePlay();
        }
        
    });
    
    var InstrumentControlView = Backbone.View.extend({
        el: '#instrument-controls',
        _template: SYNTH.templateCache['template-instrument-controls'],
        _componentTemplate: SYNTH.templateCache['template-instrument-control-block'],
        _modelBinder: undefined,
        _collectionBinder: undefined,
        initialize: function() {
            var bindings = {
                'name': {
                    selector: '[data-attr="name"]'
                },
                'id': '[data-attr="instrument-id"]',
                'loudness': '[data-attr="loudness"]'
            };
            this._modelBinder = new Backbone.ModelBinder();
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, bindings)
            );
            this.render();
        },
        
        render: function() {
            this.$el.html(this._template);
            this._collectionBinder.bind(this.model.getInstrumentCollection(), this.el);
            return this;
        },
        
        close: function() {
            this._collectionBinder.unbind();
        }
        
    });
    
    
    // Variables ------------------------------------------------------------------------------------
    SYNTH.orchestra = new Orchestra({
        'TONES': SYNTH.TONES,
        'FREQS': SYNTH.FREQS
    });
    
    // Document.ready --------------------------------------------------------------------------------
    
    $(document).ready(function() {
        
        SYNTH.orchestra.addInstrument('synthPiano', 'instrument1');
        SYNTH.orchestra.addInstrument('synthPiano', 'instrument2');
        SYNTH.orchestra.addInstrument('synthPiano', 'instrument3');
        SYNTH.orchestra.addInstrument('synthPiano', 'instrument4');
        SYNTH.orchestra.addInstrument('synthPiano', 'instrument5');
        SYNTH.orchestra.addInstrument('synthPiano', 'instrument6');
        SYNTH.orchestra.addInstrument('synthPiano', 'instrument7');
        SYNTH.orchestra.addInstrument('synthPiano', 'instrument8');
        var testInstrument = SYNTH.orchestra.getInstrumentById(0);
        testInstrument.getPart().setArrayPoint(50, 0, true);
        testInstrument.getPart().setArrayPoint(55, 4, true);
        //addInstrument(synthPiano());
        //addInstrument(lowPiano());
        
        console.log(Note.fromLatin('C4').frequency());
        
        SYNTH.orchestra.play();
        
        // Bind views
        SYNTH.VIEWS = {};
        SYNTH.VIEWS.playerControl = new PlayerControlView({model: SYNTH.orchestra});
        SYNTH.VIEWS.instrumentControl = new InstrumentControlView({model: SYNTH.orchestra});
        
        function resizeUI() {
            var windowHeight = $(window).height() - 125;
            $('#site-main').attr({'style': 'height: ' + windowHeight + 'px;'});
        }
        
        resizeUI();
        $(window).resize(resizeUI);
        
        $('#site-bottom').click(function() {
            $(this).toggleClass('expanded');
        });
        
    });
    
    
}(jQuery, Backbone, Handlebars, T, MUSIC, Note, Interval));

