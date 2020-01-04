const functions = require('firebase-functions');
const admin = require('firebase-admin')
var serviceAccount = require("./service_account.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://kpscheckin.firebaseio.com"
});

const express = require('express')
const app = express()
let db = admin.firestore()

//register student 
app.post('/register',(req,res) => {
    let data = {
        firstname:req.body.firstname,
        lastname:req.body.lastname,
        email:req.body.email,
        mobile:req.body.mobile,
        password:req.body.password,
        user_type:req.body.user_type,
        // status:null
        status:req.body.approved_status
    }
    //ยังไม่ deploy ของจริง
    console.log(data)
    db.collection('users').add(data).then(() => {
        return res.status(201).json({
            message:"You are Add Successfully"
        })
    }).catch(err => {
        return res.status(500).json({
            message:"Error because " + err
        })
    })
})

//ลอง เขียน test relational db

app.get('/join', async (req,res) => {

    let obj = []
    let user_regis = await db.collection('user_registration').where('user_id','==','1').get()
    if(user_regis.empty){
        res.status(404).json({
            message:"No Matching Document"
        })
    }
    else{
        user_regis.forEach( async user_data => {
            let subject_id = user_data.data().subject_id
            let query_subject = await db.collection('subjects').doc(subject_id).get()
            obj.push({
                user_id:user_data.data().user_id,
                subject:query_subject.data()
            })
            res.json(obj)
        })
    }
  
  
   // res.end()
})

exports.api = functions.https.onRequest(app)