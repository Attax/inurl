const p1 = new Promise((resolve, reject) => {
    resolve('hello');
});

p1.then(function(res){
    var a=1;

    if(a>10) {
        if(false) {
            return Promise.resolve(199);
        } else {
            return Promise.reject(new Error(0,"Error Demo"));
        }
    } else {
            console.log(10);  
    }

}).then(function(tt) {
        return Promise.resolve(tt);
}, function(bb) {
    
    console.log(bb);
});