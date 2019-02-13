var express = require('express');
var router = express.Router();
var jwt = require('jsonwebtoken');
var fs = require('fs');
var uid = require('mongodb').ObjectID;

var aws = require('aws-sdk');
const S3_BUCKET = process.env.S3_BUCKET || 'spades-image-collection';
var aws_secret;
var aws_id;
const INVALID_TOKEN = 201;
const DATABASE_ERROR = 202;

aws.config.update({
	accessKeyId: process.env.AWS_ACCESS_KEY_ID,
	secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});


router.get('/clearAll', function(req,res){
  var db = req.db
  db.collection(process.env.MONGODB_PICTURE_COLLECTION).drop();
	db.collection(process.env.MONGODB_USER_COLLECTION).drop();
	db.collection(process.env.MONGODB_PICTURE_COLLECTION).createIndex({loc:"2dsphere"})
	res.send("Cleared All Collections")
})
router.get('/picturelist', function(req,res){
  var db = req.db
  db.collection(process.env.MONGODB_PICTURE_COLLECTION).find().toArray(function(err, cursor){
    if (err) {
			res.send("Error");
		}
    else{
      res.send(cursor)
    }
  })
})
router.get('/picturelist/:picture', function(req,res){
  var db = req.db
	var picture = new uid(req.params.picture);

  db.collection(process.env.MONGODB_PICTURE_COLLECTION).find({_id:picture}).toArray(function(err, cursor){
    if (err) {
			res.send("Error");
		}
    else{
      res.send(cursor)
    }
  })
})

router.get('/userlist', function(req,res){
  var db = req.db
  db.collection(process.env.MONGODB_USER_COLLECTION).find().toArray(function(err, cursor){
    if (err) {
			res.send("Error");
		}
    else{
      res.send(cursor)
    }
  })
})

router.get('/userlist/:username', function(req,res){
  var db = req.db
	var username = req.params.username
  db.collection(process.env.MONGODB_USER_COLLECTION).find({username:username}).toArray(function(err, cursor){
    if (err) {
			res.send("Error");
		}
    else{
      res.send(cursor)
    }
  })
})


router.use(function(req,res,next){
	var token = req.body.token || req.query.token || req.params.token
	if (token){
		jwt.verify(token, app.get('jwt_secret'), function(err, decoded) {
		    if (err) {
		        return res.send({"success":false, "code":INVALID_TOKEN,"err":"Please log in."})
		    } else {
		        req.decoded = decoded;
		        next();
		    }
		});
	}
	else{
		 return res.send({"success":false, "code":INVALID_TOKEN,"err":"Please log in."})
	}
});

router.post('/find_nearby_hunts',function(req,res){
	var db=req.db;
	var username = req.decoded.username;
	var returnData = {"code":0};
	var lat = req.body.lat;
	var lng = req.body.lng;
	/*
	db.collection(process.env.MONGODB_PICTURE_COLLECTION)
	.find(
		{loc:{ $geoWithin: { $centerSphere:[ [parseFloat(lng), parseFloat(lat)],5/6378.1 ] }},
		, owner:{ "$ne":username }}
	)*/
	db.collection(process.env.MONGODB_PICTURE_COLLECTION)
		.aggregate(
		[
			{
				$geoNear: {
					near: {type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)]},
					distanceField: "dist.calculated",
					maxDistance: 5000,
					spherical: true
				}
			},
			{
				$match:{
					owner:{"$ne":username}
				}
			},
			{
				$match:{
					"captured_by.username":{"$ne":username}
				}
			},

		]
		)

	.toArray(function(err, cursor){
		if (err) {
			console.log(err)
			returnData.success = false;
			returnData.err = "Internal Database Error."
			res.send(returnData);
		}
    else{
			console.log("Docs Found: "+cursor.length)
			returnData.success = true;
			returnData.data = cursor;
      res.send(returnData);
    }
	});

});
router.post('/capture_hunt', function(req,res){
	var db = req.db;
	var username = req.decoded.username;
	console.log("Username: "+username);
	console.log(req.body);
	var returnData = {"code":0};
	var pic_uid = new uid(req.body._id);
	db.collection(process.env.MONGODB_PICTURE_COLLECTION).findOne({_id:pic_uid}, function(err, searchResult){
		if (err != null){
			returnData.code = DATABASE_ERROR
			returnData.err = "Internal Database Error";
			returnData.err2 = err;
			returnData.success = false;
			res.send(returnData);
			return;
		}
		var timestamp = new Date();
		db.collection(process.env.MONGODB_USER_COLLECTION).update({"username":username},{"$push":{captures:{capture_time: timestamp, capture_id: pic_uid, _id: new uid()}}} )
		db.collection(process.env.MONGODB_PICTURE_COLLECTION).update({_id:pic_uid},{"$push":{captured_by:{capture_time: timestamp, username:username}}} )
		returnData.success = true;
		returnData.id = pic_uid;
		console.log(searchResult);
		res.send(returnData);
	})

});
router.get('/my_pictures', function(req,res){
	var db = req.db;
	var username = req.decoded.username;
	var returnData = {"code":0};
	db.collection(process.env.MONGODB_PICTURE_COLLECTION).find({owner:username}).toArray(function(err, cursor){
    if (err) {
			returnData.success = false;
			returnData.err = "Internal Database Error."
			res.send(returnData);
		}
    else{
			returnData.success = true;
			returnData.data = cursor;
      res.send(returnData);
    }
  })
})
router.get('/my_captured_hunts', function(req,res){
	var db = req.db;
	var username = req.decoded.username;
	var returnData = {"code": 0};
	db.collection(process.env.MONGODB_USER_COLLECTION).findOne({username:username}, function(err, userData){
    if (err) {
			returnData.success = false;
			returnData.err = "Internal Database Error."
			returnData.code = 202;
			res.send(returnData);
			return;
		}
		if (userData == null){
			returnData.success = false;
			returnData.err = "Internal Database Error."
			returnData.code = 202;
			res.send(returnData)
			return;
		}
		var captured_list;
		if (userData.captures == null){
			captured_list = [];
		} else{
			 captured_list = userData.captures.map(function(item){
				return new uid(item.capture_id);
			})
		}

		db.collection(process.env.MONGODB_PICTURE_COLLECTION).find({_id:{$in:captured_list}}).toArray(function(err, cursor){
			if (err) {
				returnData.success = false;
				returnData.err = "Internal Database Error."
				returnData.code = 202;
				res.send(returnData);
				return;
			}

			returnData.success = true;
			returnData.data = cursor;
	    res.send(returnData);
		})




  })
})

router.post('/new_picture', function(req,res){
  var db = req.db;
  var lat = req.body.lat;
  var lng = req.body.lng;
  var file = req.body.file;
	var returnData = {"code":0};
	var username = req.decoded.username;
	var id = new uid();
  getSign(file,username, id, function(sign){
    if (sign.success == false){
      returnData.success = false;
      returnData.err = "Error Generating Image Sign"
    } else{
      returnData.success = true;
      returnData.haveTask = true;
      returnData.task = "upload_image";
      returnData.sign = sign.signedRequest;
      image_url = sign.url;
      db.collection(process.env.MONGODB_PICTURE_COLLECTION).insert( {"_id":id,"url":image_url, "owner":username,"lat": lat, "lng":lng, loc: {type:"Point", coordinates: [parseFloat(lng),parseFloat(lat)]}, time_created: new Date()}, function(err, records){
				if (records == null){
					console.log(err)
					return
				}
				console.log(records.ops[0]);

				db.collection(process.env.MONGODB_USER_COLLECTION).update({"username":username},{"$push":{pictures:records.ops[0]._id}})
      });

      res.send(JSON.stringify(returnData))
    }
  });
});
function getSign(fname,user,id, callback){
  ftype = 'image/jpg'
  var s3 = new aws.S3({signatureVersion: 'v4'});
  /*if (!process.env){
    s3.accessKeyId(aws_id);
    s3.secretAccessKey(aws_secret);
  }*/
  const s3_params = {
    Bucket: S3_BUCKET,
    Key: 'pichunt/images/'+user+"/"+id,
    Expires: 60,
    ContentType: ftype,
    ACL: 'public-read'
  };

  s3.getSignedUrl('putObject', s3_params, function(err, data){
    var returnData = {};
    if (err){
      console.log(err);
      //res.send({success:'false', err: err})
      returnData = {
        success: false
      }
    }
    else{
      returnData = {
        signedRequest: data,
        url: 'https://'+S3_BUCKET+'.s3.amazonaws.com/'+'pichunt/images/'+user+"/"+id,
        fname: fname,
        relative_url: 'pichunt/images/'+user+"/"+id,
        success: true
      };
      //res.write(JSON.stringify(returnData));
      //res.end();

    }
    callback(returnData);
  });
}

module.exports = router;
