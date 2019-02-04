//Setup Requirements for App
var express = require('express');
require('dotenv').config();
app = express();
var http = require('http').Server(app);
var fs = require('fs');
var MongoClient = require('mongodb').MongoClient;
var database;
var mdb_url = process.env.MONGODB_URI;

var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var busboy = require('connect-busboy');
var jwt = require('jsonwebtoken');


app.use(busboy());
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({limit: '50mb'}))
app.use(cookieParser())
app.set('jwt_secret', process.env.JWT_SECRET || 'randosecretkey');

//Enable MongoDB
console.log("MONGO URL:"+mdb_url)
MongoClient.connect(mdb_url, function(err,client){
  if (err){
    console.log(err)
    return
  }
  database = client.db(process.env.MONGODB_DB);
});
app.use(function(req,res,next){
    req.db = database;

    next();
});

//Setup Routes
var home = require('./routes/home.js');
app.use('/',home)

fs.readdirSync(__dirname+'/routes').forEach(function(file){
  name = file.slice(0,-3);
  var temp = require('./routes/'+name)
  app.use('/'+name, temp)
})

//Start Server
var webServer = http.listen(process.env.PORT || 3000, function(){
  console.log("Listening...")
});
