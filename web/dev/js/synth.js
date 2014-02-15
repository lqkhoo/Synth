/**
 * @author Li Quan Khoo
 */
var SYNTH = (function($, _, Backbone, MUSIC, MUSIC_Note, MUSIC_Interval, MIDI) {
    "use strict";
    // Require --------------------------------------------------------------------------------------
    if(! $) { throw 'jQuery not available.'; }
    if(! _) { throw 'Underscore.js not available'; }
    if(! Backbone) { throw 'Backbone.js not available.'; }
    if(! MUSIC || ! MUSIC_Note || ! MUSIC_Interval) { throw 'MUSIC.js not available.'; }
    if(! MIDI) { throw 'MIDI.js not available.'; }
    
    
    
    SYNTH.soundfontUrl = '../soundfont/';
    
    // Op | Establish template cache -------------------------------------------------------------------
    SYNTH.templateCache = {};
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
                throw 'Error fetching templates';
            }
        });
    }
    cacheTemplates(SYNTH.templateCache, 'templates/templates.html', '.template');
    
    // Op | Define frequency table
    function generateFrequencyTable() {
        var tones = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
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
                SYNTH.FREQS.push(MUSIC_Note.fromLatin(SYNTH.TONES[i]).frequency());
            }
        }());
    };
    generateFrequencyTable();
    
    // Op | Augment Music.js library scale definition with chromatic scale
    MUSIC.scales['chromatic'] = MUSIC.scales['chromatic'] || ['minor second', 'major second', 'minor third', 'major third', 'fourth', 'augmented fourth', 'fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh'];
    
    // Declare | Sound definitions ----------------------------------------------------------------------------
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
    
    // Declare | Command class ----------------------------------------------------------------------
    
    /*
     * Specify a command this way:
     * var cmd = new Command({
     *     scope: this,
     *     exec: {
     *         func: myFunction,
     *         args: [myArg1, myArg2,...]
     *     },
     *     undo: {
     *         func: myUndoFunction,
     *         args: [myArg1, myArg2...]
     *     }
     * });
     */
    /** An object encapsulating a function and its logical reverse.
     *  Used for the undo/redo stack
     */
    function Command(args) {
        var self = this;
        this._scope = args.scope;
        this._func = args.exec.func;
        this._args = args.exec.args;
        this._undoFunc = args.undo.func;
        this._undoArgs = args.undo.args;
        this.exec = function() {
            self._func.apply(self._scope, self._args);
        };
        this.undo = function() {
            self._undoFunc.apply(self._scope, self._undoArgs);
        };
    };
    
    /** Queue for managing window events */
    function EventQueue() {
        var queue = [];
        
        this.enqueue = function(eventId) {
            return queue.push(eventId);
        };
        /** Call this when the event has already been executed to tidy up the queue */
        this.dequeue = function() {
            return queue.shift();
        };
        /** Call this if the event has not yet fired and you want to cancel execution  */
        this.dequeueEarly = function() {
            var timeoutId = queue.shift();
            window.clearTimeout(timeoutId);
            return timeoutId; 
        },
        /** Call this to empty the queue and cancel all events scheduled to be fired */
        this.emptyQueue = function() {
            while(queue.length != 0) {
                this.dequeueEarly();
            }
        };
    }
    
    /** An object which executes a Command object */
    var Invoker = Backbone.Model.extend({
        defaults: {            
            'undoStack': [],
            'redoStack': []
        },
        _getUndoStack: function() {
            return this.get('undoStack');
        },
        
        _getRedoStack: function() {
            return this.get('redoStack');
        },
        _triggerChange: function() {
            this.trigger('change:undoStack');
            this.trigger('change:redoStack');
        },
        getUndoStackLength: function() {
            return this._getUndoStack().length;
        },
        getRedoStackLength: function() {
            return this._getRedoStack().length;
        },
        invoke: function(command) {
            this._getUndoStack().push(command);
            command.exec();
            this.set('redoStack', []);
            this._triggerChange();
        },
        undo: function() {
            var command = this._getUndoStack().pop();
            command.undo();
            this._getRedoStack().push(command);
            this._triggerChange();
        },
        redo: function() {
            var command = this._getRedoStack().pop();
            command.exec();
            this._getUndoStack().push(command);
            this._triggerChange();
        }
    });
    
    // Declare | Models ---------------------------------------------------------------------------------------
    
    /**
     * A note. The id is when it's played
     * If ornaments are to be added later, it should be here
     */
    var Note = Backbone.Model.extend({
        defaults: {
            'id': null,
            'value': 1
        },
        
        // setters | getters
        getTime: function() {
            return this.get('id');
        },
        setTime: function(newId) {
            this.set('id', newId);
            return newId;
        },
        getValue: function() {
            return this.get('value');
        },
        setValue: function(newValue) {
            this.set('value', newValue);
            return newValue;
        }
    });
    
    /** Collection of Note objects */
    var Notes = Backbone.Collection.extend({
        model: Note
    });
        
    /**
     * An object handling a particular frequency
     */
    var Pitch = Backbone.Model.extend({
        defaults: {
            'id': null,
            'instrument': null,
            'noteCollection': null,
            'isPlayed': true,
            'isSelected': false
        },
        
        // setters | getters
        getId: function() {
            return this.get('id');
        },
        setId: function(newId) {
            this.set('id', newId);
            return newId;
        },
        getInstrument: function() {
            return this.get('instrument');
        },
        setInstrument: function(instrument) {
            this.set('instrument', instrument);
            return instrument;
        },
        getNoteCollection: function() {
            return this.get('noteCollection');
        },
        _setNoteCollection: function(noteCollection) {
            this.set('noteCollection', noteCollection);
            return noteCollection;
        },
        getNotes: function() {
            var notes = this.getNoteCollection().models;
            return notes;
        },
        getIsPlayed: function() {
            return this.get('isPlayed');
        },
        setIsPlayed: function(isPlayed) {
            this.set('isPlayed', isPlayed);
            return isPlayed;
        },
        getIsSelected: function() {
            return this.get('isSelected');
        },
        setIsSelected: function(isSelected) {
            this.set('isSelected', isSelected);
            return isSelected;
        },
        
        // methods
        getNoteStartingAt: function(time) {
            return this.getNoteCollection().get(time);
        },
        /** Given a time, gets the note occupying it */
        getOccupyingNote: function(time) {
            var i;
            var note;
            for(i = time; i >= 0; i--) {
                note = this.getNoteCollection().get(i);
                if(note !== undefined) {
                    // found a note. If note's value is longer than/eq to what we've traversed
                    // this note must be occupying the given time
                    if(note.getValue() >= time - i + 1) {
                        return note;
                    } else break;
                }
            }
            return undefined;
        },
        /** Checks whether a given time can be written in with a new note */
        isTimeAvailable: function(time) {
            if(this.getOccupyingNote(time) === undefined) {
                return true;
            } else {
                return false;
            }
        },
        /** Given a time, gets the note before it, whether the time is occupied by a note or not
         *  If there is no note, return undefined
         */
        getNoteBeforeThisTime: function(time) {
            var i;
            var note;
            var noteCollection = this.getNoteCollection();
            var occupyingNote = this.getOccupyingNote(time);
            if(occupyingNote) {
                i = occupyingNote.getTime();
            } else {
                i = time;
            }
            for(i; i >= 0; i--) {
                note = noteCollection.get(i);
                if(note !== undefined) {
                    return note; 
                }
            }
            return undefined;
        },
        /** Given a time, gets the note after it, whether the time is occupied by a note or not */
        getNoteAfterThisTime: function(time) {
            var i;
            var note;
            var noteCollection = this.getNoteCollection();
            for(i = time + 1; i < this.getInstrument().getOrchestra().getScoreLength(); i++) {
                note = noteCollection.get(i);
                if(note !== undefined) {
                    return note;
                }
            }
            return undefined;
        },
        /** Gets earliest start time in the current time window */
        getEarliestWindow: function(time) {
            var note = this.getNoteBeforeThisTime(time);
            if(note) {
                return note.getValue() + note.getTime();
            }
            return 0;
        },
        /** Gets latest end time for the current time window */
        getLatestWindow: function(time) {
            var note = this.getNoteAfterThisTime(time);
            if(note) {
                return note.getTime() - 1;
            }
            return this.getInstrument().getOrchestra().getScoreLength() - 1;
        },
        /** Given a time, check if it's the very beginning of a note */
        isNoteStart: function(time) {
            var note = this.getNoteCollection().get(time);
            if(note) {
                return true;
            }
            return false;
        },
        /** Given a time, check if it's the very end of a note */
        isNoteEnd: function(time) {
            var note = this.getOccupyingNote(time);
            if(note) {
                if(note.getTime() + note.getValue() -1 === time) {
                    return true;
                }
            }
            return false;
        }

    });
    
    /**
     * Collection of Pitch objects
     */
    var Pitches = Backbone.Collection.extend({
        model: Pitch
    });
    
    /**
     * Static | Factory for Pitch and Pitches
     */
    var pitchFactory = {
        collectionFromScratch: function(instrument, scoreLength) {
            
            var pitches = new Pitches();
            var pitch;
            var notes;
            
            var i;
            for(i = 0; i < 88; i++) {
                notes = new Notes();
                pitch = new Pitch({
                    'id': i,
                    'noteCollection': notes,
                    'isPlayed': true,
                    'instrument': instrument,
                    //TODO potential bug if currently pitches are selected for some other instrument
                    //Need to deselect when adding new instrument
                    'isSelected': false
                });
                pitches.add(pitch);
            }
            
            return pitches;
        }
    };
    
    /**
     * Object responsible for generating sound
     */
    var SoundGenerator = Backbone.Model.extend({
        
    });
    
    /**
     * An instrument
     */
    var Instrument = Backbone.Model.extend({
        defaults: {
            'id': null,
            'name': 'New instrument',
            'orchestra': null,
            'pitchCollection': null,
            'soundFontId': 0,
            'volume': 200,
            'isSustainOn': false,
            'sustainDuration': 300,
            'isMuted': false,
            'isSelected': false,
            'displayedColor': '#EE3A73'
        },
        
        getId: function() {
            return this.get('id');
        },
        setId: function(newId) {
            this.set('id', newId);
            return newId;
        },
        getName: function() {
            return this.get('name');
        },
        setName: function(newName) {
            this.set('name', newName);
            return newName;
        },
        getOrchestra: function() {
            return this.get('orchestra');
        },
        setOrchestra: function(newOrchestra) {
            this.set('orchestra', newOrchestra);
            return newOrchestra;
        },
        getPitchCollection: function() {
            return this.get('pitchCollection');
        },
        setPitchCollection: function(pitchCollection) {
            this.set('pitchCollection', pitchCollection);
            return pitchCollection;
        },
        getSoundFontId: function() {
            return this.get('soundFontId');
        },
        setSoundFontId: function(newSoundFontId) {
            this.set('soundFontId', newSoundFontId);
            this.getOrchestra().getController().getPlayer().loadSoundFont(soundFontNumber);
            return newSoundFontId;
        },
        getVolume: function() {
            return this.get('volume');
        },
        setVolume: function(newVolume) {
            this.set('volume', newVolume);
            return newVolume;
        },
        getIsSustainOn: function() {
            return this.get('isSustainOn');
        },
        setIsSustainOn: function(bool) {
            this.set('isSustainOn', bool);
            return bool;
        },
        getSustainDuration: function() {
            return this.get('sustainDuration');
        },
        setSustainDuration: function(sustainDuration) {
            this.set('sustainDuration', sustainDuration);
            return sustainDuration;
        },
        getIsMuted: function() {
            return this.get('isMuted');
        },
        setIsMuted: function(isMuted) {
            this.set('isMuted', isMuted);
            return isMuted;
        },
        getIsSelected: function() {
            return this.get('isSelected');
        },
        setIsSelected: function(isSelected) {
            this.set('isSelected', isSelected);
            return isSelected;
        },
        getDisplayedColor: function() {
            return this.get('displayedColor');
        },
        setDisplayedColor: function(colorString) {
            this.set('displayedColor', colorString);
            return colorString;
        },
        
        // methods
        getPitch: function(pitchId) {
            return this.getPitchCollection().get(pitchId);
        },
        getAllPitches: function() {
            return this.getPitchCollection().models;
        },
        toggleIsSustainOn: function() {
            return this.setIsSustainOn(! this.getIsSustainOn());
        },
        toggleIsMuted: function() {
            return this.setIsMuted(! this.getIsMuted());
        }
    });
    
    /**
     * A collection of Instruments
     */
    var Instruments = Backbone.Collection.extend({
        model: Instrument
    });
    
    /**
     * Static | Factory for Instruments
     */
    var instrumentFactory = {
        //TODO change sound code to sound model
        instrumentFromScratch: function(orchestra, instrumentId, soundCode, instrumentName) {
            var instrument = new Instrument({
                'orchestra': orchestra,
                'id': instrumentId,
                'name': instrumentName,
                'soundCode': soundCode
            });
            
            instrument.setPitchCollection(
                    pitchFactory.collectionFromScratch(instrument, orchestra.getScoreLength())
                    );
            
            return instrument;
        },
        getNewDefaultInstrument: function(orchestra, instrumentId) {
            var instrument = new Instrument({
                'orchestra': orchestra,
                'id': instrumentId
            });
            instrument.setPitchCollection(
                    pitchFactory.collectionFromScratch(instrument, orchestra.getScoreLength())
                    );
            
            return instrument;
        }
    };
    
    /**
     * An object representing a time unit (one row on the grid)
     * Used mostly for backbone and view binding purposes
     */
    var TimeUnit = Backbone.Model.extend({
       defaults: {
           'id': null,
           'isSelected': null
       },
       getId: function() {
           return this.get('id');
       },
       getIsSelected: function() {
           return this.get('isSelected');
       },
       setIsSelected: function(isSelected) {
           this.set('isSelected', isSelected);
           return isSelected;
       }
    });
    
    /**
     * A collection of time units
     */
    var TimeUnits = Backbone.Collection.extend({
        model: TimeUnit
    });
        
    /** Object responsible for playing the orchestra */
    var Player = Backbone.Model.extend({
        defaults: {
            'currentTime': 0,
            'eventQueue': new EventQueue(),
            'isPlaying': false,
            'isLooping': false,
            'orchestra': null,
            'controller': null,
            'isPlayerReady': false,
            'soundFontsLoaded': {},
            'loadingSoundFonts': [],
        },
        getCurrentTime: function() {
            return this.get('currentTime');
        },
        setCurrentTime: function(newTime) {
            this.set('currentTime', newTime);
            return newTime;
        },
        getEventQueue: function() {
            return this.get('eventQueue');
        },
        getIsPlaying: function() {
            return this.get('isPlaying');
        },
        _setIsPlaying: function(isPlaying) {
            this.set('isPlaying', isPlaying);
            return isPlaying;
        },
        getIsLooping: function() {
            return this.get('isLooping');
        },
        setIsLooping: function(isLooping) {
            this.set('isLooping', isLooping);
            return isLooping;
        },
        getOrchestra: function() {
            return this.get('orchestra');
        },
        getController: function() {
            return this.get('controller');
        },
        getIsPlayerReady: function() {
            return this.get('isPlayerReady');
        },
        setIsPlayerReady: function(bool) {
            this.set('isPlayerReady', bool);
            return bool;
        },
        getSoundFontsLoaded: function() {
            return this.get('soundFontsLoaded');
        },
        getLoadingSoundFonts: function() {
            return this.get('loadingSoundFonts');
        },
        // methods
        incrementCurrentTime: function() {
            return this.setCurrentTime(this.getCurrentTime() + 1);
        },
        /** Returns an array of soundfont instrument ids (strings) */
        getSoundFontInstruments: function() {
            var orchestra = this.getOrchestra();
            var soundFontLibrary = orchestra.getSoundFontLibrary();
            var array = [];
            var instruments = orchestra.getAllInstruments();
            var i, j;
            var soundFontId;
            var isInArray;
            for(i = 0; i < instruments.length; i++) {
                soundFontId = soundFontLibrary.getSoundFontByNumber(instruments[i].getSoundFontId()).id;
                isInArray = false;
                for(j = 0; j < array.length; j++) {
                    if(soundFontId === array[j]) {
                        isInArray = true;
                    }
                }
                if(! isInArray) {
                    array.push(soundFontId);
                }
                
            }
            return array;
        },
        /** Plays notes starting at the given time
         *  This is a private helper method to playFromTime etc. and does not actually 
         *  set up all the states properly by itself
         */
        _playTime: function(time, orchestra, instruments, squaresPerSecond) {
            
            var instrumentId = null;
            var instrument;
            var volume;
            var isSustainOn;
            var sustainDuration;
            
            var pitches;
            var pitchId = null;
            var pitch;
            
            var note;
            var midiNoteCode;
            var channelId;
            var noteOffDelay;
            
            for(instrumentId in instruments) {
                instrument = instruments[instrumentId];
                
                if(! instrument.getIsMuted()) {
                    volume = instrument.getVolume();
                    isSustainOn = instrument.getIsSustainOn();
                    pitches = instrument.getAllPitches();
                    
                    for(pitchId in pitches) {
                        pitch = pitches[pitchId];
                        note = pitch.getNoteStartingAt(time);
                        if(note) {
                            midiNoteCode = MIDI.pianoKeyOffset + parseInt(pitchId);
                            channelId = parseInt(instrumentId);
                            
                            MIDI.noteOn(channelId, midiNoteCode, volume, 0);
                            if(isSustainOn) {
                                sustainDuration = instrument.getSustainDuration() / 1000;
                                MIDI.noteOff(channelId, midiNoteCode, sustainDuration);
                            } else {
                                noteOffDelay = note.getValue() * squaresPerSecond;
                                MIDI.noteOff(channelId, midiNoteCode, noteOffDelay);
                            }
                        }
                    }
                }
            }
        },
        /** Helper function for play behavior - detects whether looping is on, if it is,
         *  this stops the player at the square of grid, otherwise sets time to beginning
         *  and plays through the piece again.
         */
        _loopOrStop: function() {
            console.log('fooo');
            if(this.getIsLooping()) {
                this.playFromTime(0);
            } else {
                this.pause();
            }
        },
        play: function() {
            this.playFromTime(this.getCurrentTime());
        },
        /** This is the key method that plays music back */
        playFromTime: function(startTime) {
            var self = this;
            
            var time;
            var orchestra = this.getOrchestra();
            var squaresPerSecond = orchestra.getPlaySpeed() / 1000;
            var instruments = orchestra.getAllInstruments();
            var instrumentId = null;
            
            var delay;  // delay before playing the note
            var isLastNote;
            this._setIsPlaying(true);
            
            // establish channels
            if(MIDI.programChange) {
                for(instrumentId in instruments) {
                    MIDI.programChange(parseInt(instrumentId), instruments[instrumentId].getSoundFontId());
                }
            }
            
            for(time = startTime; time < orchestra.getScoreLength(); time++) {
                
                if(time === orchestra.getScoreLength() - 1) {
                    isLastNote = true;
                } else {
                    isLastNote = false;
                }
                
                (function(time, isLastNote) {
                    var timeoutId;
                    
                    delay = (time - startTime) * squaresPerSecond * 1000;
                    timeoutId = window.setTimeout(function() {
                        self.setCurrentTime(time);
                        self._playTime(time, orchestra, instruments, squaresPerSecond);
                        self.getEventQueue().dequeue();
                    }, delay, time);
                    
                    self.getEventQueue().enqueue(timeoutId);
                    
                    if(isLastNote) {
                        timeoutId = window.setTimeout(function() {
                            self._loopOrStop();
                        }, (time - startTime + 1) * squaresPerSecond * 1000);
                    }
                    
                }(time, isLastNote));

            }
        },
        pause: function() {
            this._setIsPlaying(false)
            this.getEventQueue().emptyQueue();
        },
        togglePlayPause: function() {
            if(this.getIsPlaying()) {
                this.pause();
            } else {
                this.play();
            }
        },
        /** Moves the play head to a new time */
        setPlayHead: function(newTime) {
            this.getEventQueue().emptyQueue();
            this.setCurrentTime(newTime);
            if(this.getIsPlaying()) {
                this.play();
            }
        },
        rewindToStart: function() {
            this.setCurrentTime(0);
        },
        forwardToEnd: function() {
            this.setCurrentTime(this.getOrchestra().getScoreLength() - 1);
        },
        toggleIsLooping: function() {
            this.setIsLooping(! this.getIsLooping());
        },
        // sound font methods
        getIsSoundFontLoaded: function(number) {
            if(this.getSoundFontsLoaded()[number]) {
                return true;
            }
            return false;
        },
        isSoundFontLoading: function(number) {
            
            var soundFont = this.getOrchestra().getSoundFontLibrary().getSoundFontByNumber(number);
            var soundFontName = soundFont.instrument;
            var loadingSoundFonts = this.getLoadingSoundFonts();
            var i;
            var isLoading = false;
            
            for(i = 0; i < loadingSoundFonts.length; i++) {
                if(loadingSoundFonts[i] === soundFontName) {
                    isLoading = true;
                }
            }
            return isLoading;
        },
        getIsSoundFontLoadingOrLoaded: function(number) {
            return this.getIsSoundFontLoaded(number) || this.isSoundFontLoading(number);
        },
        loadSoundFont: function(number) {
            var self = this;
            var soundFont = this.getOrchestra().getSoundFontLibrary().getSoundFontByNumber(number);
            var soundFontId = soundFont.id;
            
            if(! this.getIsSoundFontLoadingOrLoaded(number)) {
                MIDI.loadPlugin({
                    soundfontUrl: SYNTH.soundfontUrl,
                    instruments: [soundFontId],
                    callback: function() {
                        console.log('callback');
                        self.markSoundFontAsLoaded(number);
                    }
                });
            }
            
        },
        markSoundFontAsLoaded: function(number) {
            var soundFontName = this.getOrchestra().getSoundFontLibrary().getSoundFontByNumber(number).instrument;
            var loadingSoundFonts = this.getLoadingSoundFonts();
            this.getSoundFontsLoaded()[number] = true;
            var i;
            for(i = 0; i < loadingSoundFonts.length; i++) {
                if(loadingSoundFonts[i] === soundFontName) {
                    loadingSoundFonts.pop(i);
                    break;
                }
            }
        }
    });
    
    /** The model providing access to soundfont data */
    var SoundFontLibrary = Backbone.Model.extend({
        defaults: {
            'soundFonts': {}, // this should be a hash object
        },
        getSoundFonts: function() {
            return this.get('soundFonts');
        },
        
        // methods
        getSoundFontByNumber: function(number) {
            return this.getSoundFonts()[number];
        },
        getSoundFontByName: function(name) {
            var property = null;
            for(property in this.getSoundFonts()) {
                if(soundFonts[property].name === name) {
                    return soundFonts[property];
                }
            }
            return undefined;
        },
        getLength: function() {
            var i = 0;
            for(property in this.soundFonts) {
                if(soundFonts[property]) {
                    i++;
                }
            }
            return i;
        },
        initFromMidiJs: function(midi) {
            var soundFonts = this.getSoundFonts();
            var property = null;
            for(property in midi.GeneralMIDI.byId) {
                soundFonts[property] = midi.GeneralMIDI.byId[property];
            }
        }
    });
    
    /**
     * The orchestra
     */
    var Orchestra = Backbone.Model.extend({
        defaults: {
            'controller': null,
            'soundFontLibrary': null,
            'instrumentCollection': new Instruments(),
            'dummyInstrument': null,
            'nextInstrumentId': 0,
            'activeInstrumentId': null,
            'timeUnitCollection': null,
            'scoreLength': 24,
            'playSpeed': 300
        },
        initialize: function() {
            var instrument;
            var timeUnitCollection;
            var soundFontLibrary;
            
            instrument = instrumentFactory.instrumentFromScratch(
                    this, -1, 'dummy', 'dummy', this.getScoreLength());
 
            timeUnitCollection = new TimeUnits();
            var i;
            for(i = 0; i < this.getScoreLength(); i++) {
                timeUnitCollection.add(new TimeUnit({
                    'id': i,
                    'isSelected': false
                }));
            }
            
            soundFontLibrary = new SoundFontLibrary();
            soundFontLibrary.initFromMidiJs(MIDI);
            
            this._setDummyInstrument(instrument);
            this._setTimeUnitCollection(timeUnitCollection);
            this._setSoundFontLibrary(soundFontLibrary);
        },
        // getters | setters
        getController: function() {
            return this.get('controller');
        },
        _setPlayer: function(player) {
            this.set('player', player);
            return player;
        },
        getSoundFontLibrary: function() {
            return this.get('soundFontLibrary');
        },
        _setSoundFontLibrary: function(library) {
            this.set('soundFontLibrary', library);
            return library;
        },
        getInstrumentCollection: function() {
            return this.get('instrumentCollection');
        },
        getDummyInstrument: function() {
            return this.get('dummyInstrument');
        },
        _setDummyInstrument: function(instrument) {
            this.set('dummyInstrument', instrument);
            return instrument;
        },
        getNextInstrumentId: function() {
            return this.get('nextInstrumentId');
        },
        incrementNextInstrumentId: function() {
            var nextId = this.getNextInstrumentId() + 1;
            return this._setNextInstrumentId(nextId);
        },
        decrementNextInstrumentId: function() {
            var nextId = this.getNextInstrumentId() - 1;
            return this._setNextInstrumentId(nextId);
        },
        _setNextInstrumentId: function(newId) {
            this.set('nextInstrumentId', newId);
            return newId;
        },
        getActiveInstrumentId: function() {
            return this.get('activeInstrumentId');
        },
        _setActiveInstrumentId: function(id) {
            this.set('activeInstrumentId', id);
            return id;
        },
        getTimeUnitCollection: function() {
            return this.get('timeUnitCollection');
        },
        _setTimeUnitCollection: function(timeUnitCollection) {
            this.set('timeUnitCollection', timeUnitCollection);
            return timeUnitCollection;
        },
        getScoreLength: function() {
            return this.get('scoreLength');
        },
        _setScoreLength: function(newScoreLength) {
            this.set('scoreLength', newScoreLEngth);
            return newScoreLength;
        },
        getPlaySpeed: function() {
            return this.get('playSpeed');
        },
        setPlaySpeed: function(playSpeed) {
            this.set('playSpeed', playSpeed);
            return playSpeed;
        },
         
        // methods
        getPitch: function(instrumentId, pitchId) {
            return this.getInstrumentById(instrumentId).getPitchCollection().get(pitchId);
        },
        getInstrumentById: function(id) {
            var instrument = this.getInstrumentCollection().get(id);
            return instrument;
        },
        getAllInstruments: function() {
            return this.getInstrumentCollection().models;
        },
        /** Adds a new pre-constructed instrument into the collection
         *  if isUndo set to true, this will set the added instrument as the
         *  currently selected instrument, as per the undo action
         */
        addInstrument: function(instrument, instrumentId, isUndo) {
            var soundFontNumber = instrument.getSoundFontId();
            var initialCount = this.getInstrumentCollection().length;
            this.getInstrumentCollection().add(instrument);
            if(initialCount === 0 || isUndo) {
                this.setNewActiveInstrument(instrumentId);
            }
            if(SYNTH.app.topView) {
                SYNTH.app.topView.getGridView().addPitchCollectionView(instrumentId);
            }
            this.incrementNextInstrumentId();
            this.getController().getPlayer().loadSoundFont(soundFontNumber);
            return instrument;
        },
        /** Adds a new default instrument to the collection */
        addNewDefaultInstrument: function() {
            var nextInstrumentId = this.getNextInstrumentId();
            var instrument = instrumentFactory.getNewDefaultInstrument(this, nextInstrumentId);
            this.addInstrument(instrument, nextInstrumentId);
            return instrument;
        },
        /** Returns a newly constructed default instrument */ 
        makeNewDefaultInstrument: function() {
            var nextInstrumentId = this.getNextInstrumentId();
            var instrument = instrumentFactory.getNewDefaultInstrument(this, nextInstrumentId);
            return instrument;
        },
        removeInstrumentById: function(instrumentId) {
            var instrumentCollection = this.getInstrumentCollection();
            var instrument = instrumentCollection.get(instrumentId);
            var isInstrumentSelected = instrument.getIsSelected();
            
            instrumentCollection.remove(instrumentId);
            if(isInstrumentSelected) {
                if(instrumentCollection.models.length !== 0) {
                    this.setNewActiveInstrument(instrumentCollection.models[0].getId());
                }
            }
            return instrument;
        },
        getActiveInstrument: function() {
            return this.getInstrumentById(this.getActiveInstrumentId());
        },
        /** Set new active instrument */
        setNewActiveInstrument: function(id) {
            if(this.get('activeInstrumentId') !== null) {
                if(this.getInstrumentById(this.getActiveInstrumentId())) {
                    this.getInstrumentById(this.getActiveInstrumentId()).setIsSelected(false);
                }
            }
            this._setActiveInstrumentId(id);
            this.getInstrumentById(id).setIsSelected(true);
        },
        addNote: function(instrumentId, pitchId, startTime, value) {
            var pitch = this.getPitch(instrumentId, pitchId);
            var note = pitch.getNoteCollection();
            note.add(new Note({'id': startTime, 'value': value}));
        },
        removeNote: function(instrumentId, pitchId, startTime) {
            var pitch = this.getPitch(instrumentId, pitchId);
            var noteCollection = pitch.getNoteCollection();
            var note = noteCollection.get(startTime);
            if(note) {
                noteCollection.remove(startTime);
            }
        },
        // For efficiency reasons this method does not do error checking
        setNoteValue: function(instrumentId, pitchId, startTime, newValue) {
            // be careful of this degenerate condition. This condition is checked for
            // within the Controller class so this shouldn't happen. It's not undo-safe
            if(newValue === 0) {
                this.removeNote(instrumentId, pitchId, startTime);
            }
            var pitch = this.getPitch(instrumentId, pitchId);
            var note = pitch.getNoteCollection().get(startTime);
            note.setValue(newValue);
        },
        getTimeUnit: function(time) {
            return this.getTimeUnitCollection().get(time);
        },
        setTimeUnitSelection: function(time, isSelected) {
            this.getTimeUnit(time).setIsSelected(isSelected);
            return isSelected;
        }
    });
    
    /** Model of user-controllable Views' states */
    var ViewController = Backbone.Model.extend({
        defaults: {
            'isEditPanelVisible': true,
            'isViewPanelVisible': true
        },
        toggleEditPanelVisibility: function() {
            this.set('isEditPanelVisible', ! this.get('isEditPanelVisible'));
        },
        toggleViewPanelVisibility: function() {
            this.set('isViewPanelVisible', ! this.get('isViewPanelVisible'));
        }
    });
    
    /**
     * The top-level controller class to complete MVC.
     * All top-level views should interface
     * only with this model. Methods which push Commands onto the
     * redo / undo stack are called invocations, and are prefixed with 
     * 'invoke_'
     */
    var Controller = Backbone.Model.extend({
        defaults: {
            // 'mode': 'synth' / 'game',
            'orchestra': new Orchestra(),
            'player': null,
            'invoker': new Invoker(),
            'viewController': new ViewController()
        },
        initialize: function() {
            var orchestra;
            var player;
            
            orchestra = new Orchestra({
                controller: this
            });
            this._setOrchestra(orchestra);
            
            player = new Player({
                orchestra: orchestra,
                controller: this
            });
            
            this._setPlayer(player);
        },
        getOrchestra: function() {
            return this.get('orchestra');
        },
        _setOrchestra: function(orchestra) {
            this.set('orchestra', orchestra);
            return orchestra;
        },
        getPlayer: function() {
            return this.get('player');
        },
        _setPlayer: function(player) {
            this.set('player', player);
            return player;
        },
        getInvoker: function() {
            return this.get('invoker');
        },
        getViewController: function() {
            return this.get('viewController');
        },
        // invocations
        
        /*
         * Specify a command this way:
         * var cmd = new Command({
         *     scope: this,
         *     exec: {
         *         func: myFunction,
         *         args: [myArg1, myArg2,...]
         *     },
         *     undo: {
         *         func: myUndoFunction,
         *         args: [myArg1, myArg2...]
         *     }
         * });
         */
        
        _invoke: function(command) {
            this.getInvoker().invoke(command);
        },
        invoke_undo: function() {
            this.getInvoker().undo();
        },
        
        invoke_redo: function() {
            this.getInvoker().redo();
        },
        
        invoke_addNote: function(instrumentId, pitchId, startTime, value) {
            var orchestra = this.getOrchestra();
            var command = new Command({
                scope: orchestra,
                exec: {
                    func: orchestra.addNote,
                    args: [instrumentId, pitchId, startTime, value]
                },
                undo: {
                    func: orchestra.removeNote,
                    args: [instrumentId, pitchId, startTime]
                }
            });
            this._invoke(command);
        },
        invoke_removeNote: function(instrumentId, pitchId, startTime, value) {
            var orchestra = this.getOrchestra();
            var command = new Command({
                scope: orchestra,
                exec: {
                    func: orchestra.removeNote,
                    args: [instrumentId, pitchId, startTime]
                },
                undo: {
                    func: orchestra.addNote,
                    args: [instrumentId, pitchId, startTime, value]
                }
            });
            this._invoke(command);
        },
        invoke_editNoteValue: function(instrumentId, pitchId, time, oldValue, newValue) {
            var orchestra = this.getOrchestra();
            var command = new Command({
               scope: orchestra,
               exec: {
                   func: orchestra.setNoteValue,
                   args: [instrumentId, pitchId, time, newValue]
               },
               undo: {
                   func: orchestra.setNoteValue,
                   args: [instrumentId, pitchId, time, oldValue]
               }
            });
            this._invoke(command);
        },
        invoke_addDefaultInstrument: function() {
            var orchestra = this.getOrchestra();
            var defaultInstrument = orchestra.makeNewDefaultInstrument();
            var nextInstrumentId = orchestra.getNextInstrumentId();
            var command = new Command({
                scope: orchestra,
                exec: {
                    func: orchestra.addInstrument,
                    args: [defaultInstrument, nextInstrumentId]
                },
                undo: {
                    func: orchestra.removeInstrumentById,
                    args: [nextInstrumentId]
                }
            });
            this._invoke(command);
        },
        invoke_removeSelectedInstrument: function() {
            var orchestra = this.getOrchestra();
            var instrumentId = orchestra.getActiveInstrumentId();
            var instrument = orchestra.getInstrumentById(instrumentId);
            var command = new Command({
                scope: orchestra,
                exec: {
                    func: orchestra.removeInstrumentById,
                    args: [instrumentId]
                },
                undo: {
                    func: orchestra.addInstrument,
                    args: [instrument, instrumentId, true]
                }
            });
            this._invoke(command);
        }
    });
    
    // Declare | Views -----------------------------------------------------------------------------------------   
    
    // Grid views --------------------------------
    
    var GridNoteCollectionView = Backbone.View.extend({
        el: '',
        collectionTemplate: SYNTH.templateCache['template-note'],
        collectionBinder: null,
        
        initialize: function() {
            function valueToHeight(direction, value) {
                return 'height:' + (value * 20 - 3).toString() + 'px';  // value * 20 subtract 2px border 1px compensation
            }
            
            function idToTop(direction, value) {
                return 'top: ' + (value * 20).toString() + 'px';
            }
            
            var bindings = {
                'id': [
                   {
                        'selector': '.dot',
                        'elAttribute': 'data-time'
                   },
                   {
                       'selector': '.dot',
                       'elAttribute': 'style',
                       'converter': idToTop
                   }
                ],
                'value': {
                    'selector': '.dot-in',
                    'elAttribute': 'style',
                    'converter': valueToHeight
                }
            };
            this.el = '.g-instrument-inner[data-id="' + this.model.getInstrument().getId() + '"] .g-pitch-in[data-pitch="' + this.model.getId() +  '"]';
            this.collectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ElManagerFactory(this.collectionTemplate, bindings)
                );
            
            this.render();
        },
        render: function() {
            this.collectionBinder.bind(this.model.getNoteCollection(), this.el);
            return this;
        },
        close: function() {
            this.collectionBinder.unbind();
        }
    });
    
    /**
     * Component view. Displays note and beat information for each pitch
     */
    var GridPitchCollectionView = Backbone.View.extend({
        el: '',
        collectionTemplate: SYNTH.templateCache['template-grid-pitch'],
        collectionBinder: null,
        
        initialize: function() {
            this.el = '.g-instrument-inner[data-id="' + this.model.getId() + '"]';
            
            function plusOneConverter(direction, value) {
                return value + 1;
            }
            
            function strToBoolConverter(direction, value) {
                if(direction === 'ViewToModel') {
                    if(value === 'true') {
                        return true;
                    } else {
                        return false;
                    }
                }
            }
                        
            var bindings = {
                'id': [
                    {
                        selector: '.g-pitch-in',
                        elAttribute: 'data-pitch'
                    }
                ],
                'isSelected': {
                    selector: '.g-pitch-in',
                    elAttribute: 'data-isselected'
                }
            };
            
            this.collectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ElManagerFactory(this.collectionTemplate, bindings)
                );
            this.render();
        },
        render: function() {
            this.collectionBinder.bind(this.model.getPitchCollection(), this.el);
        },
        close: function() {
            this.unbind();
        }
    });
    
    /**
     * Component view. Displays underlying grid for each instument within grid view
     * Expected model: Controller
     */
    var GridInstrumentView = Backbone.View.extend({
        el: '#grid-instruments',
        collectionTemplate: SYNTH.templateCache['template-grid-instrument'],
        collectionBinder: null,
        
        initialize: function() {
            
            var converter = function(direction, value) {
                if(value) {
                    return 'selected';
                }
                return 'unselected';
            };
            
            function colorToBackground(direction, value) {
                return 'background-color: ' + value;
            }
            
            var bindings = {
                'id': {
                    selector: '.g-instrument-inner',
                    elAttribute: 'data-id'
                },
                'isSelected': {
                    selector: '.g-instrument-inner',
                    elAttribute: 'class',
                    converter: converter
                },
                'displayedColor': {
                    selector: '.g-instrument-inner',
                    elAttribute: 'style',
                    converter: colorToBackground
                }
            };
            
            this.collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this.collectionTemplate, bindings)
            );
            this.render();
        },
        render: function() {
            this.collectionBinder.bind(this.model.getOrchestra().getInstrumentCollection(), this.el);
        },
        close: function() {
            this.collectionBinder.unbind();
        }
        
    });
    
    /**
     * Component view. Captures mouse events for the grid
     */
    var GridEventCaptureView = Backbone.View.extend({
        el: '#grid-event-capture-layer',
        columnEl: '#grid-event-capture-layer-columns',
        rowCollectionBinder: null,
        rowTemplate: SYNTH.templateCache['template-grid-event-capture-layer-row'],
        columnTemplate: SYNTH.templateCache['template-grid-event-capture-layer-column'],
        
        initialize: function() {
            var bindings = {
                'id': {
                    'selector': 'div',
                    'elAttribute': 'data-time'
                },
                'isSelected': {
                    'selector': 'div',
                    'elAttribute': 'data-isselected'
                }
            };
            
            this.rowCollectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ElManagerFactory(this.rowTemplate, bindings)
                    );
            $(this.columnEl).html(this.columnTemplate); // render columns
            this.render();
        },
        render: function() {
            this.rowCollectionBinder.bind(this.model.getOrchestra().getTimeUnitCollection(), this.el);
            return this;
        }, 
        events: {
            'mousedown': '_calcCoords',
            'mouseup': '_onMouseUp'
        },
        close: function() {
            this.rowCollectionBinder.unbind();
            this.$el.empty();
            this.unbind();
        }
        
    });
    
    /**
     * Component view. Reponsible for grid left bar
     * Expected model: Controller
     */
    var GridLeftBar = Backbone.View.extend({
        el: '#part-left-lower',
        collectionTemplate: SYNTH.templateCache['template-beat-time'],
        collectionBinder: null,
        
        initialize: function() {
            
            var converter = function(direction, value) {
                return value + 1;
            };
            
            var bindings = {
                'id': [
                    {
                        selector: '.time',
                        converter: converter
                    },
                    {
                        selector: '.time',
                        elAttribute: 'data-time'
                    }
               ],
               'isSelected': {
                   selector: '.time',
                   elAttribute: 'data-isselected'
               }
            };
            
            this.collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this.collectionTemplate, bindings)
            );
            
            this.render();
        },
        render: function() {
            this.collectionBinder.bind(this.model.getOrchestra().getTimeUnitCollection(), this.el);
            return this;
        },
        close: function() {
            this.collectionBinder.unbind();
            this.$el.empty();
            this.unbind();
        },
        
        // event handlers
        events: {
            'mousedown .time': '_onMouseDownTime',
            'mousedown div': '_preventDefault',
            'mouseup': '_onMouseUp',
        },
        _onMouseDownTime: function(event) {
            var time = parseInt($(event.currentTarget).attr('data-time'));
            var isSelected = $('#part-left-lower .time[data-time="' + time + '"]').attr('data-isselected');
            if(SYNTH.app) {
                if(isSelected === 'true') {
                    SYNTH.app.controller.getOrchestra().setTimeUnitSelection(time, false);
                    this._delegateMouseOverTime(true);
                } else {
                    SYNTH.app.controller.getOrchestra().setTimeUnitSelection(time, true);
                    this._delegateMouseOverTime(false);
                }
            }
            event.preventDefault();
        },
        _delegateMouseOverTime: function(bool) {
            var self = this;
            if(bool) {
                this.$el.delegate('.time', 'mouseover', function(event) {
                    self._deSelectOnMouseOverBeat(event);
                });
            } else {
                this.$el.delegate('.time', 'mouseover', function(event) {
                    self._selectOnMouseOverBeat(event);
                });
            }
        },
        _selectOnMouseOverBeat: function(event) {
            if(SYNTH.app) {
                SYNTH.app.controller.getOrchestra().setTimeUnitSelection(parseInt($(event.currentTarget).html()) - 1, true);
            }
        },
        _deSelectOnMouseOverBeat: function(event) {
            if(SYNTH.app) {
                SYNTH.app.controller.getOrchestra().setTimeUnitSelection(parseInt($(event.currentTarget).html()) - 1, false);
            }
            
        },
        _onMouseUp: function(event) {
            this.$el.undelegate('.time', 'mouseover');
        },
        _preventDefault: function(event) {
            event.preventDefault();
        }
    });
    
    //TODO bind to active instrument
    /**
     * Component view. Responsible for grid top bar
     * Expected model: Controller
     */
    var GridTopBar = Backbone.View.extend({
        el: '#part-top',
        initialize: function() {
            function initializeKeyboard() {
                var i;
                var div;
                var str;
                for(i = 0; i < 88; i++) {
                    str = SYNTH.TONES[i];
                    div = $('<div></div>').attr({'data-pitch': i});
                    if(str.length > 2) {
                        div.append($('<div>' + str.substr(0, 2)+ '</div>'));
                        div.append($('<div>&nbsp;</div>'));
                        div.addClass('black-key');
                    } else {
                        div.append($('<div>&nbsp;</div>'));
                        div.append($('<div>' + str.charAt(0)+ '</div>'));
                    }
                    div.append($('<div class="num">' + str.charAt(str.length - 1) + '</div>'));
                    this.$el.append(div);
                }
            }
            
            initializeKeyboard.apply(this);
            
            this.render();
        },
        render: function() {
            
            return this;
        },
        
        // event handlers
        events: {
            'mousedown #part-top .key': '_onMouseDownKey'
        },
        _onMouseDownKey: function(event) {
            console.log('mousedown on key');
        }
    });
    
    /**
     * Composite view for the synthesizer grid
     * Expected model: Controller
     */
    var GridView = Backbone.View.extend({
        el: '#site-content-wrapper',
        eventLayerEl: '#grid-event-capture-layer',
        uiHelperEl: '#grid-ui-helper',
        model: null,
        template: null, // has no template
        
        // sub-views
        _gridInstrumentView: null,
        _gridEventCaptureView: null,
        _gridLeftBar: null,
        _gridTopBar: null,
        _pitchCollectionViews: {},
        
        initialize: function() {
            this._gridInstrumentView = new GridInstrumentView({model: this.model});
            this._gridEventCaptureView = new GridEventCaptureView({model: this.model});
            this._gridLeftBar = new GridLeftBar({model: this.model});
            this._gridTopBar = new GridTopBar({model: this.model});
        },
        // this view does not render
        close: function() {
            this._gridInstrumentView.close();
            this._gridEventCaptureView.close();
            this._gridLeftBar.close();
            this._gridTopBar.close();
            for(var prop in this._pitchViews) {
                if(this._pitchViews.hasOwnProperty(prop)) {
                    this.closeBeatViews(instrumentId);
                }
            }
            this.$el.empty();
            this.unbind();
        },
        
        events: {
            'mousedown #grid-event-capture-layer': '_onGridClick'
        },
        // event handlers
        _onGridClick: function(event) {
            event.preventDefault();
            // Grab the coordinates clicked on, deduce the time and pitch
            var self = this;
            var time;
            var pitchId;
            var orchestra;
            var activeInstrument;
            var activeInstrumentId;
            var pitch;
            var isPitchAvailable;
            
            var latestWindow;
            var note;
            var noteStartTime;
            var noteValue;
            if(event.offsetY) { pitchId = Math.floor(event.originalEvent.offsetX / 20); } // Chrome / Opera
            else { pitchId = Math.floor(event.originalEvent.layerX / 20); } // Firefox
            time = parseInt(event.target.getAttribute('data-time'));
                        
            orchestra = this.model.getOrchestra();
            activeInstrument = orchestra.getActiveInstrument();
            activeInstrumentId = activeInstrument.getId();
            pitch = activeInstrument.getPitch(pitchId);
            isPitchAvailable = pitch.isTimeAvailable(time);
            
            // if clicked slot is open for new note,
            if(isPitchAvailable) {            
                latestWindow = pitch.getLatestWindow(time);
                this._initUIHelperForNewNote(activeInstrumentId, pitchId, time);
                this.$el.delegate(this.eventLayerEl, 'mousemove', function(event) {
                    self._previewNewNoteValue(event, activeInstrumentId, pitchId, time, latestWindow);
                });
                this.$el.delegate(this.eventLayerEl, 'mouseup', function(event) {
                    self._onMouseUpFinalizeNewNote(event, activeInstrumentId, pitchId, time);
                });
            // otherwise
            } else {
                
                if(pitch.isNoteStart(time)) {
                    // If user clicked on start of note, delete it if they mouseup on same spot
                    note = pitch.getNoteCollection().get(time);
                    if(note && note.getValue() !== 1) {
                        noteValue = note.getValue();
                        this.$el.delegate(this.eventLayerEl, 'mouseup', function(event) {
                            self._onMouseUpSameSpotRemoveNote(event, activeInstrumentId, pitchId, time, noteValue);
                        });     
                    }
                }
                
                if (pitch.isNoteEnd(time)) {
                    // if it's tail end of note, let users change how long it is
                    
                    note = pitch.getOccupyingNote(time);
                    noteStartTime = note.getTime();
                    noteValue = note.getValue();
                    latestWindow = pitch.getLatestWindow(time);                
                    
                    this._initUIHelperForExistingNote(activeInstrumentId, pitchId, time, noteStartTime, noteValue);
                    this.$el.delegate(this.eventLayerEl, 'mousemove', function(event) {
                        self._previewExistingNoteValue(event, activeInstrumentId, pitchId, time, noteStartTime, noteValue, latestWindow);
                    });
                    this.$el.delegate(this.eventLayerEl, 'mouseup', function(event) {
                        self._onMouseUpFinalizeExistingNote(event, activeInstrumentId, pitchId, noteStartTime, noteValue);
                    });
                    
                }
                
                
            }
            // else do nothing
        },
        
        // new note
        _initUIHelperForNewNote: function(activeInstrumentId, pitchId, time, noteStartTime, noteValue) {
            $(this.uiHelperEl).css({
                'left': (pitchId * 20).toString() + 'px',
                'top': (time * 20).toString() + 'px',
                'width': '20px',
                'height': '20px',
                'background-color': '#aaa'
            });
            $(this.uiHelperEl).attr({
                'data-value': 1
            });
        },
        _previewNewNoteValue: function(event, activeInstrumentId, pitchId, time, latestWindow) {
            
            var newTime = parseInt(event.target.getAttribute('data-time'));
            $(this.uiHelperEl).css({
                'height': Math.min((latestWindow - time + 1) * 20, (Math.max(20, (newTime - time + 1) * 20))).toString() + 'px'
            });
            $(this.uiHelperEl).attr({
                'data-value': Math.min(latestWindow - time + 1, Math.max(1, (newTime - time + 1)))
            });
        },
        _onMouseUpFinalizeNewNote: function(event, activeInstrumentId, pitchId, startTime) {
            
            var uiHelperEl = $(this.uiHelperEl);
            var value = parseInt(uiHelperEl.attr('data-value'));
            
            if(SYNTH.app) {
                SYNTH.app.controller.invoke_addNote(activeInstrumentId, pitchId, startTime, value);
            }
            this._resetUIHelperEl();
            this.$el.undelegate(this.eventLayerEl, 'mousemove');
            this.$el.undelegate(this.eventLayerEl, 'mouseup');
        },
        
        // delete note
        _onMouseUpSameSpotRemoveNote: function(event, activeInstrumentId, pitchId, time, value) {
            
            // mouse coordinates when the event mouseup is fired. Only delete note
            // if mouseup is fired on the same spot as note head
            var newPitchId;
            var newTime;
            
            if(event.offsetY) { newPitchId = Math.floor(event.originalEvent.offsetX / 20); } // Chrome / Opera
            else { newPitchId = Math.floor(event.originalEvent.layerX / 20); } // Firefox
            newTime = parseInt(event.target.getAttribute('data-time'));
            
            if(newPitchId === pitchId && newTime === time && SYNTH.app) {
                SYNTH.app.controller.invoke_removeNote(activeInstrumentId, pitchId, time, value);
            }
            
            this.$el.undelegate(this.eventLayerEl, 'mouseup');
        },
        
        // change existing note
        _initUIHelperForExistingNote: function(activeInstrumentId, pitchId, time, noteStartTime, value) {
            $(this.uiHelperEl).css({
                'left': (pitchId * 20).toString() + 'px',
                'top': (time * 20).toString() + 'px',
                'width': '20px',
                'height': '20px',
                'background-color': '#aaa'
            });
            $(this.uiHelperEl).attr({
                'data-value': value - 1
            });
        },
        _previewExistingNoteValue: function(event, activeInstrumentId, pitchId, time, noteStartTime, value, latestWindow) {
            var newTime = parseInt(event.target.getAttribute('data-time'));
            if(newTime === time) {
                $(this.uiHelperEl).css({
                    'top': (time * 20).toString() + 'px',
                    'height':'20px'
                });
                $(this.uiHelperEl).attr({
                    'data-value': value + newTime - time - 1
                });
            } else if(newTime > time) {
                // if mouse released further down, it will add duration to the note
                $(this.uiHelperEl).css({
                    'top': (time * 20).toString() + 'px',
                    'height': Math.min((latestWindow - time + 1) * 20, (Math.max(1, (newTime - time + 1)) * 20)).toString() + 'px'
                });
                $(this.uiHelperEl).attr({
                    'data-value': Math.min(latestWindow - noteStartTime + 1, Math.max(1, value + newTime - time))
                });
            } else {
                $(this.uiHelperEl).css({
                    'top': (Math.max(noteStartTime, newTime) * 20).toString() + 'px',
                    'height': (Math.min(value * 20, Math.max(20, (time - newTime + 1) * 20))).toString() + 'px'
                });
                $(this.uiHelperEl).attr({
                    'data-value': Math.max(0, value + newTime - time - 1)    // value can go down to zero. If zero, delete note
                });
            }
        },
        _onMouseUpFinalizeExistingNote: function(event, activeInstrumentId, pitchId, noteStartTime, oldValue) {
            var uiHelperEl = $(this.uiHelperEl);
            
            var newValue = parseInt(uiHelperEl.attr('data-value'));
            
            if(SYNTH.app) {
                if(newValue === 0) {
                    SYNTH.app.controller.invoke_removeNote(activeInstrumentId, pitchId, noteStartTime, oldValue);
                } else {
                    SYNTH.app.controller.invoke_editNoteValue(activeInstrumentId, pitchId, noteStartTime, oldValue, newValue);
                }
            }
            this._resetUIHelperEl();
            this.$el.undelegate(this.eventLayerEl, 'mousemove');
            this.$el.undelegate(this.eventLayerEl, 'mouseup');
        },
        _resetUIHelperEl: function() {
            $(this.uiHelperEl).css({
                'height': '0px',
                'width': '0px'
            });
        },
        
        // methods
        addPitchCollectionView: function(instrumentId) {
            var instrument;
            this._pitchCollectionViews[instrumentId] = {};
            instrument = this.model.getOrchestra().getInstrumentById(instrumentId);
            this._pitchCollectionViews[instrumentId]['pitchview'] = new GridPitchCollectionView({model: instrument});
            
            var i;
            this._pitchCollectionViews[instrumentId]['noteViews'] = [];
            for(i = 0; i < 88; i++) {
                this._pitchCollectionViews[instrumentId]['noteViews'].push(
                        new GridNoteCollectionView({model: instrument.getPitchCollection().get(i)}));
            }
            
        },
        closePitchCollectionView: function(instrumentId) {
            this._pitchCollectionViews[instrumentId]['pitchview'].close();
            var i;
            for(i = 0; i < 88; i++) {
                this._pitchCollectionViews[instrumentId]['noteViews'][i].close();
            }
        }
        
    });
    
    // Control panels views ------------------------
    
    //TODO
    var PlayerControlPanelView = Backbone.View.extend({
        el: '#player-controls',
        model: null,
        template: SYNTH.templateCache['template-playback-panel'],
        modelBinder: null,
        orchestraModelBinder: null,
        initialize: function() {
            this.$el.html(this.template);
            this.modelBinder = new Backbone.ModelBinder();
            this.orchestraModelBinder = new Backbone.ModelBinder();
            this.render();
        },
        render: function() {
            
            function boolToActiveClassConverter(direction, value) {
                if(value) {
                    return 'active';
                }
                return '';
            }
            
            function boolToPlayButtonConverter(direction, value) {
                if(value) {
                    return 'glyphicon glyphicon-pause';
                }
                return 'glyphicon glyphicon-play';
            }
            
            function inputBarConverter(direction, value) {
                if(direction === 'ViewToModel') {
                    return parseInt(value) - 1;
                } else {
                    return value + 1;
                }
                
            };
            
            var bindings = {
                'isLooping': {
                    selector: '#button-loop',
                    elAttribute: 'class',
                    converter: boolToActiveClassConverter
                },
                'isPlaying': {
                    selector: '#button-play-pause',
                    elAttribute: 'class',
                    converter: boolToPlayButtonConverter
                },
                'currentTime': [
                    {
                        selector: '#input-playback-bar',
                        converter: inputBarConverter
                    },
                    {
                        selector: '[data-attr="current-time"]',
                        converter: inputBarConverter
                    }
                ]
            };
            
            var orchestraBindings = {
                'scoreLength':[
                   {
                       selector: '#score-length'
                   },
                   {
                       selector: '#input-playback-bar',
                       elAttribute: 'max'
                   }
                ]
            };
            
            this.modelBinder.bind(this.model.getPlayer(), this.el, bindings);
            this.orchestraModelBinder.bind(this.model.getOrchestra(), this.el, orchestraBindings);
            
            return this;
        },
        close: function() {
            this.$el.empty();
            this.modelBinder.unbind();
            this.orchestraModelBinder.unbind();
        },
        events: {
            'click #button-play-pause': '_togglePlayPause',
            'click #button-to-beginning': '_rewindToBeginning',
            'click #button-to-end': '_forwardToEnd',
            'click #button-loop': '_toggleIsLooping'
        },
        _togglePlayPause: function() {
            if(SYNTH.app) {
                SYNTH.app.controller.getPlayer().togglePlayPause();
            }
        },
        _rewindToBeginning: function() {
            this.model.getPlayer().rewindToStart();
        },
        _forwardToEnd: function() {
            this.model.getPlayer().forwardToEnd();
        },
        _toggleIsLooping: function() {
            if(SYNTH.app) {
                SYNTH.app.controller.getPlayer().toggleIsLooping();
            }
        }
    });
    
    var InstrumentView = Backbone.View.extend({
        el: SYNTH.templateCache['template-instrument-panel'],
        selectEl: '',
        initialize: function() {
            //this.selectEl = '#instrument-list .instrument-panel[data-id="' + this.model.getId() + '"] select';
            this.selectEl = this.$el.find('select');
            this.modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        render: function() {
            
            function boolToButtonConverter(direction, value) {
                if(value) { return 'btn-primary'; }
                return 'btn-default';
            }
            
            function hexToStyleConverter(direction, value) {
                return 'background-color:' + value + ';';
            }
            
            function boolToMuteButtonConverter(direction, value) {
                if(value) { return 'btn-warning glyphicon glyphicon-volume-off'; }
                return 'btn-default glyphicon glyphicon-volume-up';
            }
            
            function strToIntConverter(direction, value) {
                if(direction === 'ViewToModel') {
                    return parseInt(value);
                }
                return value;
            }
                        
            var bindings = {
                'name': {
                    selector: '[data-binding="name"]'
                },
                'id': {
                    selector: '.instrument-panel',
                    elAttribute: 'data-id'
                },
                'volume': [
                    {
                        selector: '[data-binding="volume"]',
                    },
                    {
                        selector: '[data-binding="volume-val"]'
                    }
                ],
                'isSustainOn': {
                    selector: '[data-binding="sustain-on-off"]'
                },
                'sustainDuration': {
                    selector: '[data-binding="sustain-duration"]'
                },
                'isSelected': {
                    selector: '.instrument-panel',
                    elAttribute: 'class',
                    converter: boolToButtonConverter
                },
                'isMuted': {
                    selector: '[data-binding="is-muted"]',
                    elAttribute: 'class',
                    converter: boolToMuteButtonConverter
                },
                'displayedColor': [
                    {
                        selector: 'input[type="color"]'
                    },
                    {
                        selector: '.color-picker-facade',
                        elAttribute: 'style',
                        converter: hexToStyleConverter
                    }
                ],
                'soundFontId': {
                    selector: 'select',
                    converter: strToIntConverter
                }
            };
            this._renderSelect();
            this.modelBinder.bind(this.model, this.el, bindings);
            this._renderSustainInputBox();
            
            return this;
        },
        _renderSelect: function() {
            var soundFontLibrary = this.model.getOrchestra().getSoundFontLibrary();
            
            var option;
            var soundFont;
            var category = null;
            
            var optGroups = {};
            
            $(this.selectEl).html('');
            for(var soundFontId in MIDI.GeneralMIDI.byId) {
                
                soundFont = soundFontLibrary.getSoundFontByNumber(soundFontId);
                option = $('<option></option>').html(soundFont.instrument);
                option.attr({'value': soundFontId});
                category = soundFont.category;
                if(! optGroups.hasOwnProperty(category)) {
                    optGroups[category] = $('<optgroup></optgroup>').attr({'label': category});
                }
                optGroups[category].append(option);
            }
            
            for(category in optGroups) {
                if(optGroups.hasOwnProperty(category)) {
                    this.selectEl.append(optGroups[category]);
                }
            }
            
            return this;
        },
        _renderSustainInputBox: function() {
            var isDisabled = this.model.getIsSustainOn();
            $(this.el).find('[data-binding="sustain-duration"]').attr('disabled', ! isDisabled);
        },
        close: function() {
            this.modelBinder.unbind();
            this.off();
            this.undelegateEvents();
            this.remove();
        },
        
        //events 
        events: {
            'click .instrument-select': '_loadSoundFont',
            'click [data-binding="sustain-on-off"]': 'render',
            'click .instrument-panel': '_setAsActiveInstrument',
            'click [data-binding="is-muted"]': '_muteInstrument',
            'click .color-picker-facade': '_clickColorPicker',
            'click input[type="color"]': '_stopPropagation'
        },
        _loadSoundFont: function(event) {
            var instrumentId = parseInt($(event.currentTarget).parents('.instrument-panel').attr('data-id'));
            if(SYNTH.app) {
                var player = SYNTH.app.controller.getPlayer();
                var soundFontId = SYNTH.app.controller.getOrchestra().getInstrumentById(instrumentId).getSoundFontId();
                if(! player.getIsSoundFontLoadingOrLoaded(soundFontId)) {
                    player.loadSoundFont(soundFontId);
                }
            }
            
        },
        _clickColorPicker: function(event) {
            $(event.currentTarget).find('input[type="color"]').click();
        },
        _muteInstrument: function(event) {
            var instrumentId = parseInt($(event.currentTarget).parents('.instrument-panel').attr('data-id'));
            if(SYNTH.app) {
                SYNTH.app.controller.getOrchestra().getInstrumentById(instrumentId).toggleIsMuted();
            }
        },
        _setAsActiveInstrument: function(event) {
            var instrumentId = parseInt(event.currentTarget.getAttribute('data-id'));
            this.model.getOrchestra().setNewActiveInstrument(instrumentId);
        },
        _stopPropagation: function(event) {
            event.stopPropagation(event);
        }
    });
    
    var InstrumentControlPanelView = Backbone.View.extend({
        el: '#instrument-controls',
        addInstrumentEl: '#add-instrument-controls',
        instrumentListEl: '#instrument-list',
        model: null,
        template: SYNTH.templateCache['template-add-instrument-panel'],
        collectionTemplate: SYNTH.templateCache['template-instrument-panel'],
        instrumentCollectionBinder: null,
        initialize: function() {
                        
            function viewCreator(model) {
                return new InstrumentView({model: model});
            }
            
            $(this.addInstrumentEl).html(this.template);
            this.collectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ViewManagerFactory(viewCreator)
                    );
            
            this.render();
        },
        render: function() {
            this.collectionBinder.bind(this.model.getOrchestra().getInstrumentCollection(), $(this.instrumentListEl));
            return this;
        },
        close: function() {
            this.$el.empty();
            this.collectionBinder.unbind();
            this.unbind();
        },
        
        //event handlers
        events: {
            'click #button-add-instrument': '_addDefaultInstrument',
            'click #button-remove-selected-instrument': '_removeSelectedInstrument'
        },
        _addDefaultInstrument: function(event) {
            this.model.invoke_addDefaultInstrument();
        },
        _removeSelectedInstrument: function(event) {
            this.model.invoke_removeSelectedInstrument();
        }
    });
    
    var EditControlPanelView = Backbone.View.extend({
        el: '#edit-controls',
        undoButton: '#button-undo',
        redoButton: '#button-redo',
        model: null,
        invokerModelBinder: null,
        template: SYNTH.templateCache['template-edit-panel'],
        initialize: function() {
            this.$el.html(this.template);
            this.invokerModelBinder = new Backbone.ModelBinder();
            this.listenTo(this.model.getInvoker(), 'change:undoStack', this.renderUndo);
            this.listenTo(this.model.getInvoker(), 'change:redoStack', this.renderRedo); 
            this.render();
        },
        render: function() {
            
            function buttonConverter(direction, value) {
                if(value.length === 0) {
                    return true;
                }
                return false;
            };
            
            this.invokerModelBinder.bind(this.model.getInvoker(), this.el, {
                undoStack: {
                    selector: '#button-undo',
                    elAttribute: 'disabled',
                    converter: buttonConverter
                },
                redoStack: {
                    selector: '#button-redo',
                    elAttribute: 'disabled',
                    converter: buttonConverter
                }
            });
        },
        renderUndo: function() {
            var isDisabled = (this.model.getInvoker().get('undoStack').length === 0 ? true : false);
            $(this.undoButton).attr('disabled', isDisabled);
        },
        
        renderRedo: function() {
            var isDisabled = (this.model.getInvoker().get('redoStack').length === 0 ? true : false);
            $(this.redoButton).attr('disabled', isDisabled);
        },
        close: function() {
            this.$el.empty();
            this.invokerModelBinder.unbind();
            this.unbind();
        },
        events: {
            'click #button-undo': '_undo',
            'click #button-redo': '_redo',
            'change:undoStack': 'render',
            'change:redoStack': 'render'
        },
        
        // event handlers
        _undo: function() {
            this.model.invoke_undo();
        },
        _redo: function() {
            this.model.invoke_redo();
        }
    });
    
    var ViewControllerView = Backbone.View.extend({
        el: '#body',
        menuModelBinder: null,
        editPanelModelBinder: null,
        viewPanelModelBinder: null,
        initialize: function() {
            this.menuModelBinder = new Backbone.ModelBinder();
            this.editPanelModelBinder = new Backbone.ModelBinder();
            this.viewPanelModelBinder = new Backbone.ModelBinder();
            this.render();
        },
        render: function() {
            
            function boolToClassConverter(direction, value) {
                if(value === true) {
                    return 'active';
                }
                return '';
            }
            
            function boolToStyleConverter(direction, value) {
                if(value === true) {
                    return 'display: block;';
                }
                return 'display: none;';
            }
            
            var menuBindings = {
                'isEditPanelVisible': {
                    selector: '#button-toggle-edit-panel',
                    elAttribute: 'class',
                    converter: boolToClassConverter
                },
                'isViewPanelVisible': {
                    selector: '#button-toggle-view-panel',
                    elAttribute: 'class',
                    converter: boolToClassConverter
                }
            };
            
            var editPanelBindings = {
                'isEditPanelVisible': {
                    selector: '#edit-controls',
                    elAttribute: 'style',
                    converter: boolToStyleConverter
                }
            };
            
            this.menuModelBinder.bind(this.model.getViewController(), $('#view-panel-controls'), menuBindings);
            this.editPanelModelBinder.bind(this.model.getViewController(), $('#upper-controls'), editPanelBindings);
        },
        // this view should never be closed
        close: function() {
            
        },
        
        events: {
            'click #button-toggle-edit-panel': '_toggleEditPanel',
            'click #button-toggle-view-panel': '_toggleViewPanel'
        },
        _toggleEditPanel: function() {
            this.model.getViewController().toggleEditPanelVisibility();
        },
        _toggleViewPanel: function() {
            this.model.getViewController().toggleViewPanelVisibility();
        }
    });
    
    /**
     * Composite view. Top level view for the synthesizer component
     * Expected model: Controller
     */
    var TopLevelView = Backbone.View.extend({
        el: '#body',
        model: null,
        template: SYNTH.templateCache['template-base'],
        // sub-views
        _editControlPanelView: null,
        _playerControlPanelView: null,
        _instrumentControlPanelView: null,
        _viewControllerView: null,
        _gridView: null,
        // methods
        initialize: function() {
            this.$el.html(this.template);
            
            this._editControlPanelView = new EditControlPanelView({model: this.model});
            this._playerControlPanelView = new PlayerControlPanelView({model: this.model});
            this._instrumentControlPanelView = new InstrumentControlPanelView({model: this.model});
            this._gridView = new GridView({model: this.model});
            this._viewControllerView = new ViewControllerView({model: this.model});
        },
        close: function() {
            this._editControlPanelView.close();
            this._playerControlPanelView.close();
            this._instrumentControlPanelView.close();
            this._gridView.close();
            this._viewControllerView.close();
            this.$el.empty();
            this.unbind();
        },
        
        // View getters and setters - expose only what's necessary
        getGridView: function() {
            var gridView = this._gridView;
            return gridView;
        }
    });
    
    // Expose api ---------------------------------------
    return {
        // constants
        TONES: SYNTH.TONES,
        FREQS: SYNTH.FREQS,
        soundfontUrl: SYNTH.soundfontUrl,
        // models
        Command: Command,
        Invoker: Invoker,
        Note: Note,
        Notes: Notes,
        Pitch: Pitch,
        Pitches: Pitches,
        SoundGenerator: SoundGenerator,
        Instrument: Instrument,
        Instruments: Instruments,
        Orchestra: Orchestra,
        Player: Player,
        Controller: Controller,
        
        // views
        TopLevelView: TopLevelView
    };
});
SYNTH.prototype = {};
SYNTH = SYNTH(jQuery, _, Backbone, MUSIC, Note, Interval, MIDI);


// ================================================================================
// Those are the classes - now we initialize the UI and the application
// ================================================================================
SYNTH.app = {
    controller: undefined,
    topView: undefined
};

// Op | Document.ready --------------------------------------------------------------------------------
$(document).ready(function() {
    
    /*
    MIDI.loadPlugin({
        soundfontUrl: "../soundfont/",
        instrument: "acoustic_grand_piano",
        callback: function() {
            var delay = 0; // play one note every quarter second
            var note = 50; // the MIDI note
            var velocity = 127; // how hard the note hits
            // play the note
            MIDI.setVolume(0, 127);
            MIDI.noteOn(0, note, velocity, delay);
            MIDI.noteOff(0, note, delay + 0.75);
        }
    });
    */
    
    /*
     MIDI.loadPlugin({
         soundfontUrl: "../soundfont/",
         instruments: [ "acoustic_grand_piano", "celesta"],
         callback: function() {
             
             MIDI.programChange(0, 0);
             MIDI.programChange(1, 8);
             for (var n = 0; n < 100; n ++) {
                 var delay = n / 4; // play one note every quarter second
                 var note = MIDI.pianoKeyOffset + n; // the MIDI note
                 var velocity = 127; // how hard the note hits
                 // play the note
                 //MIDI.noteOn(0, note, velocity, n / 3);
                 //MIDI.chordOn(0, [MIDI.pianoKeyOffset + n, MIDI.pianoKeyOffset + n + 5], 127, n/3);
                 //MIDI.noteOff(0, MIDI.pianoKeyOffset + n, n/3 + 0.1);
                 // play the some note 3-steps up
                 MIDI.noteOn(1, note + 3, velocity, delay);
             }
             
         }
     });
     */
     
    //console.log(MIDI.noteToKey);
    
    
    
    // Establish | Variables ---------------------------------------------------------------------------
    SYNTH.app.domCache = {};
    
    // Op | Initialize models -----------------------------------------------------------------------------
    SYNTH.app.controller = new SYNTH.Controller();
    
    // Initialize top level views
    SYNTH.app.topView = new SYNTH.TopLevelView({model: SYNTH.app.controller});
    
    // Preconfigure orchestra
    SYNTH.app.controller.getOrchestra().addNewDefaultInstrument();
    
    // UI ops
    (function() {
        
        function resizeUI() {
            var windowHeight = $(window).height() - 100 - 25;    // 100px #site-top 25px #site-bottom
            var partHeight = windowHeight - 60; // 60px static top frequency row
            var instrumentControlHeight = windowHeight - 100 - 25 - 20 - 25;   // ditto above - 20px instrument .nav-menu -25px add instrument
            $('#site-main').attr({'style': 'height: ' + windowHeight + 'px;'});
            $('#grid').attr({'style': 'height: ' + partHeight + 'px;'});
            $('#instrument-list').attr({'style': 'height: ' + instrumentControlHeight + 'px;'});
        }
        
        resizeUI();
        $(window).resize(resizeUI);
        
        $('#instrument-list').sortable({
            scroll: false,
            axis: 'y',
        }); // jQueryUI
        
        $('#site-bottom').click(function() {
            $(this).toggleClass('expanded');
        });
    }());
    
    // Scroll syncing
    SYNTH.app.domCache.top = $('#part-top');
    SYNTH.app.domCache.left = $('#part-left');
    $('#grid').scroll(function() {
        SYNTH.app.domCache.top.attr({'style': 'left: ' + (- this.scrollLeft) + 'px'});
        SYNTH.app.domCache.left.attr({'style': 'top: ' + (- this.scrollTop + 160) + 'px'});
    });
    
});
