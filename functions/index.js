const functions = require('firebase-functions');
const admin = require('firebase-admin')
var serviceAccount = require("./service_account.json");
const express = require('express')
const firebaseauth = require('firebaseauth')
const config = require('./config')

const firebase = new firebaseauth(config.api_key)


admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://kpscheckin.firebaseio.com"
});

const app = express()
let db = admin.firestore()


// ยังไม่ deploy ขึ้นทั้งหมด
//register student  
app.post('/register', async (req,res) => {
 
    const email = req.body.email
    const password = req.body.password
    const extras = {
        name:req.body.firstname + " " + req.body.lastname
    }
    firebase.registerWithEmail(email, password, extras, async function(err, result) {
        if (err)
            return console.log(err);
        else{
            const user = result.user
            const uid = user.id

            let user_data = {
                id:req.body.id,
                firstname:req.body.firstname,
                lastname:req.body.lastname,
                email:req.body.email,
                mobile:req.body.mobile,
                user_type:req.body.user_type,
                approved_status:"N"
            }
        
            let user_db = await db.collection('users').doc(uid).set(user_data)
            if(user_db){
                res.send("Add Success Fully")
            }
        }
    });
})


app.post('/login',(req,res) => {

    const email = req.body.email
    const password = req.body.password

    firebase.signInWithEmail(email,password,function(err,response){
        if(err){
            return res.status(401).json({
                message:"You are not Authorized Because" + err.message
            })
        }
        else{
            const uid = response.user.id
            db.collection('users').doc(uid).get()
            .then((rec) => {
                return res.status(201).json({
                    token:response.token,
                    user:rec.data()
                })
            })
            .catch(err => {
                console.log(err)
            })
        }
        
    })
})


app.get('/user_login',(req,res) => {
    // const token = req.body.token
    // firebaseauth.getProfile(token,(err,data) => {
    //     if(err) throw err
    //     console.log()
    // })
})
//ลอง เขียน test relational db

app.get('/join/:user_id', async (req,res) => {

    //parameter user_id จาก url
    const user_id = req.params.user_id
    let snapshot_user = await db.collection('user_registration').where('user_id','==',user_id).get()
    if(snapshot_user.empty){
        res.status(404).json({
            message:"No Matching Document"
        })
    }
    else{
        let subject_data = {}
        const promises = []
        snapshot_user.forEach(docs => {
            let subject_id_fk = docs.data().subject_id
            promises.push(db.collection('subjects').doc(subject_id_fk).get())
        })
        const subjects = await Promise.all(promises)
        const arr = []
        subjects.forEach((rec) => {
            if (rec.data() !== undefined) {
                     subject_data = {
                    subject_id: rec.data().subject_id,
                    subject_name: rec.data().subject_name
                }
                arr.push(subject_data)
            }
        })
        return  res.status(201).json({
                user_id:user_id,
                results:arr
         })
    }
})

app.get('/getSubject', async (req,res) => {

    const subject = await db.collection('subjects').get()
    
    const collect = []

    subject.forEach(doc => {
        let sid = doc.id
        collect.push(db.collection('subjects').doc(sid).collection('Time').get())
    })

    const subjects= await Promise.all(collect)
    
    const arr = []

    //  let subject_data = {}
    // subject.forEach(rec => {
    //     subject_data.subject_id = rec.data().subject_id,
    //     subject_data.subject_name = rec.data().subject_name
    //     arr.push(subject_data)
    // })

    subjects.forEach(docs => {
       docs.forEach(rec => {
           let subject_data = {
               time : rec.data()
           }
           arr.push(subject_data)
       })
    })
    res.json(arr)

    // promise.forEach(docs => {
    //     console.log(docs.data())
    // })
  
})

app.get('/users', async (req,res) => {
    let users = []
    let usersRef = db.collection('users');
    let snapshot =  await usersRef.get()
    snapshot.forEach(docs => {
      let user = {
        id:docs.data().id,
        uid : docs.id,
        firstname: docs.data().firstname,
        lastname : docs.data().lastname,
        mobile:docs.data().mobile,
        approved_status:docs.data().approved_status,
        user_type:docs.data().user_type,
        email:docs.data().email
      }
       users.push(user)
    })
    res.status(200).json({
      message:"Success",
      data:users
    })
  })


  app.post('/addYear', async (req,res) => {

    let data = {
        year:req.body.year,
        semester:req.body.semester,
        status:"A"
    }

    let check = await db.collection('semester_year').get()
    if(check.empty){
        db.collection('semester_year').add(data).then(() => {
            res.status(201).json({message:"Add Success"})
        })
        .catch(err => {
            res.status(500).json({message:"Error :" + err})
        })
    }
    else{
        data.status = "D"
        db.collection('semester_year').add(data).then(() => {
            res.status(201).json({message:"Add Success"})
        })
        .catch(err => {
            res.status(500).json({message:"Error :" + err})
        })
    }
  })


  app.get('/getYear',async (req,res) => {

        const collect = []
        let snapshot = await db.collection('semester_year').get()
        snapshot.forEach(rec => {
            let data = {
                id:rec.id,
                status: rec.data().status,
                semester: rec.data().semester,
                year: rec.data().year
            }
            collect.push(data)
        })
        return res.status(201).json({
            data:collect
        })
  })


  app.put('/setyearAvailable',async (req,res) => {

    // const doc_id = req.params.id
    
    const year = []
    let snapshot_year = await db.collection('semester_year').where('status','==',"A").get()
    snapshot_year.forEach(doc => {
        year.push(doc.data())
    })
    // console.log(year.status)
    // // for(let i = 0 ; i < year.length ; i++){
    // //     console.log(i)
    // // }
    res.end()
  })

exports.api = functions.https.onRequest(app)