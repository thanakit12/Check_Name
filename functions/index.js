const functions = require('firebase-functions');
const admin = require('firebase-admin')
var serviceAccount = require("./service_account.json");
const express = require('express')
const firebaseauth = require('firebaseauth')
const config = require('./config')
const bodyParser = require('body-parser')
const cors = require('cors')

const firebase = new firebaseauth(config.api_key)
const app = express()


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://kpscheckin.firebaseio.com"
});

let db = admin.firestore()
app.use(bodyParser.json())
app.use(cors())

//Middle Ware Check Admin permission
const check_admin = (req,res,next) => {
    if(req.headers.token === undefined){
        return res.status(401).json({message:"Please insert token"})
     }
     else{
        const token = req.headers.token
        admin.auth().verifyIdToken(token).then(claim => {
            if(claim.admin === true){
               next()
            }
            else{
                return res.status(403).json({message:"You don't have permission"})
            }
        })
        .catch(err => {
            res.status(500).json({message:"Error: "+ err.message})
        })
     }
}
//register student  

//merge วันที่ 23/1/2020 15.18
app.post('/register', async (req, res) => {

    const email = req.body.email
    const password = req.body.password
    const extras = {
        name: req.body.firstname + " " + req.body.lastname
    }
    firebase.registerWithEmail(email, password, extras, async function(err, result) {
        if (err)
            return res.status(500).json({Error:err.message})
        else{
            const user = result.user
            const uid = user.id
            let customClaims
            let user_data = {
                id:req.body.id,
                firstname:req.body.firstname,
                lastname:req.body.lastname,
                email:req.body.email,
                mobile:req.body.mobile,
                role:req.body.role,
                // approved_status:"N"
            }
            
            if(req.body.role === 'ADMIN'){
                 customClaims = {
                    admin: true
                  };
            }
            else if(req.body.role === 'PROFESSOR'){
                customClaims = {
                    professor:true
                };
            }
            else if (req.body.role === 'NISIT'){
                customClaims = {
                    nisit:true
                }
            }
            else{
                return res.status(500).json({message:"Please insert correct type of user ex. 'ADMIN','PROFESSOR','NISIT'"})
            }

            admin.auth().setCustomUserClaims(uid,customClaims)
            .then(async () => {
                let user_db = await db.collection('users').doc(uid).set(user_data)
                if(user_db){
                    res.status(201).json({message:"Add Success Fully"})
                }
            })
            .catch(err => {
                res.status(500).json({Err: err.message})
            })
        }
    });
})


// เสร็จแล้ววันที่ v.1.0.0 22/1/2020 19.46 
app.post('/login', (req, res) => {

    const email = req.body.email
    const password = req.body.password
    if (email === undefined || password === undefined) {
        res.send("Value is Undefined Eiei")
    }
    else {
        firebase.signInWithEmail(email, password, async function (err, response) {
            if (err) {
                res.status(401).json({
                    message: "You Are Not Authorized Because " + err.message
                })
            }
            else {
                const user = response.user
                const uid = user.id
                await  db.collection('users').doc(uid).get()
                .then(res => {
                     user.role = res.data().role
                })
                .catch(err => {
                    res.status(500).json({message:err.message})
                })
                return res.json({
                    message:'PASS',
                    status:{
                        dataStatus:'SUCCESS'
                    },
                    data:response
                })
               
            }
        })
    }
})

//Admin Service 

app.get('/getUsers',check_admin, async (req,res) => {

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
        role:docs.data().role,
        email:docs.data().email
      }
       users.push(user)
    })
    res.status(200).json({
      message:"Success",
      data:users
    })
  })


app.delete('/deleteUser/:uid',check_admin,(req,res) => {

    const uid = req.params.uid
    admin.auth().deleteUser(uid)
    .then(() => {
        db.collection('users').doc(uid).delete()
        .then(() => {
            return res.status(200).json({
                message:"Delete Success",
                status:{
                    dataStatus:"SUCCESS"
                }
            })
         })
        .catch(err => {
            return res.status(500).json({message:err.message})
       })
    })
    .catch(err => {
        return res.status(500).json({message:err.message})
    })
})










//ลอง เขียน test relational db

// app.get('/join/:user_id', async (req, res) => {

//     //parameter user_id จาก url
//     const user_id = req.params.user_id
//     let snapshot_user = await db.collection('user_registration').where('user_id', '==', user_id).get()
//     if (snapshot_user.empty) {
//         res.status(404).json({
//             message: "No Matching Document"
//         })
//     }
//     else {
//         let subject_data = {}
//         const promises = []
//         snapshot_user.forEach(docs => {
//             let subject_id_fk = docs.data().subject_id
//             promises.push(db.collection('subjects').doc(subject_id_fk).get())
//         })
//         const subjects = await Promise.all(promises)
//         const arr = []
//         subjects.forEach((rec) => {
//             if (rec.data() !== undefined) {
//                 subject_data = {
//                     subject_id: rec.data().subject_id,
//                     subject_name: rec.data().subject_name
//                 }
//                 arr.push(subject_data)
//             }
//         })



//         return res.status(201).json({
//             user_id: user_id,
//             results: arr
//         })
//     }
// })

app.get('/getSubject', async (req, res) => {

    const subject = await db.collection('subjects').get()

    const collect = []

    subject.forEach(doc => {
        let sid = doc.id
        collect.push(db.collection('subjects').doc(sid).collection('Time').get())
    })

    const subjects = await Promise.all(collect)

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
                time: rec.data()
            }
            arr.push(subject_data)
        })
    })
    res.json(arr)

    // promise.forEach(docs => {
    //     console.log(docs.data())
    // })

})

app.get('/users', async (req, res) => {
    let users = []
    let usersRef = db.collection('users');
    let snapshot = await usersRef.get()
    snapshot.forEach(docs => {
        let user = {
            id: docs.id,
            name: docs.data().name,
            surname: docs.data().surname,
            age: docs.data().age
        }
        users.push(user)
    })
    res.status(200).json({
        message: "It is Okay",
        data: users
    })
})

exports.api = functions.https.onRequest(app)