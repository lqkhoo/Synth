var Tests = function($, _, Backbone, MUSIC, MUSIC_Note, MUSIC_Interval, MIDI) {
    "use strict";
    // utility functions
    
    function getNumOfAttributes(model) {
        var num = 0;
        for(var attr in model.attributes) {
            if(model.attributes.hasOwnProperty(attr)) {
                num += 1;
            }
        }
        return num;
    }
    
    // tests
    
    //TODO - Command
    
    //TODO - Invoker
    
    this.Note = function() {
        module('Note');
        
        function setup() {
            var model = new SYNTH.Note();
            return model;
        };
        // no teardown
        
        test('defaults', function() {
            var model = setup();
            equal(getNumOfAttributes(model), 3);
            equal(model.get('id'), null);
            equal(model.get('value'), 1);
            equal(model.get('beat'), null);
        });
        
        test('getTime()', function(assert) {
            var model = setup();
            equal(model.getTime(), model.get('id'));
            equal(model.get('time'), undefined);
        });
        
        test('setTime()', function() {
            var model = setup();
            var val = 3;
            equal(model.setTime(val), val);
            equal(model.get('id'), val);
        });
        
        test('getValue()', function() {
            var model = setup();
            equal(model.getValue(), model.get('value'));
        });
        
        test('setValue()', function() {
            var model = setup();
            var val = 3;
            equal(model.setValue(val), val);
            equal(model.get('value'), val);
        });
        
        test('getBeat()', function() {
            var model = setup();
            equal(model.getBeat(), model.get('beat'));
        });
        
        test('setBeat()', function() {
            var model = setup();
            var val = 3;
            equal(model.setBeat(val), val);
            equal(model.get('beat'), val);
        });
    };
    
    this.Pitch = function() {
        module('Pitch');
        
        function setup() {
            var model = new SYNTH.Pitch();
            return model;
        };
        // no teardown
        
        test('defaults', function() {
            var model = setup();
            equal(getNumOfAttributes(model), 5);
            equal(model.get('id'), null);
            equal(model.get('isPlayableArray'), null);
            equal(model.get('notes'), null);
            equal(model.get('isPlayed'), true);
            equal(model.get('isSelected'), false);
        });
        
        test('getId()', function() {
            var model = setup();
            equal(model.getId(), model.get('id'));
        });
        
        test('setId()', function() {
            var model = setup();
            var val = 3;
            equal(model.setId(3), val);
            equal(model.get('id'), val);
        });
        
        test('getIsPlayableArray()', function() {
            var model = setup();
            equal(model.getIsPlayableArray(), model.get('isPlayableArray'));
        });
        
        test('setIsPlayableArray()', function() {
            var model = setup();
            var val = [1,2,3];
            equal(model.setIsPlayableArray(val), val);
            equal(model.get('isPlayableArray'), val);
        });
        
        test('getNoteCollection()', function() {
            var model = setup();
            equal(model.getNoteCollection(model), model.get('noteCollection'));
        });
        
        test('setNoteCollection()', function() {
            var model = setup();
            var val = new SYNTH.Notes();
            equal(model.setNoteCollection(val), val);
            equal(model.get('noteCollection'), val);
        });
        
        test('getNotes()', function() {
            var model = setup();
            model.setNoteCollection(new SYNTH.Notes);
            equal(model.getNotes(), model.getNoteCollection().models);
        });
        
        test('getIsPlayed()', function() {
            var model = setup();
            equal(model.getIsPlayed(), model.get('isPlayed'));
        });
        
        test('setIsPlayed()', function() {
            var model = setup();
            var val = false;
            equal(model.setIsPlayed(val), val);
            equal(model.get('isPlayed'), val);
        });
        
        test('getIsPlayed()', function() {
            var model = setup();
            equal(model.getIsPlayed(), model.get('isPlayed'));
        });
        
        test('setIsSelected()', function() {
            var model = setup();
            var val = true;
            equal(model.setIsSelected(val), val);
            equal(model.get('isSelected'), val);
        });
        
        //TODO
        //setMaskMethods();
        
    };
    
    //TODO - SoundGenerator
    
    //TODO - TimeUnit
    
    this.Instrument = function() {
        module('Instrument');
        
        function setup() {
            var model = new SYNTH.Instrument();
            return model;
        };
        
        test('defaults', function() {
            var model = setup();
            equal(getNumOfAttributes(model), 8);
            equal(model.get('id'), null);
            equal(model.get('name'), '(unnamed)');
            equal(model.get('orchestra'), null);
            equal(model.get('pitchCollection'), null);
            equal(model.get('soundGenerator'), null);
            equal(model.get('volume'), 1);
            equal(model.get('isMuted'), false);
            equal(model.get('isSelected'), false);
        });
        
        test('getId()', function() {
            var model = setup();
            equal(model.getId(), model.get('id'));
        });
        
        test('setId()', function() {
            var model = setup();
            var val = 3;
            equal(model.setId(val), val);
            equal(model.get('id'), val);
        });
        
        test('getName()', function() {
            var model = setup();
            equal(model.getName(), model.get('name'));
        });
        
        test('setName()', function() {
            var model = setup();
            var val = 'newName';
            equal(model.setName(val), val);
            equal(model.get('name'), val);
        });
        
        test('getId()', function() {
            var model = setup();
            equal(model.getId(), model.get('id'));
        });
        
        test('getOrchestra()', function() {
            var model = setup();
            equal(model.getOrchestra(), model.get('orchestra'));
        });
        
        test('setOrchestra()', function() {
            var model = setup();
            var val = new SYNTH.Orchestra();
            equal(model.setOrchestra(val), val);
            equal(model.get('orchestra'), val);
        });
        
        test('getPitchCollection()', function() {
            var model = setup();
            equal(model.getPitchCollection(), model.get('pitchCollection'));
        });
        
        test('setPitchCollection()', function() {
            var model = setup();
            var val = new SYNTH.Pitches();
            equal(model.setPitchCollection(val), val);
            equal(model.get('pitchCollection'), val);
        });
        
        test('getSoundGenerator()', function() {
            var model = setup();
            equal(model.getSoundGenerator(), model.get('soundGenerator'));
        });
        
        test('setSoundGenerator()', function() {
            var model = setup();
            var val = new SYNTH.SoundGenerator();
            equal(model.setSoundGenerator(val), val);
            equal(model.get('soundGenerator'), val);
        });
        
        test('getVolume()', function() {
            var model = setup();
            equal(model.getVolume(), model.get('volume'));
        });
        
        test('setVolume()', function() {
            var model = setup();
            var val = 0.5;
            equal(model.setVolume(val), val);
            equal(model.get('volume'), val);
        });
        
        test('getIsMuted()', function() {
            var model = setup();
            equal(model.getIsMuted(), model.get('isMuted'));
        });
        
        test('setIsMuted()', function() {
            var model = setup();
            var val = true;
            equal(model.setIsMuted(val), val);
            equal(model.get('isMuted'), val);
        });
        
        test('getIsSelected()', function() {
            var model = setup();
            equal(model.getIsSelected(), model.get('isSelected'));
        });
        
        test('setIsSelected()', function() {
            var model = setup();
            var val = true;
            equal(model.setIsSelected(val), val);
            equal(model.get('isSelected'), val);
        });
    };
    
    //TODO
    this.Orchestra = function() {
        module('Orchestra');
        
        
    };
    
    this.Controller = function() {
        module('Controller');
        
        function setup() {
            var model = new SYNTH.Controller({
                'orchestra': new SYNTH.Orchestra(),
                'invoker': new SYNTH.Invoker()
            });
            return model;
        };
        // no teardown
        
        test('defaults', function() {
            var orchestra = new SYNTH.Orchestra();
            var invoker = new SYNTH.Invoker();
            var model = new SYNTH.Controller({
                'orchestra': orchestra,
                'invoker': invoker
            });
            equal(getNumOfAttributes(model), 2);
            equal(model.get('orchestra'), orchestra);
            equal(model.get('invoker'), invoker);
        });
        
        test('getOrchestra()', function() {
            var model = setup();
            equal(model.getOrchestra(), model.get('orchestra'));
        });
        
        test('getInvoker()', function() {
            var model = setup();
            equal(model.getInvoker(), model.get('invoker'));
        });
        
        //TODO methods
    };
    
    
    
    
    // run tests -------------------------------------------------------
    this.runAll = function() {
        for(var test in this) {
            if(this.hasOwnProperty(test)) {
                if(typeof(this[test]) === 'function' && test !== 'runAll') {
                    this[test]();
                }
            }
        }
    };
    
};

Tests(jQuery, _, Backbone, MUSIC, Note, Interval, MIDI).runAll();


