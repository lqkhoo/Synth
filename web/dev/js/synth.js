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
    
    // True constants
    var VERSION = '0.1';
    var SOUNDFONT_URL = '../soundfont/';
    var TEMPLATE_URL = 'templates/templates.html';
    var TEMPLATE_SELECTOR = '.template';
    // Initialized contants
    var TONES = [];
    var FREQS = [];
    var TEMPLATE_CACHE = {};
    
    // Initialization helpers
    function _cacheTemplates() {
        if(! TEMPLATE_CACHE) {
            TEMPLATE_CACHE = {};
        }
        
        var templateString;
        $.ajax({
            url: TEMPLATE_URL,
            method: 'GET',
            async: false,
            success: function(data) {
                templateString = $(data).filter(TEMPLATE_SELECTOR);
                var i;
                for(i = 0; i < templateString.length; i++) {
                    TEMPLATE_CACHE[templateString[i].id] = $(templateString[i]).html();
                }
            },
            error: function() {
                throw 'Error fetching templates';
            }
        });
    }
    
    function _generateFrequencyTable() {
        var tones = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
        var octaves = ['1', '2', '3', '4', '5', '6', '7', '8'];
        
        TONES = ['A0', 'Bb0', 'B0'];
        (function() {
            var i, j;
            for(i = 0; i < octaves.length; i++) {
                for(j = 0; j < tones.length; j++) {
                    TONES.push(tones[j] + octaves[i]);
                    if(TONES.length >= 88) {
                        return;
                    }
                }
            }
        }());
        
        FREQS = [];
        (function() {
            var i;
            for(i = 0; i < TONES.length; i++) {
                FREQS.push(MUSIC_Note.fromLatin(TONES[i]).frequency());
            }
        }());
    };
    
    // Initialize
    _cacheTemplates(); // Establish template cache
    _generateFrequencyTable(); // Define frequency table
        
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
    
    /** An object holding information about how to modify the grid in
     *  a series of steps, and how to exactly reverse it
     */
    function CompoundGridModificationBlueprint(controller) {
        
        var self = this;
        
        this._steps = [];
        
        // Set score length
        this.addOp_setScoreLength = function(oldScoreLength, newScoreLength) {
            self._steps.push({
                op: 'scorelength-change',
                oldScoreLength: oldScoreLength,
                newScoreLength: newScoreLength
            });
        };
        this._setScoreLength = {};
        this._setScoreLength.exec = function(step) {
            controller.getOrchestra().setScoreLength(step.newScoreLength);
        };
        this._setScoreLength.undo = function(step) {
            controller.getOrchestra().setScoreLength(step.oldScoreLength);
        };
        
        // Delete row
        this.addOp_deleteRow = function(time) {
            self._steps.push({
                op: 'row-delete',
                time: time
            });
        };
        this._deleteRow = {};
        this._deleteRow.exec = function(step) {
            controller.getOrchestra().getTimeUnitCollection().remove(step.time);
        };
        this._deleteRow.undo = function(step) {
            controller.getOrchestra().getTimeUnitCollection().add(new TimeUnit({id: step.time}));
        };
        
        this.addOp_addRow = function(time) {
            self._steps.push({
                op: 'row-add',
                time: time
            });
        };
        this._addRow = {};
        this._addRow.exec = function(step) {
            controller.getOrchestra().getTimeUnitCollection().add(new TimeUnit({id: step.time}));
        };
        this._addRow.undo = function(step) {
            controller.getOrchestra().getTimeUnitCollection().remove(step.time);
        };
        
        // Move row
        this.addOp_moveRow = function(oldTime, newTime) {
            self._steps.push({
                op: 'row-move',
                oldTime: oldTime,
                newTime: newTime
            });
        };
        this._moveRow = {};
        this._moveRow.exec = function(step) {
            controller.getOrchestra().getTimeUnitCollection().get(step.oldTime).setId(step.newTime);
        };
        this._moveRow.undo = function(step) {
            controller.getOrchestra().getTimeUnitCollection().get(step.newTime).setId(step.oldTime);
        };
        
        // Delete note
        this.addOp_deleteNote = function(instrumentId, pitchId, note) {
            self._steps.push({
                op: 'note-delete',
                instrumentId: instrumentId,
                pitchId: pitchId,
                note: note.clone()
            });
        };
        this._deleteNote = {};
        this._deleteNote.exec = function(step) {
            controller.getOrchestra().getInstrumentById(step.instrumentId)
                    .getPitch(step.pitchId).getNoteCollection().remove(step.note.getTime());
        };
        this._deleteNote.undo = function(step) {
            controller.getOrchestra().getInstrumentById(step.instrumentId)
            .getPitch(step.pitchId).getNoteCollection().add(step.note);
        };
        
        // Change note value
        this.addOp_changeNoteValue = function(instrumentId, pitchId, startTime, oldValue, newValue) {
            self._steps.push({
                op: 'note-change-value',
                instrumentId: instrumentId,
                pitchId: pitchId,
                startTime: startTime,
                oldValue: oldValue,
                newValue: newValue
            });
        };
        this._changeNoteValue = {};
        this._changeNoteValue.exec = function(step) {
            controller.getOrchestra().getInstrumentById(step.instrumentId)
                .getPitch(step.pitchId).getNoteCollection().get(step.startTime).setValue(step.newValue);
        };
        this._changeNoteValue.undo = function(step) {
            controller.getOrchestra().getInstrumentById(step.instrumentId)
            .getPitch(step.pitchId).getNoteCollection().get(step.startTime).setValue(step.oldValue);
        };
        
        // Decrement note value
        this.addOp_decrementNoteValue = function(instrumentId, pitchId, startTime) {
            self._steps.push({
                op: 'note-decrement-value',
                instrumentId: instrumentId,
                pitchId: pitchId,
                startTime: startTime
            });
        };
        this._decrementNoteValue = {};
        this._decrementNoteValue.exec = function(step) {
            var note = controller.getOrchestra().getInstrumentById(step.instrumentId)
            .getPitch(step.pitchId).getNoteCollection().get(step.startTime);
            note.setValue(note.getValue() - 1);
        };
        this._decrementNoteValue.undo = function(step) {
            var note = controller.getOrchestra().getInstrumentById(step.instrumentId)
            .getPitch(step.pitchId).getNoteCollection().get(step.startTime);
            note.setValue(note.getValue() + 1);
        };
        
        // Change note start time
        this.addOp_changeNoteStartTime = function(instrumentId, pitchId, oldStartTime, newStartTime) {
            self._steps.push({
                op: 'note-change-starttime',
                instrumentId: instrumentId,
                pitchId: pitchId,
                oldStartTime: oldStartTime,
                newStartTime: newStartTime
            });
        };
        this._changeNoteStartTime = {};
        this._changeNoteStartTime.exec = function(step) {
            controller.getOrchestra().getInstrumentById(step.instrumentId)
                .getPitch(step.pitchId).getNoteCollection().get(step.oldStartTime).setTime(step.newStartTime);
        };
        this._changeNoteStartTime.undo = function(step) {
            controller.getOrchestra().getInstrumentById(step.instrumentId)
                .getPitch(step.pitchId).getNoteCollection().get(step.newStartTime).setTime(step.oldStartTime);
        };
        
        this._exec = function(execMode, step) {
            switch(step.op) {
            case 'scorelength-change':
                self._setScoreLength[execMode](step);
                break;
            case 'row-delete':
                self._deleteRow[execMode](step);
                break;
            case 'row-add':
                self._addRow[execMode](step);
                break;
            case 'row-move':
                self._moveRow[execMode](step);
                break;
            case 'note-delete':
                self._deleteNote[execMode](step);
                break;
            case 'note-change-value':
                self._changeNoteValue[execMode](step);
                break;
            case 'note-decrement-value':
                self._decrementNoteValue[execMode](step);
                break;
            case 'note-change-starttime':
                self._changeNoteStartTime[execMode](step);
                break;
            default:
                break;
            }
        };
        
        this.exec = function() {
            var step;
            var i;
            for(i = 0; i < self._steps.length; i++) {
                step = self._steps[i];
                self._exec('exec', step);
            }
        };
        
        this.undo = function() {
            var step;
            var i;
            for(i = self._steps.length - 1; i >= 0; i--) {
                step = self._steps[i];
                self._exec('undo', step);
            }
        };
    }
    
    // Declare | Models -------------------------------------------------------------------------------
    
    /**
     * Top level model for mixins / augments etc.
     * 
     */
    var SynthBaseModel = Backbone.Model.extend({
        /* Override default Backbone.js toJSON
         * 
         * Method provides support for transient attributes which would not be serialized
         * These are usually properties which would result in circular references or are
         *   otherwise not needed in the JSON output.
         *   
         * Specify transient attribute as transientAttrs: { ... } within the model. Actual
         *   value within transientAttrs is ignored at this time
         */
        toJSON: function() {
            var attrs;
            if(! this.transientAttrs) {
                return _.clone(this.attributes);
            }
            attrs = {};
            for(var attr in this.attributes) {
                if(this.attributes.hasOwnProperty(attr) && ! this.transientAttrs.hasOwnProperty(attr)) {
                    attrs[attr] = this.attributes[attr];
                }
            }
            return _.clone(attrs);
        }
    });
    
    /** A note. The id is when it's played. If ornaments are to be added later, it should be here */
    var Note = SynthBaseModel.extend({
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
        model: Note,
        comparator: 'id'
    });
        
    /** An object handling a particular frequency */
    var Pitch = SynthBaseModel.extend({
        defaults: {
            'id': null,
            'instrument': null,
            'noteCollection': null,
            'isSelected': false
        },
        transientAttrs: {
            'instrument': null,
            'isSelected': false
        },
        deserialize: function(serialized) {
            if(serialized.noteCollection) {
                var note;
                var noteCollection = new Notes();
                var i;
                for(i = 0; i < serialized.noteCollection.length; i++) {
                    note = new Note(serialized.noteCollection[i]);
                    noteCollection.add(note);
                }
                this._setNoteCollection(noteCollection);
            }
            return this;
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
            var noteCollection = this.getNoteCollection();
            var collectionLength = noteCollection.length;
            
            var midIndex;
            var note;
            var noteTime;
            var noteValue;
            
            // degenerate conditions
            if(collectionLength === 0) {
                return undefined;
            }

            // otherwise perform iterative bin search
            var firstIndex = 0;
            var lastIndex = this.getNoteCollection().length - 1;
            
            while(lastIndex >= firstIndex) {
                midIndex = Math.ceil((firstIndex + lastIndex) / 2);
                note = noteCollection.at(midIndex);
                noteTime = note.getTime();
                noteValue = note.getValue();
                
                // If note starts before or at target time, and ends after given time
                if(noteTime <= time && noteTime + noteValue - 1 >= time) {
                    return note;
                } else if(noteTime < time) {
                    firstIndex = midIndex + 1;
                } else {
                    lastIndex = midIndex - 1;
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
            var noteCollection = this.getNoteCollection();
            
            var note;
            var nextNote;
            var firstIndex;
            var lastIndex;
            var midIndex;
            
            // degenerate condition
            if(noteCollection.length === 0) {
                return undefined;
            }
            
            // We want the first note, walking backwards. Binary search
            firstIndex = 0;
            lastIndex = noteCollection.length - 1;
            
            while(lastIndex >= firstIndex) {
                
                midIndex = Math.ceil((firstIndex + lastIndex) / 2);
                note = noteCollection.at(midIndex);
                
                if(midIndex === lastIndex) {
                    nextNote = undefined;
                } else {
                    nextNote = noteCollection.at(midIndex + 1); 
                }                    
                
                // If current note ends before given time, and either:
                // there is no next note, or that the next note ends on or after the given time
                if(note.getTime() + note.getValue() - 1 < time
                        && (nextNote === undefined || nextNote.getTime() + nextNote.getValue() - 1 >= time )) {
                    return note;
                } else if(note.getTime() < time) {
                    firstIndex = midIndex + 1;
                } else {
                    lastIndex = midIndex - 1;
                }
            }
            return undefined;
            
        },
        /** Given a time, gets the note after it, whether the time is occupied by a note or not */
        getNoteAfterThisTime: function(time) {
            var note;
            var noteCollection = this.getNoteCollection();
            
            var prevNote;
            var firstIndex;
            var lastIndex;
            var midIndex;
            
            // degenerate condition
            if(noteCollection.length === 0) {
                return undefined;
            }
            
            // We want the first note, walking forwards. Binary search
            firstIndex = 0;
            lastIndex = noteCollection.length - 1;
            
            while(lastIndex >= firstIndex) {
                
                midIndex = Math.ceil((firstIndex + lastIndex) / 2);
                note = noteCollection.at(midIndex);
                
                if(midIndex === firstIndex) {
                    prevNote = undefined;
                } else {
                    prevNote = noteCollection.at(midIndex - 1); 
                }                    
                
                // If current note ends after given time, and either:
                // there is no previous note, or that the previous one ends on or before the given time
                if(note.getTime() + note.getValue() - 1 > time
                        && (prevNote === undefined || prevNote.getTime() + prevNote.getValue() - 1 <= time )) {
                    return note;
                } else if(note.getTime() < time) {
                    firstIndex = midIndex + 1;
                } else {
                    lastIndex = midIndex - 1;
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
    
    /** Collection of Pitch objects */
    var Pitches = Backbone.Collection.extend({
        model: Pitch,
        comparator: 'id'
    });
    
    /** Static | Factory for Pitch and Pitches */
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
        
    /** An instrument */
    var Instrument = SynthBaseModel.extend({
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
        transientAttrs: {
            'orchestra': null
        },
        deserialize: function(serialized) {
            if(serialized.pitchCollection) {
                var pitch;
                var pitchCollection = new Pitches();
                var i;
                for(i = 0; i < serialized.pitchCollection.length; i++) {
                    pitch = new Pitch(serialized.pitchCollection[i]).deserialize(serialized.pitchCollection[i]);
                    pitch.setInstrument(this);
                    pitchCollection.add(pitch);
                }
                this.setPitchCollection(pitchCollection);
            }
            return this;
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
    
    /** A collection of Instruments */
    var Instruments = Backbone.Collection.extend({
        model: Instrument,
        comparator: 'id'
    });
    
    /** Static | Factory for Instruments */
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
    var TimeUnit = SynthBaseModel.extend({
       defaults: {
           'id': null,
           'isSelected': null
       },
       getId: function() {
           return this.get('id');
       },
       setId: function(newId) {
           this.set('id', newId);
           return newId;
       },
       getIsSelected: function() {
           return this.get('isSelected');
       },
       setIsSelected: function(isSelected) {
           this.set('isSelected', isSelected);
           return isSelected;
       }
    });
    
    /** A collection of time units */
    var TimeUnits = Backbone.Collection.extend({
        model: TimeUnit,
        comparator: 'id'
    });
        
    /** Object responsible for playing the orchestra */
    var Player = SynthBaseModel.extend({
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
        transientAttrs: {
            'orchestra': null,
            'controller': null,
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
        
        
        // play methods
        /** Plays notes starting at the given time
         *  This is a private helper method for playFromTime etc. and does not actually 
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
                            noteOffDelay = note.getValue() * squaresPerSecond;     
                            
                            MIDI.noteOn(channelId, midiNoteCode, volume, 0);
                            if(isSustainOn) {
                                sustainDuration = instrument.getSustainDuration() / 1000;
                                MIDI.noteOff(channelId, midiNoteCode, Math.max(noteOffDelay, sustainDuration));
                            } else {
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
            if(this.getIsLooping()) {
                this.playFromTime(0);
            } else {
                this.pause();
            }
        },
        /** Plays from current time */
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
                            self.getEventQueue().dequeue();
                        }, (time - startTime + 1) * squaresPerSecond * 1000);
                    }
                    
                    self.getEventQueue().enqueue(timeoutId);
                    
                }(time, isLastNote));

            }
        },
        /** Cancel all scheduled play events and sets player state to paused */
        pause: function() {
            this._setIsPlaying(false);
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
            var isPlaying = this.getIsPlaying();
            if(isPlaying) {
                this.pause();
            }
            this.setCurrentTime(newTime);
            if(isPlaying) {
                this.play();
            }
        },
        rewindToStart: function() {
            this.setPlayHead(0);
        },
        forwardToEnd: function() {
            this.setPlayHead(this.getOrchestra().getScoreLength() - 1);
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
                    soundfontUrl: SOUNDFONT_URL,
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
    var SoundFontLibrary = SynthBaseModel.extend({
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
    
    /** The orchestra */
    var Orchestra = SynthBaseModel.extend({
        defaults: {
            'controller': null,
            'soundFontLibrary': null,
            'instrumentCollection': [],
            'dummyInstrument': null,
            'nextInstrumentId': 0,
            'activeInstrumentId': null,
            'timeUnitCollection': null,
            'scoreLength': 24,
            'playSpeed': 300
        },
        transientAttrs: {
            'controller': null,
            'soundFontLibrary': null,
            'dummyInstrument': null,
            'timeUnitCollection': null
        },
        initialize: function(serialized) {
            var dummyInstrument;
            var instrumentCollection;
            var timeUnitCollection;
            var soundFontLibrary;
            
            // dummy instrument
            dummyInstrument = instrumentFactory.instrumentFromScratch(
                    this, -1, 'dummy', 'dummy', this.getScoreLength()
            );
            
            // setup instruments
            instrumentCollection = new Instruments();
            
            this._setInstrumentCollection(instrumentCollection);
            
            // setup time units
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
            
            this._setDummyInstrument(dummyInstrument);
            this._setTimeUnitCollection(timeUnitCollection);
            this._setSoundFontLibrary(soundFontLibrary);
        },
        deserialize: function(serialized) {
            
            var i;
            var serializedInstrument;
            var instrument;
            var instrumentCollection = new Instruments();
            for(i = 0; i < serialized.instrumentCollection.length; i++) {
                serializedInstrument = serialized.instrumentCollection[i];
                instrument = new Instrument(serializedInstrument).deserialize(serializedInstrument);
                instrument.setOrchestra(this);
                instrumentCollection.add(instrument);
            }
            this._setInstrumentCollection(instrumentCollection);
            return this;
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
        _setInstrumentCollection: function(instrumentCollection) {
            this.set('instrumentCollection', instrumentCollection);
            return instrumentCollection;
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
        setScoreLength: function(newScoreLength) {
            this.set('scoreLength', newScoreLength);
            return newScoreLength;
        },
        getPlaySpeed: function() {
            return this.get('playSpeed');
        },
        setPlaySpeed: function(playSpeed) {
            this.set('playSpeed', playSpeed);
            return playSpeed;
        },
        getLongestNoteValue: function() {
            return this.get('longestNoteValue');
        },
        setLongestNoteValue: function(newValue) {
            this.set('longestNoteValue', newValue);
            return newValue;
        },
        
        // methods
        
        getPitch: function(instrumentId, pitchId) {
            return this.getInstrumentById(instrumentId).getPitchCollection().get(pitchId);
        },
        
        // instrument methods
        getInstrumentById: function(id) {
            var instrument = this.getInstrumentCollection().get(id);
            return instrument;
        },
        getAllInstruments: function() {
            return this.getInstrumentCollection().models;
        },
        initializePitchCollectionView: function(instrumentId) {
            if(SYNTH.app.topView) {
                SYNTH.app.topView.getGridView().addPitchCollectionView(instrumentId);
            }
        },
        /** Adds a new pre-constructed instrument into the collection
         *  This new instrument is set to be the selected instrument
         */
        addInstrument: function(instrument, instrumentId) {
            var soundFontNumber = instrument.getSoundFontId();
            this.getInstrumentCollection().add(instrument);
            this.initializePitchCollectionView(instrumentId);
            this.setNewActiveInstrument(instrumentId);
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
        /** Removes instrument of given id if it exists */
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
        /** Returns currently selected instrument */
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
                
        // note methods
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
        
        // time unit methods
        getTimeUnit: function(time) {
            return this.getTimeUnitCollection().get(time);
        },
        setTimeUnitSelection: function(time, isSelected) {
            this.getTimeUnit(time).setIsSelected(isSelected);
            return isSelected;
        },
        appendTimeUnits: function(numberOfUnits) {
            var startTime = this.getScoreLength();
            var endTime = startTime + numberOfUnits; // non-inclusive
            var timeUnitCollection = this.getTimeUnitCollection();
            
            var i;
            for(i = startTime; i < endTime; i++) {
                timeUnitCollection.add(new TimeUnit({id: i}));
            }
            
            this.setScoreLength(endTime);
            
        },
        // for undo only - logical reverse of appendTimeUnits()
        unappendTimeUnits: function(numberOfUnits) {
            var endTime = this.getScoreLength(); // non-inclusive
            var startTime = endTime - numberOfUnits;
            var timeUnitCollection = this.getTimeUnitCollection();
            
            var i;
            for(i = startTime; i < endTime; i++) {
                timeUnitCollection.remove(i);
            }
            
            this.setScoreLength(startTime);
        },
        
        // blueprint-only methods
        getBlueprint_deleteSelectedTimeUnits: function() {
            
            var blueprint = new CompoundGridModificationBlueprint(this.getController());
            
            var instruments = this.getInstrumentCollection().models;
            var selectedTimeUnits = this.getTimeUnitCollection().where({'isSelected': true});
            
            var timeUnitIndex = 0;  // current position in selected time unit array
            var timeUnitsRemoved = 0;   // how many rows removed so far
            
            var time;
            var instrumentIndex;
            var pitchCollection;
            var pitchId;
            var pitch;
            var note;
            var noteTime;
            
            var i;
            var isGoingToBeDeleted;
            
            function shiftRow(time) {
                // If no rows deleted thus far there's no need to do anything
                if(timeUnitsRemoved === 0) {
                    return;
                }
                
                // move notes - this does not affect sorting order
                for(instrumentIndex = 0; instrumentIndex < instruments.length; instrumentIndex++) {
                    pitchCollection = instruments[instrumentIndex].getPitchCollection();
                    
                    for(pitchId = 0; pitchId < pitchCollection.length; pitchId++) {
                        note = pitchCollection.get(pitchId).getNoteCollection().get(time);
                        if(note !== undefined) {
                            blueprint.addOp_changeNoteStartTime(instruments[instrumentIndex].getId(), pitchId, note.getTime(), note.getTime() - timeUnitsRemoved);
                        }
                    }
                }
                
                // shift time units - this does not affect sorting order
                blueprint.addOp_moveRow(time, time - timeUnitsRemoved);
            }
            

            function deleteRow(time) {
                // Delete row
                for(instrumentIndex = 0; instrumentIndex < instruments.length; instrumentIndex++) {
                    pitchCollection = instruments[instrumentIndex].getPitchCollection();
                    
                    for(pitchId = 0; pitchId < pitchCollection.length; pitchId++) {
                        pitch = pitchCollection.get(pitchId);
                        note = pitch.getOccupyingNote(time);
                        if(note !== undefined) {
                            noteTime = note.getTime();
                            if(noteTime === time) {
                                blueprint.addOp_deleteNote(instruments[instrumentIndex].getId(), pitchId, note);
                            } else {
                                
                                isGoingToBeDeleted = false;
                                
                                for(i = 0; i < selectedTimeUnits.length; i++) {
                                    if(noteTime === selectedTimeUnits[i].getId()) {
                                        isGoingToBeDeleted = true;
                                    }
                                }
                                if(! isGoingToBeDeleted) {
                                    blueprint.addOp_decrementNoteValue(instruments[instrumentIndex].getId(), pitchId, noteTime);
                                }
                            }
                        }
                    }
                }
                blueprint.addOp_deleteRow(time);
                //timeUnitCollection.remove(time);
            }
            
            for(time = 0; time < this.getScoreLength(); time++) {
                // If we have processed all the rows that needs deleting
                if(timeUnitIndex === selectedTimeUnits.length) {
                    shiftRow(time);
                } else {
                    // A row but not one that needs deleting
                    if(time !== selectedTimeUnits[timeUnitIndex].getId()) {
                        shiftRow(time);
                    } else {
                        deleteRow(time);
                        timeUnitsRemoved += 1;
                        timeUnitIndex += 1;
                    }
                }
            }
            blueprint.addOp_setScoreLength(this.getScoreLength(), this.getScoreLength() - timeUnitsRemoved);
            
            return blueprint;
        },
        
        getBlueprint_insertTimeUnits: function() {
            var blueprint = new CompoundGridModificationBlueprint(this.getController());
            
            var instruments = this.getInstrumentCollection().models;
            var selectedTimeUnits = this.getTimeUnitCollection().where({'isSelected': true});
            
            var timeUnitIndex = selectedTimeUnits.length - 1;  // current position in selected time unit array
            
            var unitsPerInsert = this.getController().getAppBehaviorController().getTimeBlocksPerAdd();
            var shiftDistance;
            
            var time;
            var instrumentIndex;
            var pitchCollection;
            var pitchId;
            var note;
            
            function shiftRow(time, distance) {
                // move notes - this does not affect sorting order
                for(instrumentIndex = 0; instrumentIndex < instruments.length; instrumentIndex++) {
                    pitchCollection = instruments[instrumentIndex].getPitchCollection();
                    
                    for(pitchId = 0; pitchId < pitchCollection.length; pitchId++) {
                        note = pitchCollection.get(pitchId).getNoteCollection().get(time);
                        if(note !== undefined) {
                            blueprint.addOp_changeNoteStartTime(instruments[instrumentIndex].getId(), pitchId, note.getTime(), note.getTime() + distance);
                        }
                    }
                }
                
                // shift time units - this does not affect sorting order
                blueprint.addOp_moveRow(time, time + distance);
            }
            
            // insert rows at post-shift position
            function insertRows(time) {
                var i;
                for(i = 0; i < unitsPerInsert; i++) {
                    blueprint.addOp_addRow(time + i);
                }
            }
            
            for(time = this.getScoreLength() - 1; time >= 0; time--) {
                
                // If we have processed all the rows that needs inserting
                if(timeUnitIndex === -1) {
                    break;
                } else {
                    // A row but not one that needs deleting
                    if(time !== selectedTimeUnits[timeUnitIndex].getId()) {
                        shiftDistance = unitsPerInsert * (timeUnitIndex + 1);
                        shiftRow(time, shiftDistance);
                    } else {
                        shiftDistance = unitsPerInsert * (timeUnitIndex + 1);
                        shiftRow(time, shiftDistance);
                        shiftDistance = unitsPerInsert * timeUnitIndex;
                        insertRows(time + shiftDistance);
                        timeUnitIndex -= 1;
                    }
                }
            }
            
            blueprint.addOp_setScoreLength(this.getScoreLength(), this.getScoreLength() + unitsPerInsert * selectedTimeUnits.length);
            return blueprint;
        }
    });
    
    /*
    function GridSelectionContext() {
        
        var self = this;
        
        this.CONTEXT_DEPTH_ACTIVE = 'active';
        this.CONTEXT_DEPTH_ALL = 'all';
        this.CONTEXT_TYPE_TIME_UNIT = 'time-unit';
        this.CONTEXT_TYPE_PITCH = 'pitch';
        this.CONTEXT_TYPE_RECT = 'rect';
        this.CONTEXT_TYPE_NOTE = 'note';
        
        this._isSelected = false;
        this._contextType = null;
        this._contextDepth = null;
        this._timeUnitFrom = null;
        this._timeUnitTo = null;
        this._pitchFrom = null;
        this._pitchTo = null;
        this._noteStartTime = null;
        
        this.getIsSelected = function() {
            return this._isSelected;
        };
        this.setIsSelected = function(bool) {
            this._isSelected = bool;
            return bool;
        };
        this.getContextType = function() {
            return self._contextType();
        };
        this.setContextType = function(type) {
            this._contextType = type;
            return type;
        };
        this.getContextDepth = function() {
            return self._contextDepth();
        };
        this.setContextDepth = function(depth) {
            this._contextDepth = depth;
            return depth;
        };
        this.getTimeUnitFrom = function() {
            return this._timeUnitFrom;
        };
        this.setTimeUnitFrom = function(time) {
            this._timeUnitFrom = time;
            return time;
        };
        this.getTimeUnitTo = function() {
            return this._timeUnitTo;
        };
        this.setTimeUnitTo = function(time) {
            this._timeUnitTo = time;
            return time;
        };
        this.getPitchFrom = function() {
            return this._pitchFrom;
        };
        this.setPitchFrom = function(pitch) {
            this._pitchFrom = pitch;
            return pitch;
        };
        this.getPitchTo = function() {
            return this._pitchTo;
        };
        this.setPitchTo = function(pitch) {
            this._pitchTo = pitch;
            return pitch;
        };  
        this.getNoteStartTime = function() {
            return this._noteStartTime;
        };
        this.setNoteStartTime = function(time) {
            this._noteStartTime = time;
            return time;
        };
        
        //TODO all
        this.timeUnitContext = function(timeUnitFrom, timeUnitTo) {
            
        };
        this.pitchContext = function(pitchFrom, pitchTo) {
            
        };
        this.rectContext = function(pitchFrom, timeUnitFrom, pitchTo, timeUnitTo) {
            
        };
        this.noteContext = function(pitchFrom, noteStartTime) {
            
        };
        
    };
    */
        
    // Controllers --------------------------------------------
    
    /** Model of user-controllable Views' states */
    var ViewController = SynthBaseModel.extend({
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
    
    /** Model of application behavior that doesn't belong in any of the core models */
    var AppBehaviorController = SynthBaseModel.extend({
        defaults: {
            'CLICK_MODE_EDIT': 'edit',
            'CLICK_MODE_SELECT': 'select',
            'gridClickMode': null,
            'timeBlocksPerAdd': 1,
            'majorGridSize': 16,
            'minorGridSize': 4
        },
        initialize: function() {
            this.setClickModeToEdit();
        },
        getClickMode: function() {
            return this.get('clickMode');
        },
        _setClickMode: function(mode) {
            this.set('clickMode', mode);
            return mode;
        },
        getTimeBlocksPerAdd: function() {
            return this.get('timeBlocksPerAdd');
        },
        setTimeBlocksPerAdd: function(blocks) {
            this.set('timeBlocksPerAdd', blocks);
            return blocks;
        },
        getMajorGridSize: function() {
            return this.get('majorGridSize');
        },
        setMajorGridSize: function(newSize) {
            this.set('majorGridSize', newSize);
            return newSize;
        },
        getMinorGridSize: function() {
            return this.get('minorGridSize');
        },
        setMinorGridSize: function(newSize) {
            this.set('minorGridSize', newSize);
            return newSize;
        },
        
        setClickModeToEdit: function() {
            var mode = this.get('CLICK_MODE_EDIT');
            this._setClickMode(mode);
            return mode;
        },
        setClickModeToSelect: function() {
            var mode = this.get('CLICK_MODE_SELECT');
            this._setClickMode(mode);
            return mode;
        }
        
    });
    
    /**
     * The top-level controller class to complete MVC.
     * All top-level views should interface
     * only with this model. Methods which push Commands onto the
     * redo / undo stack are called invocations, and are prefixed with 
     * 'invoke_'
     */
    var Controller = SynthBaseModel.extend({
        defaults: {
            // 'mode': 'synth' / 'game',
            'version': null,
            'orchestra': new Orchestra(),
            'player': null,
            'invoker': new Invoker(),
            'viewController': new ViewController(),
            'appBehaviorController': new AppBehaviorController()
        },
        transientAttrs: {
            'player': null,
            'invoker': null,
            'viewController': null,
            'appBehaviorController': null
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
        getAppBehaviorController: function() {
            return this.get('appBehaviorController');
        },
        
        fromJson: function(json) {
            var obj = JSON.parse(json);
            var orchestra;
            var instruments;
            var i;
            
            obj.orchestra.controller = this;
            orchestra = new Orchestra(obj.orchestra).deserialize(obj.orchestra);
            this._setOrchestra(orchestra);
            
            orchestra = this.getOrchestra();
            
            instruments = orchestra.getInstrumentCollection().models;
            for(i = 0; i < instruments.length; i++) {
                orchestra.initializePitchCollectionView(instruments[i].getId());
            }
            console.log(orchestra);
            if(SYNTH.app) {
                SYNTH.app.topView.render();
            }
        },
        toJson: function() {
            return JSON.stringify(this);
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
        // note operations
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
        // instrument operations
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
                    args: [instrument, instrumentId]
                }
            });
            this._invoke(command);
        },
        // time block operations
        invoke_appendTimeBlocks: function(numberOfBlocks) {
            var orchestra = this.getOrchestra();
            var command = new Command({
                scope: orchestra,
                exec: {
                    func: orchestra.appendTimeUnits,
                    args: [numberOfBlocks],
                },
                undo: {
                    func: orchestra.unappendTimeUnits,
                    args: [numberOfBlocks]
                }
            });
            this._invoke(command);
        },
        invoke_insertTimeBlocks: function() {
            var orchestra = this.getOrchestra();
            var blueprint = orchestra.getBlueprint_insertTimeUnits();
            var command = new Command({
                scope: this,
                exec: {
                    func: blueprint.exec,
                    args: []
                },
                undo: {
                    func: blueprint.undo,
                    args: []
                }
            });
            this._invoke(command);
        },
        invoke_deleteSelectedTimeBlocks: function() {
            var orchestra = this.getOrchestra();
            var blueprint = orchestra.getBlueprint_deleteSelectedTimeUnits();
            var command = new Command({
                scope: this,
                exec: {
                    func: blueprint.exec,
                    args: []
                },
                undo: {
                    func: blueprint.undo,
                    args: []
                }
            });
            this._invoke(command);
        }
    });
    
    // Declare | Views -----------------------------------------------------------------------------------------   
    
    // Grid views --------------------------------
    
    var GridNoteCollectionView = Backbone.View.extend({
        el: '',
        collectionTemplate: TEMPLATE_CACHE['template-note'],
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
        collectionTemplate: TEMPLATE_CACHE['template-grid-pitch'],
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
        collectionTemplate: TEMPLATE_CACHE['template-grid-instrument'],
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
        rowTemplate: TEMPLATE_CACHE['template-grid-event-capture-layer-row'],
        
        initialize: function() {
            
            var self = this;
            
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
            
            function initializeColumns() {
                var i;
                var div;
                for(i = 0; i < 88; i++) {
                    div = $('<div></div>').attr({'data-pitch': i});
                    $(self.columnEl).append(div);
                }
            }
                        
            this.rowCollectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ElManagerFactory(this.rowTemplate, bindings)
                    ,{autoSort: true});
            initializeColumns(); // render columns
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
        collectionTemplate: TEMPLATE_CACHE['template-beat-time'],
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
            , {autoSort: true});
            
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
                    str = TONES[i];
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
            'mousedown #grid-event-capture-layer': '_onGridClick',
            'mouseup #grid': '_foo'
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
                this._undelegateAllEvents();
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
                        this._undelegateAllEvents();
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
                    
                    this._undelegateAllEvents();
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
            
            this.model.invoke_addNote(activeInstrumentId, pitchId, startTime, value);
            this._undelegateAllEvents();
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
            
            if(newPitchId === pitchId && newTime === time) {
                this.model.invoke_removeNote(activeInstrumentId, pitchId, time, value);
            }
            this._undelegateAllEvents();
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
            if(newValue === 0) {
                this.model.invoke_removeNote(activeInstrumentId, pitchId, noteStartTime, oldValue);
            } else {
                this.model.invoke_editNoteValue(activeInstrumentId, pitchId, noteStartTime, oldValue, newValue);
            }
            this._undelegateAllEvents();
        },
        _resetUIHelperEl: function() {
            $(this.uiHelperEl).css({
                'height': '0px',
                'width': '0px'
            });
        },
        _undelegateAllEvents: function() {
            this._resetUIHelperEl();
            this.$el.undelegate(this.eventLayerEl, 'mousemove');
            this.$el.undelegate(this.eventLayerEl, 'mouseup');
        },
        
        // methods
        addPitchCollectionView: function(instrumentId) {
            var instrument;
            console.log(this._pitchCollectionViews);
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
    var PlayerControlPanelView = Backbone.View.extend({
        el: '#player-controls',
        model: null,
        template: TEMPLATE_CACHE['template-playback-panel'],
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
            
            function playSpeedConverter(direction, value) {
                if(direction === 'ViewToModel') {
                    return parseInt(value);
                } else {
                    return value;
                }
            }
            
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
                       selector: '#input-playback-bar',
                       elAttribute: 'max'
                   }
                ],
                'playSpeed': {
                    selector: '[data-attr="current-speed"]',
                    converter: playSpeedConverter
                }
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
        el: TEMPLATE_CACHE['template-instrument-panel'],
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
        template: TEMPLATE_CACHE['template-add-instrument-panel'],
        collectionTemplate: TEMPLATE_CACHE['template-instrument-panel'],
        instrumentCollectionBinder: null,
        initialize: function() {
            
            function viewCreator(model) {
                return new InstrumentView({model: model});
            }
            
            $(this.addInstrumentEl).html(this.template);
            this.collectionBinder = new Backbone.CollectionBinder(
                    new Backbone.CollectionBinder.ViewManagerFactory(viewCreator)
                    ,{autoSort: true});
            
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
        model: null,
        modelBinder: null,
        template: TEMPLATE_CACHE['template-edit-panel'],
        initialize: function() {
            this.$el.html(this.template);
            this.modelBinder = new Backbone.ModelBinder();
            this.render();
        },
        render: function() {
            
            function strToIntConverter(direction, value) {
                return parseInt(value);
            }
            
            var bindings = {
                'timeBlocksPerAdd': {
                    selector: '#time-blocks-per-add',
                    converter: strToIntConverter
                }
            };
            
            this.modelBinder.bind(this.model.getAppBehaviorController(), this.el, bindings);
            return this;
        },
        close: function() {
        },
        
        // events
        events: {
            'click #button-append-time-blocks': '_appendTimeBlocks',
            'click #button-insert-time-blocks': '_insertTimeBlocks',
            'click #button-delete-time-blocks': '_deleteTimeBlocks'
        },
        
        _appendTimeBlocks: function() {
            var numOfBlocks = this.model.getAppBehaviorController().getTimeBlocksPerAdd();    
            this.model.invoke_appendTimeBlocks(numOfBlocks);
        },
        _insertTimeBlocks: function() {
            this.model.invoke_insertTimeBlocks();
        },
        _deleteTimeBlocks: function() {
            this.model.invoke_deleteSelectedTimeBlocks();
        }
    });
    
    var SaveLoadPanelView = Backbone.View.extend({
        el: '#modals',
        loadPanelTemplate: TEMPLATE_CACHE['template-load-modal'],
        savePanelTemplate: TEMPLATE_CACHE['template-save-modal'],
        initialize: function() {
            this.$el.append(this.loadPanelTemplate);
            this.$el.append(this.savePanelTemplate);
            this.render();
        },
        render: function() {
            return this;
        },
        close: function() {
            this.$el.html('');
        },
        
        events: {
            'click #load-parse-json': '_loadJson',
            'click #load-clear-all': '_clearAllLoad',
            'click #save-get-json': '_getJson',
            'click #save-select-all': '_selectAll',
            'click #save-clear-all': '_clearAllSave'
        },
        
        _loadJson: function() {
            var json = $('#load-raw-json').val();
            this.model.fromJson(json);
        },
        _clearAllLoad: function() {
            $('#load-raw-json').val('');
        },
        
        _getJson: function() {
            $('#save-raw-json').val(this.model.toJson());
        },
        _selectAll: function() {
            $('#save-raw-json').select();
        },
        _clearAllSave: function() {
            $('#save-raw-json').val('');
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
                    return 'display: inline-block;';
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
    
    var KeyButtonsView = Backbone.View.extend({
        el: '#key-buttons',
        undoButton: '#button-undo',
        redoButton: '#button-redo',
        model: null,
        invokerModelBinder: null,
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
        _undo: function(event) {
            this.model.invoke_undo();
        },
        _redo: function(event) {
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
        template: TEMPLATE_CACHE['template-base'],
        // sub-views
        _views: {
            viewControllerView: null,
            keyButtonsView: null,
            editControlPanelView: null,
            saveLoadControlPanelView: null,
            playerControlPanelView: null,
            instrumentControlPanelView: null,
            gridView: null,
        },

        // methods
        initialize: function() {
            this.$el.html(this.template);
            this._views.viewControllerView = new ViewControllerView({model: this.model});
            this._views.keyButtonsView = new KeyButtonsView({model: this.model});
            this._views.editControlPanelView = new EditControlPanelView({model: this.model});
            this._views.saveLoadControlPanelView = new SaveLoadPanelView({model: this.model});
            this._views.playerControlPanelView = new PlayerControlPanelView({model: this.model});
            this._views.instrumentControlPanelView = new InstrumentControlPanelView({model: this.model});
            this._views.gridView = new GridView({model: this.model});
        },
        render: function() {
            var view = null;
            for(view in this._views) {
                if(this._views.hasOwnProperty(view)) {
                    this._views[view].render();
                }
            }
        },
        close: function() {
            var view = null;
            for(view in this._views) {
                if(this._views.hasOwnProperty(view)) {
                    this._views[view].close();
                }
            }
            this.$el.empty();
            this.unbind();
        },
        
        // View getters and setters - expose only what's necessary
        getGridView: function() {
            var gridView = this._views.gridView;
            return gridView;
        }
    });
    
    // Expose api ---------------------------------------
    return {
        VERSION: VERSION,
        // models
        Command: Command,
        Invoker: Invoker,
        Note: Note,
        Notes: Notes,
        Pitch: Pitch,
        Pitches: Pitches,
        Instrument: Instrument,
        Instruments: Instruments,
        Orchestra: Orchestra,
        Player: Player,
        Controller: Controller,
        
        // views
        TopLevelView: TopLevelView
    };
});
SYNTH = SYNTH(jQuery, _, Backbone, MUSIC, Note, Interval, MIDI);


// ================================================================================
// Those are the classes - now we initialize the UI and the application
// ================================================================================

// Op | Document.ready --------------------------------------------------------------------------------
$(document).ready(function() {
    
    SYNTH.app = {
        version: SYNTH.VERSION,
        controller: undefined,
        topView: undefined,
        domCache: {}
    };
    
    SYNTH.app.controller = new SYNTH.Controller({version: SYNTH.app.version}); // Initialize models
    SYNTH.app.topView = new SYNTH.TopLevelView({model: SYNTH.app.controller}); // Initialize top level views
    SYNTH.app.controller.getOrchestra().addNewDefaultInstrument(); // Preconfigure orchestra
    
    // UI ops
    (function() {
        
        function resizeUI() {
            var windowHeight = $(window).height() - 110 - 25;    // 110px #site-top 25px #site-bottom
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
    
    //var foo = SYNTH.app.controller;
    //console.log(foo);
    //console.log(JSON.stringify(foo));
    
    // Scroll syncing
    SYNTH.app.domCache.top = $('#part-top');
    SYNTH.app.domCache.left = $('#part-left');
    $('#grid').scroll(function() {
        SYNTH.app.domCache.top.attr({'style': 'left: ' + (- this.scrollLeft) + 'px'});
        SYNTH.app.domCache.left.attr({'style': 'top: ' + (- this.scrollTop + 170) + 'px'});
    });
    
});

