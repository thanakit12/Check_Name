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
const check_admin = (req, res, next) => {
    if (req.headers.token === undefined) {
        return res.status(401).json({ message: "Please insert token" })
    }
    else {
        const token = req.headers.token
        admin.auth().verifyIdToken(token).then(claim => {
            if (claim.admin === true) {
                next()
            }
            else {
                return res.status(403).json({ message: "You don't have permission" })
            }
        })
            .catch(err => {
                res.status(500).json({ message: "Error: " + err.message })
            })
    }
}

const permission_professor = (req, res, next) => {
    if (req.headers.token === undefined) {
        return res.status(401).json({ message: "Please insert token" })
    }
    else {
        const token = req.headers.token
        admin.auth().verifyIdToken(token).then(claim => {
            if (claim.professor === true) {
                req.name = claim.name
                req.user_id = claim.user_id
                next()
            }
            else {
                return res.status(403).json({ message: "You don't have permission" })
            }
        })
            .catch(err => {
                res.status(500).json({ message: "Error: " + err.message })
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
    firebase.registerWithEmail(email, password, extras, async function (err, result) {
        if (err)
            return res.status(500).json({ Error: err.message })
        else {
            const user = result.user
            const uid = user.id
            let customClaims
            let user_data = {
                id: req.body.id,
                firstname: req.body.firstname,
                lastname: req.body.lastname,
                email: req.body.email,
                mobile: req.body.mobile,
                role: req.body.role,
                // approved_status:"N"
            }

            if (req.body.role === 'ADMIN') {
                customClaims = {
                    admin: true
                };
            }
            else if (req.body.role === 'LECTURER') {
                customClaims = {
                    professor: true
                };
            }
            else if (req.body.role === 'STUDENT') {
                customClaims = {
                    nisit: true
                }
            }
            else {
                return res.status(500).json({ message: "Please insert correct type of user ex. 'ADMIN','LECTURER','STUDENT'" })
            }

            admin.auth().setCustomUserClaims(uid, customClaims)
                .then(async () => {
                    let user_db = await db.collection('users').doc(uid).set(user_data)
                    if (user_db) {
                        res.status(201).json({
                            message: "Add Success Fully",
                            status: {
                                dataStatus: "SUCCESS"
                            }
                        })
                    }
                })
                .catch(err => {
                    res.status(500).json({ Err: err.message })
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
                    message: "You are not authorized because " + err.message
                })
            }
            else {
                const user = response.user
                const uid = user.id
                await db.collection('users').doc(uid).get()
                    .then(res => {
                        user.role = res.data().role
                    })
                    .catch(err => {
                        res.status(500).json({ message: err.message })
                    })
                return res.json({
                    message: 'PASS',
                    status: {
                        dataStatus: 'SUCCESS'
                    },
                    data: response
                })

            }
        })
    }
})

//Admin Service 

app.get('/getUsers', check_admin, async (req, res) => {

    let users = []
    let usersRef = db.collection('users');
    let snapshot = await usersRef.get()
    snapshot.forEach(docs => {
        let user = {
            id: docs.data().id,
            uid: docs.id,
            firstname: docs.data().firstname,
            lastname: docs.data().lastname,
            mobile: docs.data().mobile,
            approved_status: docs.data().approved_status,
            role: docs.data().role,
            email: docs.data().email
        }
        users.push(user)
    })
    res.status(200).json({
        message: "Success",
        status: {
            dataStatus: "SUCCESS"
        },
        data: users
    })
})


app.delete('/deleteUser/:uid', check_admin, (req, res) => {

    const uid = req.params.uid
    admin.auth().deleteUser(uid)
        .then(() => {
            db.collection('users').doc(uid).delete()
                .then(() => {
                    return res.status(200).json({
                        message: "Delete Success",
                        status: {
                            dataStatus: "SUCCESS"
                        }
                    })
                })
                .catch(err => {
                    return res.status(500).json({ message: err.message })
                })
        })
        .catch(err => {
            return res.status(500).json({ message: err.message })
        })
})

app.get('/getProfile', async (req, res) => {

    if (req.headers.token !== undefined) {
        const token = req.headers.token
        admin.auth().verifyIdToken(token)
            .then(claim => {
                const user_id = claim.user_id
                return user_id
            })
            .then(doc_id => {
                db.collection('users').doc(doc_id).get()
                    .then(doc => {
                        if (doc.exists) {
                            return res.status(200).json({
                                message: "Success",
                                status: {
                                    dataStatus: "SUCCESS"
                                },
                                data: doc.data()
                            })
                        }
                        else {
                            return res.status(404).json({
                                message: "NoT Found Document"
                            })
                        }
                    })
                    .catch(err => {
                        return res.status(500).json({
                            message: err.message,
                        })
                    })
            })
            .catch(err => {
                return res.status(500).json({
                    message: err.message
                })
            })
    }
    else {
        res.status(401).json({
            message: "Please Insert Token "
        })
        return;
    }
})

app.put('/updateUser', (req, res) => {

    if (req.headers.token !== undefined) {
        const token = req.headers.token
        admin.auth().verifyIdToken(token)
            .then(claim => {
                const user_id = claim.user_id
                return user_id
            })
            .then(uid => {
                const data = {
                    email: req.body.email,
                    name: req.body.firstname + " " + req.body.lastname,
                }
                admin.auth().updateUser(uid, data)
                    .then(() => {
                        db.collection('users').doc(uid).update({
                            id: req.body.id,
                            email: req.body.email,
                            firstname: req.body.firstname,
                            lastname: req.body.lastname,
                            mobile: req.body.mobile
                        })
                            .then(() => {
                                return res.status(200).json({
                                    message: "Update Success",
                                    status: {
                                        dataStatus: 'SUCCESS'
                                    }
                                })
                            })
                            .catch(err => {
                                return res.status(500).json({
                                    message: err.message
                                })
                            })
                    })
                    .catch(err => {
                        return res.status(500).json({
                            message: err.message
                        })
                    })
            })
            .catch(err => {
                return res.status(500).json({
                    message: err.message
                })
            })
    }
    else {
        return res.status(401).json({
            message: "Please Insert token"
        })
    }
})


const check_admin_professor = (req, res, next) => {

    if (req.headers.token !== undefined) {
        const token = req.headers.token
        admin.auth().verifyIdToken(token)
            .then(claim => {
                if (claim.admin === true || claim.professor === true) {
                    req.name = claim.name
                    req.claim = claim
                    req.uid = claim.uid
                    next()
                }
                else {
                    res.status(403).json({
                        message: "You don't granted permission"
                    })
                    return;
                }
            })
            .catch(err => {
                return res.status(500).json({
                    message:err.message
                })
            })
    }
    else {
        return res.status(401).json({
            message: "Please Insert Token"
        })
    }
}
//Create Subject  //แก้ v.1.0.1 30/1/2020
app.post('/createSubject', check_admin_professor, async (req, res) => {

    let subject;
    if (req.claim.professor === true) {
        subject = {
            year: req.body.year,
            semester: req.body.semester,
            subject_code: req.body.subject_code,
            subject_name: req.body.subject_name,
            approved_status: "PENDING",
            creater_name: req.name,
            uid: req.uid
        }
    }
    else {
        subject = {
            year: req.body.year,
            semester: req.body.semester,
            subject_code: req.body.subject_code,
            subject_name: req.body.subject_name,
            approved_status: "APPROVE",
            creater_name: req.name,
            uid: req.uid
        }
    }
    const snapshot_subject = await db.collection('subjects').add(subject)
    if (snapshot_subject) {
        return res.status(201).json({
            message: "Create Subject Success",
            status: {
                dataStatus: "SUCCESS"
            }
        })
    }
})

//getSubject // ลบสิทธิ์ admin
app.get('/getSubjectsApprove', async (req, res) => {

    const snapshot_subjects = await db.collection('subjects').get()
    const subjects = []
    if (snapshot_subjects.empty) {
        return res.status(404).json({
            message: "No Document"
        })
    }
    snapshot_subjects.forEach(doc => {
        subjects.push({
            id: doc.id,
            year: doc.data().year,
            semester: doc.data().semester,
            subject_code: doc.data().subject_code,
            subject_name: doc.data().subject_name,
            approved_status: doc.data().approved_status
        })
    })
    return res.status(200).json({
        message: "Get Success",
        status: {
            dataStatus: "SUCCESS"
        },
        data: subjects
    })
})

//Deploy 27/1/2020
//admin approve subject
app.put('/approve/:id', check_admin, (req, res) => {

    const subject_id = req.params.id
    db.collection('subjects').doc(subject_id).update({
        approved_status: "APPROVE"
    })
        .then(() => {
            return res.status(200).json({
                message: "Approve Success",
                status: {
                    dataStatus: "SUCCESS"
                }
            })
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })
})

//Admin Reject 

app.put('/reject/:id', check_admin, (req, res) => {

    const subject_id = req.params.id
    db.collection('subjects').doc(subject_id).update({
        approved_status: "REJECT"
    })
        .then(() => {
            return res.status(200).json({
                message: "Reject Success",
                status: {
                    dataStatus: "SUCCESS"
                }
            })
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })
})

//Admin Approve multi v.1.0.0
app.put('/approveMulty', check_admin, async (req, res) => {

    const approve_ids = req.body.approve_ids
    for (let i = 0; i < approve_ids.length; i++) {
        db.collection('subjects').doc(approve_ids[i]).update({
            approved_status: "APPROVE"
        })
    }
    return res.status(200).json({
        message: "Approve Success",
        status: {
            dataStatus: "SUCCESS"
        }
    })
})

//rejectMulty v.1.0.0
app.put('/rejectMulty', check_admin, async (req, res) => {

    const reject_ids = req.body.reject_ids
    for (let i = 0; i < reject_ids.length; i++) {
        db.collection('subjects').doc(reject_ids[i]).update({
            approved_status: "REJECT"
        })
    }
    return res.status(200).json({
        message: "Reject Success",
        status: {
            dataStatus: "SUCCESS"
        }
    })
})


//Open section  Deploy 27/1/2020

app.post('/subject_register', permission_professor, (req, res) => {

    const time = []
    if (req.body.Time.length > 0) {
        for (let i = 0; i < req.body.Time.length; i++) {
            time.push(req.body.Time[i])
        }
    }
    const data = {
        Year: {
            year: req.body.year,
            semester: req.body.semester
        },
        Subject: {
            subject_code: req.body.Subject.subject_code,
            subject_name: req.body.Subject.subject_name,
            approved_status: req.body.Subject.approved_status
        },
        section_number: req.body.section_number,
        time_late: req.body.time_late,
        time_absent: req.body.time_absent,
        total_mark: req.body.total_mark,
        teacher_name: req.name,
        teacher_id: req.user_id,
        status: 'ACTIVE'
    }
    console.log(req.user_id)
    data.Time = time
    db.collection('section_subject').add(data)
        .then(() => {
            return res.status(201).json({
                message: "Add Success",
                status: {
                    dataStatus: "SUCCESS"
                }
            })
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })
})

//Professor get subjects
app.get('/getSubjects', permission_professor, async (req, res) => {

    const subjects = []
    const snapshot_subject = await db.collection('section_subject').where('teacher_id', '==', req.user_id).get()
    if (snapshot_subject.empty) {
        return res.status(404).json({
            message: "No Matching Document"
        })
    }
    snapshot_subject.forEach(doc => {
        subjects.push({
            id: doc.id,
            Year: doc.data().Year,
            section_number: doc.data().section_number,
            Subject: doc.data().Subject,
            Time: doc.data().Time,
            time_absent: doc.data().time_absent,
            time_late: doc.data().time_late,
            total_mark: doc.data().total_mark,
            status: doc.data().status
        })
    })
    return res.status(200).json({
        message: "Get Success",
        status: {
            dataStatus: "SUCCESS"
        },
        data: subjects
    })
})


//CRUD_YEAR V.1.0 

app.get('/getYear', check_admin, (req, res) => {

   const promise = db.collection('semester_year').get()
   let payload;
   const semester_year = []
   promise.then(result => {
       result.forEach(doc => {
           payload = {
               id:doc.id,
               year:doc.data().year,
               semester:doc.data().semester,
               status:doc.data().status
           }
           semester_year.push(payload)
       })
       return res.status(200).json({
           message:"get Year Success",
           status:{
               dataStatus:'SUCCESS'
           },
           data:semester_year
       })
   })
   promise.catch(err => {
       return res.status(500).json({
           message:err.message
       })
   })
})

app.get('/getCurrentYear',check_admin_professor, async (req, res) => {

    const snapshot = await db.collection('semester_year').where('status', '==', 'ACTIVE').get()
    let payload;
    if (snapshot.empty) {
        return res.status(404).json({
            message: "No Document ...."
        })
    }
    else {
        snapshot.forEach(result => {
            payload = {
                id: result.id,
                year: result.data().year,
                semester: result.data().semester,
                status: result.data().status
            }
        })
    }

    return res.status(200).json({
        message: "Get Success",
        status: {
            dataStatus: 'SUCCESS'
        },
        data: payload
    })
})

app.post('/AddYear',check_admin,(req,res) => {

    const promise_year = db.collection('semester_year').get()
    promise_year.then(result => {
        if(result.empty){
           const add =  db.collection('semester_year').add({
                year:req.body.year,
                semester:req.body.semester,
                status:'ACTIVE'
            })
            add.then(() => {
                return res.status(201).json({
                    message:"Add Success",
                    status:{
                        dataStatus:"SUCCESS"
                    }
                })
            })
            add.catch(err => {
                return res.status(500).json({
                    message:err.message
                })
            })
        }
        else{
            db.collection('semester_year').add({
                year:req.body.year,
                semester:req.body.semester,
                status:'DISABLE'
            })
            .then(() => {
                return res.status(200).json({
                    message:"Add Success",
                    status:{
                        dataStatus:"SUCCESS"
                    }
                })
            })
            .catch(err => {
                return res.status(500).json({
                    message:err.message
                })
            })
        }
    })
})

app.delete('/delYear/:id',check_admin,(req,res) => {

    const id = req.params.id
    const year_db = db.collection('semester_year').doc(id).get()
    year_db.then(result => {
        if(!result.exists){
            return res.status(404).json({
                message:"No Matching Document"
            })
        }
        else{
            db.collection('semester_year').doc(id).delete()
            .then(() => {
                return res.status(200).json({
                    message:"Delete Success",
                    status:{
                        dataStatus:"SUCCESS"
                    }
                })
            })
            .catch(err => {
                return res.status(500).json({
                    message:err.message
                })
            })
        }
    })

})

app.put('/setCurrentYear/:id',check_admin,async (req,res) => {
  
    const id = req.params.id
    const db_year = await db.collection('semester_year')
    const check_year = await db_year.where('status','==','ACTIVE').get()
    check_year.forEach(doc => {
       db.collection('semester_year').doc(doc.id).update({
           status:'DISABLE'
       })
    })

    db.collection('semester_year').doc(id).update({
        status:"ACTIVE"
    })
    .then(() => {
        return res.status(200).json({
            message:"Update Success",
            status:{
                dataStatus:"SUCCESS"
            }
        })
    })
})







// app.get('/getSubject', async (req, res) => {

//     const subject = await db.collection('subjects').get()

//     const collect = []

//     subject.forEach(doc => {
//         let sid = doc.id
//         collect.push(db.collection('subjects').doc(sid).collection('Time').get())
//     })

//     const subjects = await Promise.all(collect)

//     const arr = []

//     //  let subject_data = {}
//     // subject.forEach(rec => {
//     //     subject_data.subject_id = rec.data().subject_id,
//     //     subject_data.subject_name = rec.data().subject_name
//     //     arr.push(subject_data)
//     // })

//     subjects.forEach(docs => {
//         docs.forEach(rec => {
//             let subject_data = {
//                 time: rec.data()
//             }
//             arr.push(subject_data)
//         })
//     })
//     res.json(arr)

//     // promise.forEach(docs => {
//     //     console.log(docs.data())
//     // })

// })


exports.api = functions.https.onRequest(app)