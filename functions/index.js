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
app.use(bodyParser.urlencoded({ extended: false }))
app.use(cors())

// ยังไม่ deploy ขึ้นทั้งหมด
//register student  

app.post('/register', async (req, res) => {

    const email = req.body.email
    const password = req.body.password
    const extras = {
        name: req.body.firstname + " " + req.body.lastname
    }
    firebase.registerWithEmail(email, password, extras, function (err, result) {
        if (err)
            return console.log(err);
        else
            console.log(result);
    });

    let user_data = {
        firstname: req.body.firstname,
        lastname: req.body.lastname,
        email: req.body.email,
        mobile: req.body.mobile,
        password: req.body.password,
        user_type: req.body.user_type,
        approved_status: "N"
    }

    let user_db = await db.collection('users').add(user_data)
    if (user_db) {
        res.send("Add Success Fully")
    }
    res.end()

})



app.post('/login', (req, res) => {

    const email = req.body.email
    const password = req.body.password

    if (email === undefined || password === undefined) {
        res.send(email + " " + password)
    }
    else {
        firebase.signInWithEmail(email, password, function (err, user) {
            if (err) {
                res.status(401).json({
                    message: "You Are Not Authorized"
                })
            }
            else {
                res.json(user)
            }
        })
    }
})
//ลอง เขียน test relational db

app.get('/join/:user_id', async (req, res) => {

    //parameter user_id จาก url
    const user_id = req.params.user_id
    let snapshot_user = await db.collection('user_registration').where('user_id', '==', user_id).get()
    if (snapshot_user.empty) {
        res.status(404).json({
            message: "No Matching Document"
        })
    }
    else {
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



        return res.status(201).json({
            user_id: user_id,
            results: arr
        })
    }
})

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