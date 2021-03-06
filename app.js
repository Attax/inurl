'use strict';

const path = require('path');
const express = require('express');
const ejs = require('ejs');
const mysql = require('mysql');
const Redis = require('ioredis');

const surl = require('./core.js');


const redis = new Redis();


//创建应用
const app = express();
const router = express.Router();

app.listen(8089);

app.engine('.html', ejs.__express);
app.set('view engine', 'html');
//设置静态目录
app.use(express.static(path.join(__dirname, 'public')));
//更换模板目录
//app.set('views', 'temp');


//定义mysql连接选项
const mysqlOpt = {
    host: 'localhost',
    user: 'root',
    password: '12345678',
    database: 'surl'
};


app.get('/', (req, res) => {
    res.render('index.html');
});
app.get('/favicon.ico', (req, res) => {
    res.end();
});


/**
 *   使用Redis做缓存，减轻MySQL读压力
 */

/**
 *   Redis中使用Hash类型存放mysql的id和target字段的简直对如，{1:http://www.baidu.com/}
 *   设置短连接应用的Hash字段名为surl，  [{1:http://www.baidu.com/},{2:http://www.w3csky.com/}]
 *   先读取Redis中surl的id字段对应的target，如果不存在，则先设置为默认值nil（区分值不存在时返回的null字段），待读取mysql后写入真实值，
 *   或者在mysql也该值的情况下设置值为null，防止缓存穿透
 */

//ioreis支持promise

 //连接mysql
var conn = mysql.createConnection(mysqlOpt);
            

//查询Redis中url的记录
function queryURLRedisRecord(urlId) {
    return redis.hget('surl', urlId).then(function(val){
    	return val;
    },function(error){
    	console.log('redis hget surl error',error);
    });
}

//查询DB中url的记录
function queryURLDBRecord(urlId) {
    var SQL = 'SELECT target FROM `surl` WHERE uid=' + urlId;
    return new Promise(function(resolve, reject) {
        //执行查询
        conn.query(SQL, function(err, rows, fields) {
            if (err) {
                console.log(err)
                reject(err);
            } else {
                console.log('enter', rows)
                resolve(rows);
            };
        });

    });
}

//向redis中写入不存在的url记录
function writeUnexistURLRedisRecord(urlId) {
    return redis.hset('surl', urlId, 'nil').then(function(val){
	    	return val;
	    },function(error){
	    	console.log('redis hset surl error',error)
	    });;
}




//短网址跳转
app.get(/^\/([A-Za-z0-9]{1,6})$/, (req, res) => {
    var _surl = req.params[0];

    if (_surl !== 'favicon.ico') {
        //解码url，获取url的id
        var surlId = surl.URLToId(_surl);

       

  
        (async function() {　
            try {


                var _redisResult = await queryURLRedisRecord(surlId);
                console.log('_redisResult: ',_redisResult)
                //redis中没有记录
                if (_redisResult === undefined) {

                    var _dbResult = await queryURLDBRecord(surlId);

                    if (_dbResult.length) {
                    	console.log('write cache from db inital')
                        var target = _dbResult[0].target;

                        redis.hset('surl', surlId, target);
                        console.log('write cache from db')
                        //重定向到相应链接
                        res.redirect(301, target);
                        res.end();
                    } else {
                        //写入Redis缓存，设置默认值nil
                        redis.hset('surl', surlId, 'nil')
                        res.end('404');
                    }


                }
                /**
                 * 如果返回了nil,说明此前查询过Redis和MySQL,均不存在该surlId字段，
                 * 且设置该字段在Redis中为nil,则本次直接返回404
                 */
                else if (_redisResult == 'nil') {
                    res.end('404');
                } else {
                	console.log('redis 有记录')
                    //redis中有记录，直接重定向到target页面
                    res.redirect(301, _redisResult);
                    res.end();
                }
                console.log('redis output')
            } catch (error) {
                //console.log('catching', error);
           	} finally {
                console.log('finally')
            }


        })();

        console.log('catching');
    }

});




//查询db中是否存在url的记录
function queryURLRecord(queryURL) {
	var SQL = 'SELECT uid FROM `surl` WHERE target ="' + queryURL + '"';
    //console.log('unde', queryURL)
    return new Promise(function(resolve, reject) {
        conn.query(SQL, (err, rows, fields) => {
            if (err) {
                console.log(err)
                reject(err);
            } else {
                resolve(rows);
            }

        });
    })
};



function insertURLRecord(queryURL) {

	//插入到数据库中
	var InsertSQL = 'INSERT INTO `surl` (target) VALUES ("' + queryURL + '")';

    return new Promise(function(resolve, reject) {
        conn.query(InsertSQL, (err, rows, fields) => {
            if (err) {
                console.log(err)
                reject(err);
            } else {
                resolve(rows);
            }
        });

    });
};


function insertURLRedisRecord(urlId, targetURL) {
    //写入Redis缓存，设置默认值nil
  return  redis.hset('surl', urlId, targetURL).then(function(val){
    	return val;
    },function(error){
    	console.log('redis  error',error)
    	
    });
}




app.get('/addurl/', (req, res) => {

    var jsonpName = req.query.callback;
    var queryURL = req.query.url;

    var result = {};
    var data = {};

    var localSiteUrlReg = /^((http|https):\/\/)?localhost\/\w*/
    var urlReg = /(http | ftp | https)/;
    //如果添加的链接存在
    if (queryURL != undefined && queryURL != '') {



      
        //async执行
        (async function() {

            try {
                //db中的url记录
                var urlRows = await queryURLRecord(queryURL);

                if (urlRows.length) {
                    var uid = urlRows[0].uid;

                    //返回的数据
                    result.code = 200;
                    result.url = queryURL;
                    result.surl = surl.idToURL(uid);

                    //如果是jsonp
                    if (jsonpName != undefined) {
                        res.end(jsonpName + '(' + JSON.stringify(result) + ')');
                    } else {

                        res.json(result);
                    }
                } else {
                    var _insertResult = await insertURLRecord(queryURL);
                    var _insertRedisResult = await insertURLRedisRecord(_insertResult.insertId, queryURL)
                    console.log('redis', _insertRedisResult)
                        //返回的数据
                    result.code = 200;
                    result.url = queryURL;
                    result.surl = surl.idToURL(_insertResult.insertId);

                    console.log(result.surl)

                    //如果是jsonp
                    if (jsonpName != undefined) {
                        res.end(jsonpName + '(' + JSON.stringify(result) + ')');
                    } else {
                        res.json(result);
                    }
                }

            } catch (error) {
                console.log('catching', error);
                //console.log('catching');
            } finally {
                console.log('finally')
            }



        })();


    } else {
        data.code = 404;
        data.result = null;
        console.log('链接缺失')
        res.end('data.code: ' + data.code);
    }


});



//404

app.get('*', (req, res) => {
    res.status(404).send('404');
});



app.use((err, req, res, next) => {

    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});