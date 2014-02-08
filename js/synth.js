/**
 * @author Li Quan Khoo
 */

var SYNTH = (function($, Backbone, Timbre, MUSIC, MUSIC_Note, MUSIC_Interval) {
    "use strict";
    // Require --------------------------------------------------------------------------------------
    if(! $) { throw 'jQuery not available.'; }
    if(! Backbone) { throw 'Backbone.js not available.'; }
    if(! Timbre) { throw 'Timbre.js not available.'; }
    if(! MUSIC || ! MUSIC_Note || ! MUSIC_Interval) { throw 'MUSIC.js not available. '; }
    
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
    
    // Declare | Views -----------------------------------------------------------------------------------------
    
    var PlayerControlView = Backbone.View.extend({
        el: '#player-controls',
        _template: SYNTH.templateCache['template-player-controls'],
        _modelBinder: undefined,
        initialize: function() {
            this._modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        
        render: function() {
            var playButtonConverter = function(direction, value) {
                if(value) {
                    return 'glyphicon glyphicon-pause';
                } else {
                    return 'glyphicon glyphicon-play';
                }
            };
            
            var loopButtonConverter = function(direction, value) {
                if(value) {
                    return 'active';
                } else {
                    return '';
                }
            };
            
            var inputBarConverter = function(direction, value) {
                if(direction === 'ViewToModel') {
                    return parseInt(value) - 1;
                } else {
                    return value + 1;
                }
                
            };
            
            this.$el.html(this._template);
            var bindings = {
                'isPlaying': {
                    selector: '#button-play-pause',
                    elAttribute: "class",
                    converter: playButtonConverter
                },
                'currentBeat': [
                    {
                        selector: '[data-attr="beat"]',
                        converter: inputBarConverter
                    },
                    {
                        selector: '#input-playback-bar',
                        converter: inputBarConverter
                    }
                ],
                'scoreLength': [
                    {
                        selector: '#input-playback-bar',
                        elAttribute: 'max'
                    },
                    {
                        selector: '#score-length'
                    }
                ],
                'isLooping': {
                    selector: '#button-loop',
                    elAttribute: 'class',
                    converter: loopButtonConverter
                }
            };
            this._modelBinder.bind(this.model, this.el, bindings);
            return this;
        },
        
        close: function() {
            this._modelBinder.unbind();
            this.$el.empty();
        },
        
        events: {
            'click #button-play-pause': 'togglePlay',
            'click #button-to-beginning': 'rewindToStart',
            'click #button-to-end': 'forwardToEnd',
            'click #button-loop': 'toggleLoop'
        },
        
        togglePlay: function() {
            this.model.togglePlay();
        },
        
        rewindToStart: function() {
            this.model.rewindToStart();
        },
        
        forwardToEnd: function() {
            this.model.forwardToEnd();
        },
        
        toggleLoop: function() {
            this.model.toggleLoop();
        }
        
    });
    
    var InstrumentControlView = Backbone.View.extend({
        el: '#instrument-list',
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
                        selector: '[data-attr="instrument-id"]'
                        
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
            this._collectionBinder.bind(this.model.getInstrumentCollection(), this.el);
            return this;
        },
        
        events: {
            'click .instrument-control-block': 'setAsActiveInstrument',
            'click *': 'stopPropagation'
        },
        
        close: function() {
            this._modelBinder.unbind();
            this._collectionBinder.unbind();
        },
        
        setAsActiveInstrument: function(event) {
            this.model.setActiveInstrument(parseInt($(event.target).attr('data-id')));
        },
        
        stopPropagation: function(event) {
            event.stopPropagation();
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
                        selector: '.beat-control-block-inner',
                        elAttribute: 'data-time'
                    }
                ],
                'isSelected': {
                    selector: '.beat-control-block-inner',
                    elAttribute: 'data-isselected'
                }
            };            
            
            this._modelBinder = new Backbone.ModelBinder();
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, bindings)
            );
            this.render();
            
        },
        
        render: function() {
            this._collectionBinder.bind(this.model.getBeatsCollection(), this.el);
            return this;
        },
        
        close: function() {
            this._collectionBinder.unbind();
        }
        
    });
    
    var NoteControlView = Backbone.View.extend({
        el: '',
        _template: undefined,
        _componentTemplate: SYNTH.templateCache['template-dot'],
        _modelBinder: undefined,
        _collectionBinder: undefined,
        initialize: function() {
            
            var bindings = {
                'id': {
                    'selector': '.dot',
                    'elAttribute': 'data-pitch'
                },
            };
            this.listenTo(this.model, 'change:id', this.rebindElAndRender);
            
            this.el = '.part-control-block-inner[data-id="' + this.model.getInstrumentId() + '"] .beat-control-block-inner[data-time="' + this.model.getTime() + '"]';
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, bindings)
            );
            this.render();
        },
        
        render: function() {
            this._collectionBinder.bind(this.model.getNotesCollection(), this.el);
            return this;
        },
        
        rebindElAndRender: function() {
            this._collectionBinder.unbind();
            this.el = '.part-control-block-inner[data-id="' + this.model.getInstrumentId() + '"] .beat-control-block-inner[data-time="' + this.model.getTime() + '"]';
            this.render();
        },
        
        foo: function() {
            console.log('foo');
        },
        
        close: function() {
            this._collectionBinder.unbind();
        }
    });
    
    var BarControlView = Backbone.View.extend({
        el: '#add-bar-controls',
        _template: SYNTH.templateCache['template-bar-controls'],
        _modelBinder: undefined,
        initialize: function() {
            this._modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        
        render: function() {
            
            var converter = function(direction, value) {
                if(direction === 'ViewToModel') {
                    return parseInt(value);
                }
                return value;
            };
            
            var bindings = {
                'beatsPerBar': [
                    {
                        selector: '#beats-per-bar-input',
                        converter: converter
                    },
                    {
                        selector: '#beats-per-bar-display'
                    }
                ],
                'barsPerAdd': {
                    selector: '#bars-per-addition',
                    converter: converter
                },
                'beatsPerAdd': {
                    selector: '#beats-per-addition',
                    converter: converter
                }
            };
            
            this.$el.html(this._template);
            this._modelBinder.bind(this.model, this.el, bindings);
        },
        
        events: {
            'click #button-add-bars': 'addBars',
            'click #button-add-beats': 'addBeats',
            'click #button-delete-beats': 'deleteBeats'
        },
        
        close: function() {
            this._modelBinder.unbind();
            this.$el.empty();
        },
        
        addBars: function(event) {
            this.model.invoke_appendBars();
        },
        
        addBeats: function(event) {
            this.model.invoke_appendBeats();
        },
        
        deleteBeats: function(event) {
            this.model.deleteSelectedBeats();
        }
    }); 
    
    var InstrumentPartView = Backbone.View.extend({
        el: '#part-control-array',
        _template: SYNTH.templateCache['template-part-controls'],
        _componentTemplate: SYNTH.templateCache['template-part-control-array'],
        _modelBinder: undefined,
        _collectionBinder: undefined,
        _beatCollectionBiner: undefined,
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
            this._collectionBinder = new Backbone.CollectionBinder(
                new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, bindings)
            );
            this.render();
        },
        
        render: function() {
            this._collectionBinder.bind(this.model.getInstrumentCollection(), this.el);
            return this;
        },
                
        close: function() {
            this._collectionBinder.unbind();
        },
        
    });
    
    var InstrumentGridHeaderView = Backbone.View.extend({
        el: '#part-left',
        elAnchor: '#part-anchor',
        elLower: '#part-left-lower',
        _componentTemplate: SYNTH.templateCache['template-beat-time'],
        _collectionBinder: undefined,
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
            
            this._collectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ElManagerFactory(this._componentTemplate, bindings)
            );
            this.render();
        },
        
        render: function() {
            this._collectionBinder.bind(this.model.getDummyInstrument().getBeatsCollection(), this.elLower);
            return this;
        },
        
        events: {
            'mousedown .time': 'onMouseDownTime',
            'mousedown #part-left > div': 'preventDefault',
            'mousedown #part-anchor': 'unselectAllBeats',
            'mouseup': 'onMouseUp',
        },
        
        close: function() {
            this._collectionBinder.unbind();
        },
        
        onMouseDownTime: function(event) {
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
             
        onMouseUp: function(event) {
            this.$el.undelegate('.time', 'mouseover');
        },
        
        unselectAllBeats: function(event) {
            this.model.unselectAllBeats();
        },
        
        preventDefault: function(event) {
            event.preventDefault();
        }
        
    });
        
    var UndoRedoStackView = Backbone.View.extend({
        el: '#undo-redo',
        undoButton: '#button-undo',
        redoButton: '#button-redo',
        _template: SYNTH.templateCache['template-undo-redo'],
        _modelBinder: undefined,
        initialize: function() {
            this.listenTo(this.model, 'change:undoStack', this.renderUndo);
            this.listenTo(this.model, 'change:redoStack', this.renderRedo);
            this._modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        
        render: function() {
            this.$el.html(this._template);
            this._modelBinder.bind(this.model, this.el, {});
            this.renderUndo();
            this.renderRedo();
            return this;
        },
        
        events: {
            'click #button-undo': 'undo',
            'click #button-redo': 'redo'
        },
        
        close: function() {
            this.stopListening();
            this._modelBinder.unbind();
            this.$el.empty();
        },
        
        renderUndo: function() {
            var isDisabled = (this.model.get('undoStack').length === 0 ? true : false);
            $(this.undoButton).attr('disabled', isDisabled);
        },
        
        renderRedo: function() {
            var isDisabled = (this.model.get('redoStack').length === 0 ? true : false);
            $(this.redoButton).attr('disabled', isDisabled);
        },
        
        undo: function() {
            this.model.undo();
        },
        
        redo: function() {
            this.model.redo();
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
    
    /** Collection of notes */
    var Notes = Backbone.Collection.extend({
        model: Note
    });
    
    /**
     * 
     */
    var Pitch = Backbone.Model.extend({
        defaults: {
            'id': null,
            'isPlayableArray': null,
            'noteCollection': null,
            'name': null,
            'octave': null,
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
        getOctave: function() {
            var octave = this.get('octave');
            return octave;
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
    
    var Pitches = Backbone.Collection.extend({
        model: Pitch
    });
    
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
     * Collection of Instruments
     */
    var Instruments = Backbone.Collection.extend({
        model: Instrument
    });
    
    /**
     * The orchestra
     */
    var Orchestra = Backbone.Model.extend({
        
    });
    
    //TODO refactor orchestra into player
    /** Object responsible for playing the orchestra */
    var Player = Backbone.Model.extend({
        
    });
    
    /**
     * The controller class to complete MVC. All views should interface
     * only with this model. Methods which push Commands onto the
     * redo / undo stack are called invocations, and are prefixed with 
     * 'invoke_'
     */
    var Controller = Backbone.Model.extend({
        defaults: {
            'orchestra': null
        },
        
        getOrchestra: function() {
            var orchestra = this.get('orchestra');
            return orchestra;
        },
        
        setOrchestra: function(newOrchestra) {
            this.set('orchestra', newOrchestra);
            return newOrchestra;
        }
    });
    
        
    // Establish | Variables ---------------------------------------------------------------------------
    SYNTH.models = {}; // Top-level models are held here
    SYNTH.domCache = {};
    SYNTH.invoker = new Invoker();
    
    
    // Op | Initialize models -----------------------------------------------------------------------------
    SYNTH.models.orchestra = new Orchestra();
    
    // Op | Document.ready --------------------------------------------------------------------------------
    
    $(document).ready(function() {
        
        // Initialize top level views
        //TODO
        /*
        new PlayerControlView({model: SYNTH.models.orchestra});
        new BarControlView({model: SYNTH.models.orchestra});
        new InstrumentControlView({model: SYNTH.models.orchestra});
        new InstrumentPartView({model: SYNTH.models.orchestra});
        new InstrumentGridHeaderView({model: SYNTH.models.orchestra});
        new UndoRedoStackView({model: SYNTH.invoker});
        */
        
        // Preconfigure orchestra
        /*
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument1');
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument2');
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument3');
        SYNTH.models.orchestra.addInstrument('synthPiano', 'instrument4');
        */
        
        // UI ops
        (function() {
            
            function initializeTop() {
                var top = $('#part-top');
                var i;
                var div;
                var str;
                for(i = 0; i < 88; i++) {
                    str = SYNTH.TONES[i];
                    div = $('<div></div>');
                    if(str === 'C4') {
                        div.attr({'id': 'mid'});
                    }
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
                var partHeight = windowHeight - 60; // 60px static top frequency row
                var instrumentControlHeight = windowHeight - 100 - 25 - 20;   // ditto above - 20px instrument .nav-menu 
                $('#site-main').attr({'style': 'height: ' + windowHeight + 'px;'});
                $('#part-controls').attr({'style': 'height: ' + partHeight + 'px;'});
                $('#instrument-controls').attr({'style': 'height: ' + instrumentControlHeight + 'px;'});
            }
            
            initializeTop();
            resizeUI();
            $(window).resize(resizeUI);
            
            $('#site-bottom').click(function() {
                $(this).toggleClass('expanded');
            });
        }());
        
        // Scroll syncing
        SYNTH.domCache.top = $('#part-top');
        SYNTH.domCache.left = $('#part-left');
        $('#part-controls').scroll(function() {
            SYNTH.domCache.top.attr({'style': 'left: ' + (- this.scrollLeft) + 'px'});
            SYNTH.domCache.left.attr({'style': 'top: ' + (- this.scrollTop + 160) + 'px'});
        });
        
    });
    
    // Expose for testing
    SYNTH.api = {};
    SYNTH.api.Command = Command;
    SYNTH.api.Invoker = Invoker;
    SYNTH.api.Note = Note;
    SYNTH.api.Notes = Notes;
    SYNTH.api.Pitch = Pitch;
    SYNTH.api.Pitches = Pitches;
    SYNTH.api.SoundGenerator = SoundGenerator;
    SYNTH.api.Instrument = Instrument;
    SYNTH.api.Instruments = Instruments;
    SYNTH.api.Orchestra = Orchestra;
    SYNTH.api.Player = Player;
    SYNTH.api.Controller = Controller;
    return SYNTH.api;
    
});

SYNTH.prototype = {};
SYNTH(jQuery, Backbone, T, MUSIC, Note, Interval);