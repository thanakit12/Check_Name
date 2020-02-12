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
            else if (req.body.role === 'PROFESSOR') {
                customClaims = {
                    professor: true
                };
            }
            else if (req.body.role === 'NISIT') {
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
                    message: err.message
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
//edit reject and rejectmulty and add delete function subject
app.delete('/reject/:id', check_admin, (req, res) => {

    const subject_id = req.params.id
    db.collection('subjects').doc(subject_id).get()
        .then(result => {
            if (result.exists) {
                db.collection('subjects').doc(subject_id).delete()
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
            }
            else {
                return res.status(404).json({
                    message: "No Matching Document"
                })
            }
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
app.delete('/rejectMulty', check_admin, async (req, res) => {

    const reject_ids = req.body.reject_ids
    for (let i = 0; i < reject_ids.length; i++) {
        db.collection('subjects').doc(reject_ids[i]).delete()
    }
    return res.status(200).json({
        message: "Reject Success",
        status: {
            dataStatus: "SUCCESS"
        }
    })
})

app.delete('/delSubject/:id', check_admin, async (req, res) => {

    const subject_id = req.params.id

    db.collection('subjects').doc(subject_id).get()
        .then(async result => {
            if (result.exists) {
                try {
                    const subject = await db.collection('subjects')
                    const del = subject.doc(subject_id).delete()
                        .then(() => {
                            return res.status(200).json({
                                message: "Delete Subject Success",
                                status: {
                                    dataStatus: "SUCCESS"
                                }
                            })
                        })
                }
                catch (err) {
                    return res.status(500).json({
                        message: err.message
                    })
                }
            }
            else {
                return res.status(404).json({
                    message: "No Matching Document "
                })
            }
        })
})

//add get subject and update subject

app.get('/getSubject/:id', check_admin, (req, res) => {

    const subject_id = req.params.id

    db.collection('subjects').doc(subject_id).get()
        .then(result => {
            if (result.exists) {
                return res.status(200).json({
                    message: "Get Subject Success",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: {
                        id: result.id,
                        subject_name: result.data().subject_name,
                        subject_code: result.data().subject_code,
                        creater_name: result.data().creater_name,
                        semester: result.data().semester,
                        year: result.data().year,
                        approved_status: result.data().approved_status
                    }
                })
            }
            else {
                return res.status(404).json({
                    message: "No Matching Document "
                })
            }
        })
})

app.put('/updateSubject/:id', check_admin, (req, res) => {

    const subject_id = req.params.id

    db.collection('subjects').doc(subject_id).update({
        subject_code: req.body.subject_code,
        subject_name: req.body.subject_name
    })
        .then(() => {
            return res.status(200).json({
                message: "Update Subject Success",
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


//Open section  Deploy 27/1/2020


app.post('/subject_register', permission_professor, async (req, res) => {

    let isexist;
    db.collection('section_subject')
        .where(new admin.firestore.FieldPath('Subject', 'subject_code'), '==', req.body.Subject.subject_code)
        .get()
        .then(result => {
            result.forEach(doc => {
                const section_number = doc.data().section_number
                if (section_number == req.body.section_number) {
                    isexist = true;
                }
            })
            if (isexist) {
                return res.status(500).json({
                    message: "Can't add data because data is exists!!!"
                })
            }
            else {
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
            }
        })
})

app.get('/getSection/:id', permission_professor, (req, res) => {

    const section_id = req.params.id
    db.collection('section_subject').doc(section_id).get()
        .then(doc => {
            if (doc.exists) {
                return res.status(200).json({
                    message: "Get Section Success",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: {
                        section_id: doc.id,
                        Year: doc.data().Year,
                        section_number: doc.data().section_number,
                        Subject: doc.data().Subject,
                        Time: doc.data().Time,
                        time_absent: doc.data().time_absent,
                        time_late: doc.data().time_late,
                        total_mark: doc.data().total_mark,
                        status: doc.data().status,
                        teacher_name: doc.data().teacher_name
                    }
                })
            }
            else {
                return res.status(404).json({
                    message: "No Matching Document "
                })
            }
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })
})

//deploy

app.put('/updateSection/:id', permission_professor, async (req, res) => {
    const section_id = req.params.id

    db.collection('section_subject').doc(section_id).get()
        .then(result => {
            const uid = result.data().teacher_id
            if (req.user_id !== uid) {
                return res.status(403).json({
                    message: "You Don't have permission in this request "
                })
            }
            else {
                db.collection('section_subject').doc(section_id).update({
                    Time: req.body.Time,
                    time_absent: req.body.time_absent,
                    time_late: req.body.time_late,
                    total_mark: req.body.total_mark
                })
                return res.status(200).json({
                    message: "Update Section Success",
                    status: {
                        dataStatus: "SUCCESS"
                    }
                })
            }
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })
})

app.delete('/deleteSection/:id', permission_professor, async (req, res) => {

    const sec_id = req.params.id
    const check = await db.collection('section_subject').doc(sec_id).get()
    if (check.exists) {
        db.collection('section_subject').doc(sec_id).delete()
            .then(() => {
                return res.status(200).json({
                    message: "Delete Section Success",
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
    }
    else {
        return res.status(404).json({
            message: "No Matching Document"
        })
    }

})



//Professor get subjects
// 8/2/2020 add delete section function and edit return techer_name in getSubjects 
// 10/2/2020 edit in getsubjects
//12/2/20 edit getsubjects because have a little problem
app.get('/getSubjects', permission_professor, async (req, res) => {

    const subjects = []
    let year, semester;
    db.collection('semester_year').where('status', '==', 'ACTIVE').get()
        .then(result => {
            if(!result.empty){
            result.forEach(doc => {
                year = doc.data().year;
                semester = doc.data().semester;
            })
            db.collection('section_subject')
                .where('teacher_id', '==', req.user_id)
                .where(new admin.firestore.FieldPath('Year', 'year'), '==', Number(year))
                .where(new admin.firestore.FieldPath('Year', 'semester'), '==', semester.toString())
                .get()
                .then(snapshot_subjects => {
                    if (snapshot_subjects.empty) {
                        return res.status(404).json({
                            message: "No Matching Document"
                        })
                    }
                    snapshot_subjects.forEach(doc => {
                        subjects.push({
                            id: doc.id,
                            Year: doc.data().Year,
                            section_number: doc.data().section_number,
                            Subject: doc.data().Subject,
                            Time: doc.data().Time,
                            time_absent: doc.data().time_absent,
                            time_late: doc.data().time_late,
                            total_mark: doc.data().total_mark,
                            status: doc.data().status,
                            teacher_name: doc.data().teacher_name
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
                .catch(err => {
                    return res.status(500).json({
                        message:err.message
                    })
                })
            }
            else{
                return res.status(404).json({
                    message:"No Matching Document"
                })
            }
        })




})



//CRUD_YEAR V.1.1 because edit in function post year handle data exists !!! 6/2/2020 deploy success


app.get('/getYear', check_admin, (req, res) => {

    const promise = db.collection('semester_year').get()
    let payload;
    const semester_year = []
    promise.then(result => {
        result.forEach(doc => {
            payload = {
                id: doc.id,
                year: doc.data().year,
                semester: doc.data().semester,
                status: doc.data().status
            }
            semester_year.push(payload)
        })
        return res.status(200).json({
            message: "get Year Success",
            status: {
                dataStatus: 'SUCCESS'
            },
            data: semester_year
        })
    })
    promise.catch(err => {
        return res.status(500).json({
            message: err.message
        })
    })
})

app.get('/getCurrentYear', check_admin_professor, async (req, res) => {

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

app.post('/AddYear', check_admin, async (req, res) => {

    let isexist = false;
    const check = await db.collection('semester_year').where('year', '==', req.body.year).where('semester', '==', req.body.semester).get()
        .then(result => {
            result.forEach(doc => {
                isexist = true
            })
        })
    if (isexist) {
        return res.status(500).json({
            message: "Don't Add because data is exists !!!"
        })
    }
    else {
        const promise_year = db.collection('semester_year').get()
        promise_year.then(result => {
            if (result.empty) {
                const add = db.collection('semester_year').add({
                    year: req.body.year,
                    semester: req.body.semester,
                    status: 'ACTIVE'
                })
                add.then(() => {
                    return res.status(201).json({
                        message: "Add Success",
                        status: {
                            dataStatus: "SUCCESS"
                        }
                    })
                })
                add.catch(err => {
                    return res.status(500).json({
                        message: err.message
                    })
                })
            }
            else {
                db.collection('semester_year').add({
                    year: req.body.year,
                    semester: req.body.semester,
                    status: 'DISABLE'
                })
                    .then(() => {
                        return res.status(200).json({
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
            }
        })
    }
})

app.delete('/delYear/:id', check_admin, (req, res) => {

    const id = req.params.id
    const year_db = db.collection('semester_year').doc(id).get()
    year_db.then(result => {
        if (!result.exists) {
            return res.status(404).json({
                message: "No Matching Document"
            })
        }
        else {
            db.collection('semester_year').doc(id).delete()
                .then(() => {
                    return res.status(200).json({
                        message: "Delete Success",
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
        }
    })

})

app.put('/setCurrentYear/:id', check_admin, async (req, res) => {

    const id = req.params.id
    const db_year = await db.collection('semester_year')
    const check_year = await db_year.where('status', '==', 'ACTIVE').get()
    check_year.forEach(doc => {
        db.collection('semester_year').doc(doc.id).update({
            status: 'DISABLE'
        })
    })

    db.collection('semester_year').doc(id).update({
        status: "ACTIVE"
    })
        .then(() => {
            return res.status(200).json({
                message: "Update Success",
                status: {
                    dataStatus: "SUCCESS"
                }
            })
        })
})



//Nisit register subject

const nisit_permission = (req, res, next) => {
    if (req.headers.token === undefined) {
        return res.status(401).json({ message: "Please insert token" })
    }
    else {
        const token = req.headers.token
        admin.auth().verifyIdToken(token).then(claim => {
            if (claim.nisit === true) {
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



app.post('/subjectRegister', nisit_permission, (req, res) => {

    const uid = req.user_id
    db.collection('user_registration').add({
        uid: uid,
        section_id: req.body.section_id,
        status: "PENDING"
    })
        .then(() => {
            return res.status(201).json({
                message: "Register Subject Success",
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

app.get('/listSecStudent/:id', permission_professor, async (req, res) => {

    const sec_id = req.params.id
    const promise = []
    const result = []

    const snapshot = await db.collection('user_registration').where('section_id', '==', sec_id).get()

    if (snapshot.empty) {
        return res.status(404).json({
            message: "No User Register In section"
        })
    }
    else {
        snapshot.forEach(doc => {
            promise.push({
                id: doc.id,
                uid: doc.data().uid,
                section_id: doc.data().section_id,
                status: doc.data().status
            })
        })

        const snapshot_user = await db.collection('users').get()
        snapshot_user.forEach(user => {
            promise.forEach(pro => {
                if (user.id === pro.uid) {
                    result.push({
                        id: pro.id,
                        section_id: pro.section_id,
                        std_id: user.data().id,
                        firstname: user.data().firstname,
                        lastname: user.data().lastname,
                        email: user.data().email,
                        status: pro.status
                    })
                }
            })
        })
        return res.status(200).json({
            message: "Success",
            data: result
        })
    }
})

app.put('/approveStudent', (req, res) => {

    const user_id = req.body.user_id;

    // for(let i = 0 ; i < user_id.length ; i++){
    //     db.collection('user_registration').doc(user_id[i])
    // }
    console.log(req.body.user_id.length)
    console.log(user_id)

})




//CRUD_BEACON
//Deploy 

app.post('/createBeacon', check_admin, async (req, res) => {

    let isexist;

    db.collection('beacon')
        .where('uuid', '==', req.body.uuid)
        .get()
        .then(result => {
            result.forEach(doc => {
                isexist = true;
            })
            if (isexist) {
                return res.status(500).json({
                    message: "Cannot Add Data Because Data is exists "
                })
            }
            else {
                db.collection('beacon').add({
                    uuid: req.body.uuid,
                    major: req.body.major,
                    minor: req.body.minor,
                    name: req.body.name,
                    status: 'DISABLE'
                })
                return res.status(201).json({
                    message: "Add Beacon Success",
                    status: {
                        dataStatus: "SUCCESS"
                    }
                })
            }
        })
})

app.get('/getBeacon/:id', check_admin_professor, (req, res) => {

    const beacon_id = req.params.id

    db.collection('beacon').doc(beacon_id).get()
        .then(result => {
            if (result.exists) {
                return res.status(200).json({
                    message: "Get Beacon Success",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: {
                        id: result.id,
                        name: result.data().name,
                        major: result.data().major,
                        minor: result.data().minor,
                        uuid: result.data().uuid,
                        status: result.data().status
                    }
                })
            }
            else {
                return res.status(404).json({
                    message: "No Matching Document"
                })
            }
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })
})

app.get('/listBeacon', check_admin_professor, (req, res) => {

    const beacon = []
    db.collection('beacon').get()
        .then(result => {
            result.forEach(doc => {
                beacon.push({
                    id: doc.id,
                    name: doc.data().name,
                    major: doc.data().major,
                    minor: doc.data().minor,
                    uuid: doc.data().uuid,
                    status: doc.data().status
                })
            })
            return beacon;
        })
        .then(beacon => {
            return res.status(200).json({
                message: "Get List Beacon Success",
                status: {
                    dataStatus: "SUCCESS"
                },
                data: beacon
            })
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })
})

app.delete('/deleteBeacon/:id', check_admin, (req, res) => {

    const beacon_id = req.params.id

    db.collection('beacon').doc(beacon_id).get()
        .then(result => {
            if (result.exists) {
                db.collection('beacon').doc(beacon_id).delete()
                    .then(() => {
                        return res.status(200).json({
                            message: "Delete Beacon Success",
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
            }
            else {
                return res.status(404).json({
                    message: "No Matching Document"
                })
            }
        })


})

exports.api = functions.https.onRequest(app)