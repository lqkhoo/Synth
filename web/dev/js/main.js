(function($, Backbone, Timbre, MUSIC, MUSIC_Note, MUSIC_Interval, SYNTH) {
    
    // Establish | Variables ---------------------------------------------------------------------------
    SYNTH.models = {}; // Top-level models are held here
    SYNTH.domCache = {};
    
    // Op | Document.ready --------------------------------------------------------------------------------
    $(document).ready(function() {
        
        // Op | Initialize models -----------------------------------------------------------------------------
        SYNTH.controller = new SYNTH.Controller({
            'orchestra': new SYNTH.Orchestra({
                instrumentCollection: new SYNTH.Instruments()
            }),
            'invoker': new SYNTH.Invoker()
        });
        
        // Initialize top level views
        new SYNTH.TopLevelView({model: SYNTH.controller});
        
        // Preconfigure orchestra
        SYNTH.controller.getOrchestra().addNewInstrument('instrument1');
        SYNTH.controller.getOrchestra().addNewInstrument('instrument2');
        
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
                var partHeight = windowHeight - 60; // 60px static top frequency row
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
        SYNTH.domCache.top = $('#part-top');
        SYNTH.domCache.left = $('#part-left');
        $('#part-controls').scroll(function() {
            SYNTH.domCache.top.attr({'style': 'left: ' + (- this.scrollLeft) + 'px'});
            SYNTH.domCache.left.attr({'style': 'top: ' + (- this.scrollTop + 160) + 'px'});
        });
        
    });
}(jQuery, Backbone, T, MUSIC, Note, Interval, SYNTH));

