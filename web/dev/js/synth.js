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
    
    var Invoker = Backbone.Model.extend({
        defaults: {            
            'undoStack': [],
            'redoStack': []
        },
        _getUndoStack: function() {
            var undoStack = this.get('undoStack');
            return undoStack;
        },
        
        _getRedoStack: function() {
            var redoStack = this.get('redoStack');
            return redoStack;
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
            this.trigger('change:undoStack');
            this.trigger('change:redoStack');
        },
        undo: function() {
            var command = this._getUndoStack().pop();
            command.undo();
            this._getRedoStack().push(command);
            this.trigger('change:undoStack');
            this.trigger('change:redoStack');
        },
        redo: function() {
            var command = this._getRedoStack().pop();
            command.exec();
            this._getUndoStack().push(command);
            this.trigger('change:undoStack');
            this.trigger('change:redoStack');
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
            var id = this.get('id');
            return id;
        },
        setTime: function(newId) {
            this.set('id', newId);
            return newId;
        },
        getValue: function() {
            var value = this.get('value');
            return value;
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
            'instrumentId': null,
            'availabilityMask': null,
            'noteCollection': null,
            'isPlayed': true,
            'isSelected': false
        },
        
        // setters | getters
        getId: function() {
            var id = this.get('id');
            return id;
        },
        setId: function(newId) {
            this.set('id', newId);
            return newId;
        },
        getInstrumentId: function() {
            var instrument = this.get('instrumentId');
            return instrument;
        },
        setInstrumentId: function(instrumentId) {
            this.set('instrumentId', instrumentId);
            return instrumentId;
        },
        getAvailabilityMask: function() {
            var array = this.get('availabilityMask');
            return array;
        },
        _setAvailabilityMask: function(array) {
            this.set('availabilityMask', array);
            return array;
        },
        getNoteCollection: function() {
            var noteCollection = this.get('noteCollection');
            return noteCollection;
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
            var isPlayed = this.get('isPlayed');
            return isPlayed;
        },
        setIsPlayed: function(isPlayed) {
            this.set('isPlayed', isPlayed);
            return isPlayed;
        },
        getIsSelected: function() {
            var isSelected = this.get('isSelected');
            return isSelected;
        },
        setIsSelected: function(isSelected) {
            this.set('isSelected', isSelected);
            return isSelected;
        },
        
        // methods
        /**
         * Set availability mask values
         */ 
        setMaskValue: function(from, timeValue, boolValue) {
            var i;
            var mask = this.getAvailabilityMask();
            for(i = from; i < from + timeValue; i++) {
                mask[i] = boolValue;
            }
        },
        getNote: function(startTime) {
            return this.getNoteCollection().get(startTime);
        },
        /** Checks to see if this pitch can be played at the given time */
        checkAvailability: function(time) {
            return this.getAvailabilityMask()[time];
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
        collectionFromScratch: function(instrumentId, scoreLength) {
            
            var pitches = new Pitches();
            var pitch;
            var notes;
            var availabilityMask;
            
            var i, j;
            for(i = 0; i < 88; i++) {
                notes = new Notes();
                availabilityMask = [];
                for(j = 0; j < scoreLength; j++) {
                    availabilityMask.push(true);
                }
                pitch = new Pitch({
                    'id': i,
                    'availabilityMask': availabilityMask,
                    'noteCollection': notes,
                    'isPlayed': true,
                    'instrumentId': instrumentId,
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
            'name': '(unnamed)',
            'orchestra': null,
            'pitchCollection': null,
            'soundGenerator': null,
            'volume': 1,
            'isMuted': false,
            'isSelected': false,
            'displayedColor': 'rgb(238, 58, 115)'
        },
        
        getId: function() {
            var id = this.get('id');
            return id;
        },
        setId: function(newId) {
            this.set('id', newId);
            return newId;
        },
        getName: function() {
            var name = this.get('name');
            return name;
        },
        setName: function(newName) {
            this.set('name', newName);
            return newName;
        },
        getOrchestra: function() {
            var orchestra = this.get('orchestra');
            return orchestra;
        },
        setOrchestra: function(newOrchestra) {
            this.set('orchestra', newOrchestra);
            return newOrchestra;
        },
        getPitchCollection: function() {
            var pitchCollection = this.get('pitchCollection');
            return pitchCollection;
        },
        setPitchCollection: function(pitchCollection) {
            this.set('pitchCollection', pitchCollection);
            return pitchCollection;
        },
        getSoundGenerator: function() {
            var soundGenerator = this.get('soundGenerator');
            return soundGenerator;
        },
        setSoundGenerator: function(newSoundGenerator) {
            this.set('soundGenerator', newSoundGenerator);
            return newSoundGenerator;
        },
        getVolume: function() {
            var volume = this.get('volume');
            return volume;
        },
        setVolume: function(newVolume) {
            this.set('volume', newVolume);
            return newVolume;
        },
        getIsMuted: function() {
            var isMuted = this.get('isMuted');
            return isMuted;
        },
        setIsMuted: function(isMuted) {
            this.set('isMuted', isMuted);
            return isMuted;
        },
        getIsSelected: function() {
            var isSelected = this.get('isSelected');
            return isSelected; 
        },
        setIsSelected: function(isSelected) {
            this.set('isSelected', isSelected);
            return isSelected;
        },
        getDisplayedColor: function() {
            var colorString = this.get('displayedColor');
            return colorString;
        },
        setDisplayedColor: function(colorString) {
            this.set('displayedColor', colorString);
            return colorString;
        },
        
        getPitch: function(pitchId) {
            return this.getPitchCollection().get(pitchId);
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
        instrumentFromScratch: function(instrumentId, soundCode, instrumentName, scoreLength) {
            var instrument = new Instrument({
                'orchestra': this,
                'id': instrumentId,
                'name': instrumentName,
                'soundCode': soundCode
            });
            
            instrument.setPitchCollection(
                    pitchFactory.collectionFromScratch(instrumentId, scoreLength)
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
           var id = this.get('id');
           return id;
       },
       getIsSelected: function() {
           var isSelected = this.get('isSelected');
           return isSelected;
       }
    });
    
    /**
     * A collection of time units
     */
    var TimeUnits = Backbone.Collection.extend({
        model: TimeUnit
    });
    
    /**
     * The orchestra
     */
    var Orchestra = Backbone.Model.extend({
        defaults: {
            'controller': null,
            'player': null,
            'instrumentCollection': new Instruments(),
            'dummyInstrument': null,
            'nextInstrumentId': 0,
            'activeInstrumentId': null,
            'timeUnitCollection': null,
            'scoreLength': 24
        },
        initialize: function() {
            var instrument = instrumentFactory.instrumentFromScratch(
                    -1, 'dummy', 'dummy', this.getScoreLength());
            this._setDummyInstrument(instrument);
            
            var timeUnitCollection = new TimeUnits();
            var i;
            for(i = 0; i < this.getScoreLength(); i++) {
                timeUnitCollection.add(new TimeUnit({
                    'id': i,
                    'isSelected': false
                }));
            }
            this._setTimeUnitCollection(timeUnitCollection);
        },
        // getters | setters
        getController: function() {
            var controller = this.get('controller');
            return controller;
        },
        getPlayer: function() {
            var player = this.get('player');
            return player;
        },
        getInstrumentCollection: function() {
            var collection = this.get('instrumentCollection');
            return collection;
        },
        getInstruments: function() {
            var models = this.getInstrumentCollection().models;
            return models;
        },
        getDummyInstrument: function() {
            var dummy = this.get('dummyInstrument');
            return dummy;
        },
        _setDummyInstrument: function(instrument) {
            this.set('dummyInstrument', instrument);
            return instrument;
        },
        getNextInstrumentId: function() {
            var nextInstrumentId = this.get('nextInstrumentId');
            return nextInstrumentId;
        },
        incrementNextInstrumentId: function() {
            var nextId = this.getNextInstrumentId() + 1;
            this._setNextInstrumentId(nextId);
            return nextId;
        },
        _setNextInstrumentId: function(newId) {
            this.set('nextInstrumentId', newId);
            return newId;
        },
        getActiveInstrumentId: function() {
            var id = this.get('activeInstrumentId');
            return id;
        },
        _setActiveInstrumentId: function(id) {
            this.set('activeInstrumentId', id);
            return id;
        },
        getTimeUnitCollection: function() {
            var timeUnitCollection = this.get('timeUnitCollection');
            return timeUnitCollection;
        },
        _setTimeUnitCollection: function(timeUnitCollection) {
            this.set('timeUnitCollection', timeUnitCollection);
            return timeUnitCollection;
        },
        getScoreLength: function() {
            var scoreLength = this.get('scoreLength');
            return scoreLength;
        },
        _setScoreLength: function(newScoreLength) {
            this.set('scoreLength', newScoreLEngth);
            return newScoreLength;
        },
        
        // methods
        getPitch: function(instrumentId, pitchId) {
            return this.getInstrumentById(instrumentId).getPitchCollection().get(pitchId);
        },
        getInstrumentById: function(id) {
            var instrument = this.getInstrumentCollection().get(id);
            return instrument;
        },
        //TODO change soundCode to implemented sound model
        addNewInstrument: function(soundCode, instrumentName) {
            
            var nextInstrumentId = this.getNextInstrumentId();
            var scoreLength = this.getScoreLength();
            var initialCount = this.getInstrumentCollection().length;
            var instrument = instrumentFactory.instrumentFromScratch(
                    nextInstrumentId, soundCode, instrumentName, scoreLength);
            this.getInstrumentCollection().add(instrument);
            if(initialCount === 0) {
                this.setNewActiveInstrument(nextInstrumentId);
            }
            
            if(SYNTH.app.topView) {
                SYNTH.app.topView.getGridView().addPitchCollectionView(nextInstrumentId);
            }
            
            this.incrementNextInstrumentId();
            return instrument;
        },
        //TODO
        removeInstrument: function(instrumentId) {
            
        },
        getActiveInstrument: function() {
            return this.getInstrumentById(this.getActiveInstrumentId());
        },
        /** Set new active instrument */
        setNewActiveInstrument: function(id) {
            if(this.get('activeInstrumentId') !== null) {
                this.getInstrumentById(this.getActiveInstrumentId()).setIsSelected(false);
            }
            this._setActiveInstrumentId(id);
            this.getInstrumentById(id).setIsSelected(true);
        },
        addNote: function(instrumentId, pitchId, startTime, value) {
            var pitch = this.getPitch(instrumentId, pitchId);
            var note = pitch.getNoteCollection();
            note.add(new Note({'id': startTime, 'value': value}));
            pitch.setMaskValue(startTime, value, false);
        },
        removeNote: function(instrumentId, pitchId, startTime) {
            var pitch = this.getPitch(instrumentId, pitchId);
            var noteCollection = pitch.getNoteCollection();
            var note = noteCollection.get(startTime);
            var value;
            if(note) {
                noteCollection.remove(startTime);
                value = note.getValue();
                pitch.setMaskValue(startTime, value, true);
            }
        },
        
        setNoteValue: function(instrumentId, pitchId, startTime, newValue) {
            // be careful of this degenerate condition. This condition is checked for
            // within the Controller class so this shouldn't happen. It's not undo-safe
            if(newValue === 0) {
                this.removeNote(instrumentId, pitchId, startTime);
            }
            var pitch = this.getPitch(instrumentId, pitchId);
            var note = pitch.getNoteCollection().get(startTime);
            var oldValue = note.getValue();
            var availabilityMask = pitch.getAvailabilityMask();
            var i;
            note.setValue(newValue);
            if(newValue < oldValue) {
                for(i = startTime + oldValue; i >= startTime + newValue; i--) {
                    availabilityMask[i] = true; // make available the new space
                }
            } else {
                for(i = startTime + oldValue; i < startTime + newValue; i++) {
                    availabilityMask[i] = false;    // mark space as unavailable
                }
            }
        }
    });
    
    //TODO refactor orchestra into player
    /** Object responsible for playing the orchestra */
    var Player = Backbone.Model.extend({
        defaults: {
            'playSpeed': 300,   // in milliseconds per square
            'currentBeat': 0,
            'isPlaying': false,
            'isLooping': false,
            'orchestra': null,
            'controller': null
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
            'invoker': new Invoker(),
        },
        
        getOrchestra: function() {
            var orchestra = this.get('orchestra');
            return orchestra;
        },
        getInvoker: function() {
            var invoker = this.get('invoker');
            return invoker;
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
            this.el = '.g-instrument-inner[data-id="' + this.model.getInstrumentId() + '"] .g-pitch-in[data-pitch="' + this.model.getId() +  '"]';
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
               ]
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
        events: {
            'mousedown .time': '_onMouseDownTime',
            'mousedown #part-left > div': '_preventDefault',
            'mouseup': '_onMouseUp',
        },
        close: function() {
            this.collectionBinder.unbind();
            this.$el.empty();
            this.unbind();
        },
        
        //TODO event handlers
        
        // event handlers
        _onMouseDownTime: function(event) {
            var beat = $(event.currentTarget).attr('data-time');
            var isSelected = $('#grid .beat-control-block-inner[data-time="' + beat + '"]').attr('data-isselected');
            if(isSelected === 'true') {
                SYNTH.models.orchestra.setBeatSelection(parseInt(beat), false);
                this._delegateMouseOverTime(true);
            } else {
                SYNTH.models.orchestra.setBeatSelection(parseInt(beat), true);
                this._delegateMouseOverTime(false);
            }
            event.preventDefault();
        },
        _delegateMouseOverTime: function(bool) {
            if(bool) {
                this.$el.delegate('.time', 'mouseover', this._deSelectOnMouseOverBeat);
            } else {
                this.$el.delegate('.time', 'mouseover', this._selectOnMouseOverBeat);
            }
        },
        _selectOnMouseOverBeat: function(event) {
            SYNTH.models.orchestra.setBeatSelection(parseInt($(event.currentTarget).html()) - 1, true);
        },
        _deSelectOnMouseOverBeat: function(event) {
            SYNTH.models.orchestra.setBeatSelection(parseInt($(event.currentTarget).html()) - 1, false);
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
        
    });
    
    //TODO conditional method in add/remove instruments
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
            var availabilityMask;
            var note;
            var noteStartTime;
            var nextNoteStartTime;
            var noteValue;
            if(event.offsetY) { pitchId = Math.floor(event.originalEvent.offsetX / 20); } // Chrome / Opera
            else { pitchId = Math.floor(event.originalEvent.layerX / 20); } // Firefox
            time = parseInt(event.target.getAttribute('data-time'));
            
            // Grab the active instrument
            
            orchestra = this.model.getOrchestra();
            activeInstrument = orchestra.getActiveInstrument();
            activeInstrumentId = activeInstrument.getId();
            pitch = activeInstrument.getPitch(pitchId);
            isPitchAvailable = pitch.checkAvailability(time);
            availabilityMask = pitch.getAvailabilityMask();
            
            // if clicked slot is open for new note,
            if(isPitchAvailable) {
                this._initUIHelperForNewNote(activeInstrumentId, pitchId, time);
                this.$el.delegate(this.eventLayerEl, 'mousemove', function(event) {
                    self._previewNewNoteValue(event, activeInstrumentId, pitchId, time);
                });
                this.$el.delegate(this.eventLayerEl, 'mouseup', function(event) {
                    self._onMouseUpFinalizeNewNote(event, activeInstrumentId, pitchId, time);
                });
            // otherwise
            } else {
                // disable the delete behavior if we need to use the note top for other things
                note = pitch.getNoteCollection().get(time);
                if(note && note.getValue() !== 1) {
                    noteValue = note.getValue();
                    this.$el.delegate(this.eventLayerEl, 'mouseup', function(event) {
                        self._onMouseUpSameSpotRemoveNote(event, activeInstrumentId, pitchId, time, noteValue);
                    });
                } else {
                    
                    // if it's tail end of note, let users change how long it is
                    // Walk the availability mask backwards until we find an open spot
                    for(noteStartTime = time; noteStartTime > -1; noteStartTime--) {
                        if(availabilityMask[noteStartTime] === true) {
                            noteStartTime += 1; // That's the start time of the note occupying the clicked spot
                            break;
                        }
                    }
                    
                    note = pitch.getNoteCollection().get(noteStartTime);
                    noteValue = note.getValue();
                    
                    for(nextNoteStartTime = noteStartTime + noteValue; nextNoteStartTime < orchestra.getScoreLength(); nextNoteStartTime++) {
                        if(availabilityMask[nextNoteStartTime] === false) {
                            break;  // That's the start time of the next note (if any)
                        }
                    }
                    
                    // E.g. note starts on beat 5, duration of 5 -- tail end is on beat 9
                    if(noteStartTime + noteValue - 1 === time) {
                        
                        this._initUIHelperForExistingNote(activeInstrumentId, pitchId, time, noteStartTime, noteValue);
                        this.$el.delegate(this.eventLayerEl, 'mousemove', function(event) {
                            self._previewExistingNoteValue(event, activeInstrumentId, pitchId, time, noteStartTime, noteValue, nextNoteStartTime);
                        });
                        this.$el.delegate(this.eventLayerEl, 'mouseup', function(event) {
                            self._onMouseUpFinalizeExistingNote(event, activeInstrumentId, pitchId, noteStartTime, noteValue);
                        });
                    } 
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
        _previewNewNoteValue: function(event, activeInstrumentId, pitchId, time) {
            
            var newTime = parseInt(event.target.getAttribute('data-time'));
            $(this.uiHelperEl).css({
                'height': (Math.max(20, (newTime - time + 1) * 20)).toString() + 'px'
            });
            $(this.uiHelperEl).attr({
                'data-value': Math.max(1, (newTime - time + 1))
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
        _previewExistingNoteValue: function(event, activeInstrumentId, pitchId, time, noteStartTime, value, nextNoteStartTime) {
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
                    'height': Math.min((nextNoteStartTime - time) * 20, (Math.max(1, (newTime - time + 1)) * 20)).toString() + 'px'
                });
                $(this.uiHelperEl).attr({
                    'data-value': Math.min(nextNoteStartTime - noteStartTime, Math.max(1, value + newTime - time))
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
        initialize: function() {
            this.$el.html(this.template);
        },
        close: function() {
            this.$el.empty();
            this.unbind();
        },
        events: {
            
        }
    });
    
    var InstrumentControlPanelView = Backbone.View.extend({
        el: '#instrument-list',
        model: null,
        collectionTemplate: SYNTH.templateCache['template-instrument-panel'],
        instrumentCollectionBinder: null,
        initialize: function() {
            
            var converter = function(direction, value) {
                if(value) { return 'btn-primary'; }
                return 'btn-default';
            };
            
            var bindings = {
                'name': {
                    selector: '[data-binding="name"]'
                },
                'id': [
                    {
                        selector: '[data-binding="instrument-id"]'
                    },
                    {
                        selector: '.instrument-panel',
                        elAttribute: 'data-id'
                    }
                ],
                'volume': '[data-binding="volume"]',
                'isSelected': {
                    selector: '.instrument-panel',
                    elAttribute: 'class',
                    converter: converter
                }
            };
            
            this.collectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ElManagerFactory(this.collectionTemplate, bindings));
            this.render();
        },
        render: function() {
            this.collectionBinder.bind(this.model.getOrchestra().getInstrumentCollection(), this.el);
            return this;
        },
        close: function() {
            this.$el.empty();
            this.collectionBinder.unbind();
            this.unbind();
        },
        
        //event handlers
        events: {
            'click .instrument-panel': '_setAsActiveInstrument',
            'click *': '_stopPropagation'
        },
        _setAsActiveInstrument: function(event) {
            this.model.getOrchestra().setNewActiveInstrument(parseInt($(event.target).attr('data-id')));
        },
        _stopPropagation: function(event) {
            event.stopPropagation(event);
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
        _gridView: null,
        // methods
        initialize: function() {
            this.$el.html(this.template);
            
            this._editControlPanelView = new EditControlPanelView({model: this.model});
            this._playerControlPanelView = new PlayerControlPanelView({model: this.model});
            this._instrumentControlPanelView = new InstrumentControlPanelView({model: this.model});
            this._gridView = new GridView({model: this.model});
        },
        close: function() {
            this._editControlPanelView.close();
            this._playerControlPanelView.close();
            this._instrumentControlPanelView.close();
            this._gridView.close();
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
    
    
    // Establish | Variables ---------------------------------------------------------------------------
    SYNTH.app.domCache = {};
    
    // Op | Initialize models -----------------------------------------------------------------------------
    SYNTH.app.controller = new SYNTH.Controller();
    
    // Initialize top level views
    SYNTH.app.topView = new SYNTH.TopLevelView({model: SYNTH.app.controller});
    
    // Preconfigure orchestra
    SYNTH.app.controller.getOrchestra().addNewInstrument('instrument1');
    SYNTH.app.controller.getOrchestra().addNewInstrument('instrument2');
    //SYNTH.app.controller.getOrchestra().addNote(0, 1, 5, 5);
    //SYNTH.app.controller.getOrchestra().removeNote(0, 1, 1);
    
    // UI ops
    (function() {
        
        function initializeKeyboard() {
            var top = $('#part-top');
            var i;
            var div;
            var str;
            for(i = 0; i < 88; i++) {
                str = SYNTH.TONES[i];
                div = $('<div></div>');
                div.append($('<div><input type="checkbox" data-binding="' + i + '"></input></div>'));
                if(str.length > 2) {
                    div.append($('<div>' + str.substr(0, 2)+ '</div>'));
                    div.append($('<div>&nbsp;</div>'));
                    div.addClass('black-key');
                } else {
                    div.append($('<div>&nbsp;</div>'));
                    div.append($('<div>' + str.charAt(0)+ '</div>'));
                }
                div.append($('<div class="num">' + str.charAt(str.length - 1) + '</div>'));
                top.append(div);
            }
        }
        
        function resizeUI() {
            var windowHeight = $(window).height() - 100 - 25;    // 100px #site-top 25px #site-bottom
            var partHeight = windowHeight - 75; // 75px static top frequency row
            var instrumentControlHeight = windowHeight - 100 - 25 - 20;   // ditto above - 20px instrument .nav-menu 
            $('#site-main').attr({'style': 'height: ' + windowHeight + 'px;'});
            $('#grid').attr({'style': 'height: ' + partHeight + 'px;'});
            $('#instrument-controls').attr({'style': 'height: ' + instrumentControlHeight + 'px;'});
        }
        
        initializeKeyboard();
        resizeUI();
        $(window).resize(resizeUI);
        
        $('#site-bottom').click(function() {
            $(this).toggleClass('expanded');
        });
    }());
    
    // Scroll syncing
    SYNTH.app.domCache.top = $('#part-top');
    SYNTH.app.domCache.left = $('#part-left');
    $('#grid').scroll(function() {
        SYNTH.app.domCache.top.attr({'style': 'left: ' + (- this.scrollLeft) + 'px'});
        SYNTH.app.domCache.left.attr({'style': 'top: ' + (- this.scrollTop + 175) + 'px'});
    });
    
});
