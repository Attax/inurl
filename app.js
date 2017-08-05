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
    password: '123456',
    database: 'surl'
};


app.get('/', (req, res) => {
    res.render('index.html');
});
app.get('/favicon.ico', (req, res) => {
    res.end();
});



//短网址跳转
app.get(/^\/([A-Za-z0-9]{1,6})$/, (req, res) => {
    var _surl = req.params[0];

    if (_surl !== 'favicon.ico') {
        //解码url，获取id
        var surlId = surl.URLToId(_surl);


        //连接mysql
        var conn = mysql.createConnection(mysqlOpt);
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
        redis.hget('surl', surlId)
            .then(function(result) {
                /**
                 *  Redis中字段为surl的hash中surlId字段的值
                 */

                if (result == null) {
                    //如果没有查询到，
                    return Promise.resolve(surlId);
                }
                /**
                 * *如果返回了nil,说明此前查询过Redis和MySQL,均不存在该surlId字段，
                 * 且设置该字段在Redis中为nil,则本次直接返回404
                 */
                else if (result == 'nil') {
                    res.end('404');
                    return Promise.reject();
                } else {
                    //有返回值，直接重定向到target页面
                    res.redirect(301, target);
                    res.end();
                    return Promise.reject();
                }

            }, function(err) {
                console.log(err)
            })
            .then(function(surlId) {
                var SQL = 'SELECT target FROM `surl` WHERE uid=' + surlId;

                //执行查询
                conn.query(SQL, function(err, rows, fields) {
                    if (err) {
                        return Promise.reject(err);
                        //释放mysql连接
                        conn.end();
                    } else {
                        console.log('enter', rows)

                        return Promise.resolve(rows);
                        //释放mysql连接
                        conn.end();
                    };
                });

            }, function(err) {
                console.log(err)
            }).catch(function(err) {
                console.log('catch', err)
            })
            .then(function(rows) {
                console.log('testing:', rows)
                    //如果mysql中存在相关数据
                if (rows.length) {
                    var target = rows[0].target;
                    //重定向到相应链接
                    res.redirect(301, target);
                    res.end();
                } else {
                    //写入Redis缓存，设置默认值nil
                    redis.hset('surl', surlId, 'nil')
                        .then(function(result) {
                            return Promise.resolve('设置Redis surl ' + surlId + '字段值为默认值nil成功');
                        }, function(err) {
                            return Promise.resolve({ 'msg': '设置Redis surl ' + surId + '字段值为默认值nil失败', 'Error': err });
                        });

                    res.end('404');
                }
            }, function(err) {
                console.log('debug', err)
            })
            .then(function(val) {
                console.log(val)
            }, function(err) {
                console.log(err)
            }).catch(function(err) {
                console.log(err)
            });


    }

});



app.get('/addurl/', (req, res) => {
    var jsonpName = req.query.callback;
    var queryURL = req.query.url;

    var result = {};
    var data = {};

    var localSiteUrlReg = /^((http|https):\/\/)?localhost\/\w*/
    var urlReg = /(http | ftp | https)/;
    //如果添加的链接存在
    if (queryURL != undefined && queryURL != '') {


        var conn = mysql.createConnection(mysqlOpt);

        var SQL = 'SELECT uid FROM `surl` WHERE target ="' + queryURL + '"';
        //console.log('unde', queryURL)

        var promise = new Promise(function(resolve, reject) {
            conn.query(SQL, (err, rows, fields) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
        //查库，确认是否已经存在相应链接
        promise.then(function(rowsVal) {
            //如果数据库中已经存在相应的连接
            if (rowsVal.length) {
                var uid = rowsVal[0].uid;

                //返回的数据
                result.code = 200;
                result.url = queryURL;
                result.surl = surl.idToURL(uid);

                //如果是jsonp
                if (jsonpName != undefined) {
                    res.end(jsonpName + '(' + JSON.stringify(result) + ')');
                } else {

                    res.json(result);
                    res.end();
                }

                return Promise.reject('跳出promise');

            } else {

                //插入到数据库中
                var InsertSQL = 'INSERT INTO `surl` (target) VALUES ("' + queryURL + '")';

                conn.query(InsertSQL, (err, rows, fields) => {

                    if (err) {
                        return Promise.reject(err);
                    } else {

                        return Promise.resolve(rows);
                    }


                });
            }
        }, function(err) {
            console.log('错误处理:', err);
            res.end();
        }).then(function(rowsVal) {

            //获取自增id
            var uidSQL = 'SELECT LAST_INSERT_ID()';

            conn.query(uidSQL, (err, rows, fields) => {

                if (err) {
                    return Promise.reject(err);
                } else {
                    return Promise.resolve(rows);
                }
            });

        }, function(err) {
            console.log('错误处理:', err);
            res.end();
        }).then(function(rowsVal) {

            if (rowsVal.length) {
                var uid = rowsVal[0]['LAST_INSERT_ID()'];

                //返回的数据
                result.code = 200;
                result.url = queryURL;
                result.surl = surl.idToURL(uid);

                //如果是jsonp
                if (jsonpName != undefined) {
                    res.end(jsonpName + '(' + JSON.stringify(result) + ')');
                } else {
                    res.json(result);
                    res.end();
                }
            } else {
                console.log('没获取到数据库里uid');
            }

            return Promise.reject('跳出promise');

        }, function(err) {
            console.log('错误处理:', err);
            res.end();
        }).catch(function() {

        });


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


/*
app.use((err, req, res, next) => {

    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});
*/