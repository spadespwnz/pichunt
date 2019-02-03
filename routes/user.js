var express = require('express');
var router = express.Router();
var utils = require('../utils/utils');
var jwt = require('jsonwebtoken');


router.get('/logout', function(req,res){
	res.clearCookie("token");
	res.redirect('/user/login');
});
router.get('/tokenCheck/:token', function(req,res){
  var token = req.params.token;

  jwt.verify(token, app.get('jwt_secret'), function(err, decoded) {
	    if (err) {
	        return res.send(false);
	    } else {
	        return res.send(true);
	    }
    });

})
router.get('/find/:name', function(req,res){
  var db = req.db;
  var username = req.params.name;
  db.collection(process.env.MONGODB_USER_COLLECTION).findOne({"username":username}, function(err, findResult){
    if (err){
      res.send({"success":false,"err":"Database Error"})
      return;
    }
    if (findResult == null){
      res.send({"success":false,"err":"User not found."})
      return;
    }
    res.send(findResult);
    return;
  });
})
router.post('/signup', function(req, res) {
	var db = req.db;
	var username = req.body.username;
	var pass = req.body.password;
  var salt = utils.genRandomString(16);
	var hash = utils.sha512(pass,salt).passwordHash;
  var user_data = {"username":username, "hash":hash, "salt":salt};
  db.collection(process.env.MONGODB_USER_COLLECTION).findOne({"username":username}, function(err, findResult){
    if (err){
      res.send({"success":false,"err":"Database Error"})
      return;
    }
    if (findResult != null){
      res.send({"success":false,"err":"User Already Exists."})
      return;
    }

    db.collection(process.env.MONGODB_USER_COLLECTION).insert(user_data, function(err, insertResult){
      if (err){
        res.send({"success":false,"err":"Database Error, Account Creation Failed"})
        return;
      }
      var token = jwt.sign({"username":username}, app.get('jwt_secret'), {
        expiresIn: '720h'
      });
      res.cookie('token', token);
      res.send({"success":true, "token": token});
    })

  })
});

router.post('/login', function(req, res) {
	var db = req.db;
	var username = req.body.username;
	var pass = req.body.password;
  db.collection(process.env.MONGODB_USER_COLLECTION).findOne({"username":username}, function(err, findResult){
    if (err){
      res.send({"success":false,"err":"Database Error"})
      return;
    }
    if (findResult == null){
      res.send({"success":false,"err":"User not found."})
      return;
    }
    var salt = findResult.salt;
    var correct_hash = findResult.hash;
    var hash = utils.sha512(pass, salt).passwordHash;
    if (hash == correct_hash){
      var token = jwt.sign({"username":username}, app.get('jwt_secret'), {
        expiresIn: '720h'
      });
      res.cookie('token', token);
      res.send({"success":true, "token": token});
    }
    else{
      res.send({"success":false, "err":"Incorrect Password."});
    }
    return;
  })
});

module.exports = router;
