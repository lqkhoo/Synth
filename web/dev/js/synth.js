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
    
    // Establish | Template cache -------------------------------------------------------------------
    SYNTH.templateCache = {};
    
    // Declare | Template cacher function ------------------------------------------------------------
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
    
    // Op | Cache templates
    cacheTemplates(SYNTH.templateCache, 'templates/templates.html', '.template');
    
    // Declare | Frequency table generator function
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
    
    // Op | Generate frequency table
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
            'value': 1,
            'beat': null
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
        },
        getBeat: function() {
            var beat = this.get('beat');
            return beat;
        },
        setBeat: function(beat) {
            this.set('beat', beat);
            return beat;
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
            'isPlayableArray': null,
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
        getIsPlayableArray: function() {
            var array = this.get('isPlayableArray');
            return array;
        },
        setIsPlayableArray: function(array) {
            this.set('isPlayableArray', array);
            return array;
        },
        getNoteCollection: function() {
            var noteCollection = this.get('noteCollection');
            return noteCollection;
        },
        setNoteCollection: function(noteCollection) {
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
        //TODO
        setMaskValue: function(from, to, value) {
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
            var isPlayableArray;
            
            var i, j;
            for(i = 0; i < 88; i++) {
                notes = new Notes();
                isPlayableArray = [];
                for(j = 0; j < scoreLength; j++) {
                    isPlayableArray.push(true);
                }
                pitch = new Pitch({
                    'id': i,
                    'isPlayableArray': isPlayableArray,
                    'noteCollection': null,
                    'isPlayed': true,
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
            'isSelected': false
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
            return timeUnitCollection
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
            
            this.incrementNextInstrumentId();
            return instrument;
        },
        //TODO
        removeInstrument: function(instrumentId) {
            
        },
        /** Set new active instrument */
        setNewActiveInstrument: function(id) {
            if(this.get('activeInstrumentId') !== null) {
                this.getInstrumentById(this.getActiveInstrumentId()).setIsSelected(false);
            }
            this._setActiveInstrumentId(id);
            this.getInstrumentById(id).setIsSelected(true);
        },
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
        
        // methods
        invoke_undo: function() {
            this.getInvoker().undo();
        },
        
        invoke_redo: function() {
            this.getInvoker().redo();
        }
    });
    
    // Declare | Views -----------------------------------------------------------------------------------------
    
    /**
     * Abstract. For common methods used for handling several other subviews
     */
    var AbstractCompositeView = Backbone.View.extend({
        closeSubViews: function() {
            var i;
            if(this.subViews) {
                for(i = 0; i < this.subViews.length; i++) {
                    this.subViews[i].close();
                }
            }
        }
    });
    
    // Grid views --------------------------------
    /**
     * Component view. Displays underlying grid for each instument within grid view
     * Expected model: Controller
     */
    var GridInstrumentView = Backbone.View.extend({
        el: '#part-control-array',
        collectionTemplate: SYNTH.templateCache['template-part-control-array'],
        collectionBinder: null,
        initialize: function() {
            
            var converter = function(direction, value) {
                if(value) {
                    return 'selected';
                }
                return 'unselected';
            };
            
            var bindings = {
                'id': {
                    selector: '.part-control-block-inner',
                    elAttribute: 'data-id'
                },
                'isSelected': {
                    selector: '.part-control-block-inner',
                    elAttribute: 'class',
                    converter: converter
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
            this.rowCollectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ElManagerFactory(this.rowTemplate, {})
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
        },
        
        //event handlers
        //TODO
        _calcCoords: function() {
            
        },
        _selectOnMouseMove: function() {
            
        },
        _deSelectOnMouseMove: function() {
            
        },
        _onMouseUp: function() {
            
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
            this._collectionBinder.unbind();
        },
        
        //TODO event handlers
        
        // event handlers
        _onMouseDownTime: function(event) {
            var beat = $(event.currentTarget).attr('data-time');
            var isSelected = $('#part-controls .beat-control-block-inner[data-time="' + beat + '"]').attr('data-isselected');
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
    
    /**
     * Composite view for the synthesizer grid
     * Expected model: Controller
     */
    var GridView = AbstractCompositeView.extend({
        el: '#site-content-wrapper',
        model: null,
        template: null, // has no template
        subViews: [],
        initialize: function() {
            this.subViews.push(new GridInstrumentView({model: this.model}));
            this.subViews.push(new GridEventCaptureView({model: this.model}));
            this.subViews.push(new GridLeftBar({model: this.model}));
            this.subViews.push(new GridTopBar({model: this.model}));
        },
        // this view does not render
        close: function() {
            this.closeSubViews();
        }
    });
        
    // Control panels views ------------------------
    
    //TODO
    var PlayerControlPanelView = Backbone.View.extend({
        el: '#player-controls',
        model: null,
        template: SYNTH.templateCache['template-player-controls'],
        initialize: function() {
            this.$el.html(this.template);
        },
        close: function() {
            this.$el.empty();
        },
        events: {
            
        }
    });
    
    var InstrumentControlPanelView = Backbone.View.extend({
        el: '#instrument-list',
        model: null,
        collectionTemplate: SYNTH.templateCache['template-instrument-control-block'],
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
                        selector: '.instrument-control-block',
                        elAttribute: 'data-id'
                    }
                ],
                'volume': '[data-binding="volume"]',
                'isSelected': {
                    selector: '.instrument-control-block',
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
            this.collectionBinder.unbind();
        },
        
        //event handlers
        events: {
            'click .instrument-control-block': '_setAsActiveInstrument',
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
        model: null,
        invokerModelBinder: null,
        template: SYNTH.templateCache['template-edit-controls'],
        initialize: function() {
            this.$el.html(this.template);
            this.invokerModelBinder = new Backbone.ModelBinder();
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
        close: function() {
            this.invokerModelBinder.unbind();
            this.$el.empty();
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
    var TopLevelView = AbstractCompositeView.extend({
        el: '#body',
        model: null,
        template: SYNTH.templateCache['template-base'],
        subViews: [],
        initialize: function() {
            this.$el.html(this.template);
            
            this.subViews.push(new EditControlPanelView({model: this.model}));
            this.subViews.push(new PlayerControlPanelView({model: this.model}));
            this.subViews.push(new InstrumentControlPanelView({model: this.model}));
            this.subViews.push(new GridView({model: this.model})); 
            
        },
        close: function() {
            this.closeSubViews();
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
// That's the end of the lib - now we initialize the UI and the application
// We store the app within the SYNTH namespace to not use another global var
// ================================================================================
SYNTH.app = {};

// Op | Document.ready --------------------------------------------------------------------------------
$(document).ready(function() {
    
    
    MIDI.loadPlugin({
        soundfontUrl: "soundfont/",
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
    
    
    // Establish | Variables ---------------------------------------------------------------------------
    SYNTH.app.domCache = {};
    
    // Op | Initialize models -----------------------------------------------------------------------------
    SYNTH.app.controller = new SYNTH.Controller();
    
    // Initialize top level views
    SYNTH.app.topView = new SYNTH.TopLevelView({model: SYNTH.app.controller});
    
    // Preconfigure orchestra
    SYNTH.app.controller.getOrchestra().addNewInstrument('instrument1');
    SYNTH.app.controller.getOrchestra().addNewInstrument('instrument2');
    
    // UI ops
    (function() {
        
        function initializeKeyboard() {
            var left = $('#part-top');
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
                left.append(div);
            }
        }
        
        function resizeUI() {
            var windowHeight = $(window).height() - 100 - 25;    // 100px #site-top 25px #site-bottom
            var partHeight = windowHeight - 75; // 75px static top frequency row
            var instrumentControlHeight = windowHeight - 100 - 25 - 20;   // ditto above - 20px instrument .nav-menu 
            $('#site-main').attr({'style': 'height: ' + windowHeight + 'px;'});
            $('#part-controls').attr({'style': 'height: ' + partHeight + 'px;'});
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
    $('#part-controls').scroll(function() {
        SYNTH.app.domCache.top.attr({'style': 'left: ' + (- this.scrollLeft) + 'px'});
        SYNTH.app.domCache.left.attr({'style': 'top: ' + (- this.scrollTop + 175) + 'px'});
    });
    
});
