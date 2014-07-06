(function bootstrap(modules) {
    var todo = Object.keys(modules);
    (function next(api) {
        var module = todo.shift();
        if (module) {
            modules[module](api, function(declarations) {
                api[module] = {};
                Object.keys(declarations).forEach(function(key) {
                    api[module][key] = declarations[key];
                });
                next(api);
            });
        }
    })({});
})({

    dom: function(api, declare) {
        // TODO
    }

});
