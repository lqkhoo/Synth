/**
 * @author Li Quan Khoo
 */


/*
 * Currently global scope to be accessible from developer console
 */
var SYNTH = SYNTH || {};

(function($, Backbone, Timbre, MUSIC, Note, Interval) {
    
    if(! $) { throw 'jQuery not available.'; }
    if(! Backbone) { throw 'Backbone.js not available.'; }
    if(! Timbre) { throw 'Timbre.js not available. '; }
    if(! MUSIC || ! Note || ! Interval) { throw 'MUSIC.js not available. '; }
    
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
        
    var Beats = Backbone.Collection.extend({
        model: Beat
    });
    
    /**
     * A beat, which has a collection of 88 notes
     * Initialization is handled by Instrument class and above
     */
    var Beat = Backbone.Model.extend({
        
        defaults: function() {
            
            var obj = {
                'time': null,
                'value': null,
                'instrumentId': undefined
            };
            var i;
            for(i = 0; i < 88; i++) {
                obj[i] = false;
            }
            return obj;
        },
        
        /** Get time */
        getTime: function() {
            var time = this.get("time");
            return time;
        },
        
        /** Gets value (duration) of note */
        getValue: function() {
            var value = this.get('value');
            return value;
        },
        
        /** Sets new value (duration) for note */
        setValue: function(newValue) {
            this.set({'value': newValue});
        },
        
        /** Set notes */
        setNotes: function(newNoteArray) {
            var i;
            for(i = 0; i < newNoteArray.length; i++) {
                this.setNote(i, newNoteArray[i]);
            }
        },
        
        /** Get note */
        getNote: function(pitch) {
            var note = this.get(pitch);
            return note;
        },
        
        /** Set note */
        setNote: function(pitch, value) {
            this.set(pitch, value);
        },
        
        /** Get instrument */
        getInstrumentId: function() {
            var instrumentId = this.get('instrumentId');
            return instrumentId;
        }
        
    });
    
    /**
     * Collection of Instruments
     */
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
            'beats': undefined,
            'loudness': 1,
            'soundCode': null,
            'isActive': false   // whether instrument is current instrument being edited
        },
        
        changeId: function(newId) {
            this.set("id", newId);
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
        
        /** Get beats collection */
        getBeatsCollection: function() {
            var beatsCollection = this.get('beats');
            return beatsCollection;
        },
        
        /** Gets beats */
        getBeats: function() {
            var beats = this.get('beats');
            return beats.models;
        },
        
        /** Gets specific beat */
        getBeat: function(n) {
            var beats = this.getBeats();
            var i;
            for(i = 0; i < beats.length; i++) {
                if(beats[i].get('time') === n) {
                    return beats[i];
                }
            }
        },
        
        /** Set beat */
        setBeatsCollection: function(newBeats) {
            this.set({'beats': newBeats});
        },
        
        /** Sets specific beat */
        setNote: function(time, tone, bool) {
            var beats = this.get("beats").models;
            var i;
            //TODO mark
            for(i = 0; i < beats.length; i++) {
                if(beats[i].getTime() === time) {
                    beats[i].setNote(tone, bool);
                }
            }
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

        /** Get whether instrument is being actively edited */
        getIsActive: function() {
            var isActive = this.get('isActive');
            return isActive;
        },
        
        /** Set instrument as being actively edited */
        setIsActive: function(isActive) {
            this.set({isActive: isActive});
        }
        
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
                'activeInstrumentId': undefined, 
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
                        
            // Initialize the beats and notes
            var scoreLength = this.getScoreLength();
            var tonalRange = this.get("TONES").length;
            var beats = new Beats();
            
            (function() {
                var i, j;
                for(i = 0; i < scoreLength; i++) {
                    
                    var notes = [];
                    var beat;
                    for(j = 0; j < tonalRange; j++) {
                        notes.push(false);
                    }
                    beat = new Beat({
                        'time': i,
                        'notes': notes,
                        'instrumentId': nextInstrumentId
                    });
                    beats.add(beat);
                }
            }());
            
            // Initialize the new instrument
            var instrument = new Instrument({
                'orchestra': this,
                'id': nextInstrumentId,
                'name': instrumentName,
                'beats': beats,
                'soundCode': soundCode
            });
            
            // Update orchestra
            this.getInstrumentCollection().add(instrument);
            SYNTH.views.beatControls[nextInstrumentId] = new BeatControlView({model: instrument});
            
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
        
        /** Set new active instrument */
        setNewActiveInstrument: function(id) {
            if(this.get('activeInstrumentId') !== undefined) {
                this.getInstrumentById(this.get('activeInstrumentId')).setIsActive(false);
            }
            this.set({'activeInstrumentId': id});
            this.getInstrumentById(id).setIsActive(true);
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
                    var i, j;
                    var currentBeat = self.getCurrentBeat();
                    var timbreArray;
                    var beat;
                    var instruments = self.getInstruments();
                    for(i = 0; i < instruments.length; i++) {
                        beat = instruments[i].getBeats()[currentBeat];
                        if(! beat ) {
                            self.stop();
                            break;
                        }
                        timbreArray = [];
                        for(j = 0; j < 88; j++) {
                            if(beat.getNote(j) === true) {
                                timbreArray.push(self.get('FREQS')[j]);
                            }
                        }
                        makeTimbre(instruments[i].getSoundCode(), timbreArray).play();
                    }
                    currentBeat = startBeat + count;
                    if(beat) {
                        currentBeat += 1;
                    }
                    self.setCurrentBeat(currentBeat);
                    
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
        el: '#player-controls',
        _template: SYNTH.templateCache['template-player-controls'],
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
            
            var converter = function(direction, value) {
                if(value) { return 'btn-primary'; }
                return 'btn-default';
            };
            
            var modelBindings = {
                'name': {
                    selector: '[data-attr="name"]'
                },
                'id': [
                    {
                        selector: '[data-attr="instrument-id"]',
                        
                    },
                    {
                        selector: '.instrument-control-block',
                        elAttribute: 'data-id'
                    }
                ],
                'loudness': '[data-attr="loudness"]',
                'isActive': {
                    selector: '.instrument-control-block',
                    elAttribute: 'class',
                    converter: converter
                }
            };
                        
            this._modelBinder = new Backbone.ModelBinder();
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, modelBindings)
            );
            this.render();
        },
        
        render: function() {
            
            this.$el.html(this._template);
            this._collectionBinder.bind(this.model.getInstrumentCollection(), this.el);
            return this;
        },
        
        events: {
            'click .instrument-control-block': 'setAsActiveInstrument',
            'click *': 'stopPropagation'
        },
        
        close: function() {
            this._collectionBinder.unbind();
        },
        
        setAsActiveInstrument: function(event) {
            this.model.setNewActiveInstrument(parseInt($(event.target).attr('data-id')));
        },
        
        stopPropagation: function(event) {
            event.stopPropagation();
        }
        
    });
    
    var InstrumentPartView = Backbone.View.extend({
        el: '#part-controls',
        _template: SYNTH.templateCache['template-part-controls'],
        _componentTemplate: SYNTH.templateCache['template-part-control-array'],
        _modelBinder: undefined,
        _collectionBinder: undefined,
        initialize: function() {
            
            var converter = function(direction, value) {
                if(value) {
                    return 'active';
                }
                return 'inactive';
            };
            
            var bindings = {
                'id': {
                    selector: '.part-control-block-inner',
                    elAttribute: 'data-id'
                },
                'isActive': {
                    selector: '.part-control-block-inner',
                    elAttribute: 'class',
                    converter: converter
                }
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
    
    var BeatControlView = Backbone.View.extend({
        el: '', // placeholder value
        _template: SYNTH.templateCache['template-beat-controls'],
        _componentTemplate: SYNTH.templateCache['template-beat-control-array'],
        _modelBinder: undefined,
        _collectionBinder: undefined,
        initialize: function() {
            this.el = '.part-control-block-inner[data-id="' + this.model.getId() + '"]';
            
            function converter(direction, value) {
                return value + 1;
            }
            
            var bindings = {
                'time': [
                    {
                        selector: '.beat-control-block-inner',
                        elAttribute: 'data-time'
                    },
                    {
                        selector: '.time',
                        converter: converter
                    }
                ]
            };
            var i;
            for(i = 0; i < 88; i++) {
                bindings[i] = {selector: '.' + i, elAttribute: 'data-active' };
            }
            
            this._modelBinder = new Backbone.ModelBinder();
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, bindings)
            );
            this.render();
            
        },
        
        render: function() {
            this.$el.html(this._template); // this doesn't do anything, but is required for the collectionbinder to render
            this._collectionBinder.bind(this.model.getBeatsCollection(), this.el);
            return this;
        },
        
        close: function() {
            this._collectionBinder.unbind();
        }
    });
    
    // Variables ------------------------------------------------------------------------------------
    
    SYNTH.views = {};
    SYNTH.models = {};
    
    SYNTH.models.orchestra = new Orchestra({
        'TONES': SYNTH.TONES,
        'FREQS': SYNTH.FREQS
    });
    
    // Document.ready --------------------------------------------------------------------------------
    
    $(document).ready(function() {
        
        
        // Bind views
        SYNTH.views.playerControl = new PlayerControlView({model: SYNTH.models.orchestra});
        SYNTH.views.instrumentControl = new InstrumentControlView({model: SYNTH.models.orchestra});
        SYNTH.views.instrumentPartControl = new InstrumentPartView({model: SYNTH.models.orchestra});
        SYNTH.views.beatControls = {};
        
        
        // Preconfigure orchestra
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument1');
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument2');
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument3');
        var testInstrument = SYNTH.models.orchestra.getInstrumentById(0);
        testInstrument.setNote(0, 50, true);
        testInstrument.setNote(4, 55, true);
        
        // Play
        SYNTH.models.orchestra.play();
        
        // UI ops
        function initUI() {
            
            function initializeTop() {
                var parent = $('#part-top');
                var i;
                parent.append($('<div></div>'));
                for(i = 0; i < 88; i++) {
                    parent.append($('<div>' + SYNTH.TONES[i].charAt(0)+ '</div>'));
                }
            }
            
            function resizeUI() {
                var windowHeight = $(window).height() - 125;
                $('#site-main').attr({'style': 'height: ' + windowHeight + 'px;'});
            }
            
            initializeTop();
            resizeUI();
            $(window).resize(resizeUI);
            
            $('#site-bottom').click(function() {
                $(this).toggleClass('expanded');
            });
        }
        
        initUI();
        
    });
    
    
}(jQuery, Backbone, T, MUSIC, Note, Interval));

