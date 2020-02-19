const functions = require('firebase-functions');
const admin = require('firebase-admin')
var serviceAccount = require("./service_account.json");
const express = require('express')
const firebaseauth = require('firebaseauth')
const config = require('./config')
const bodyParser = require('body-parser')
const cors = require('cors')
const { check_admin, permission_professor, check_admin_professor, nisit_permission } = require('./api/permission/func')

const firebase = new firebaseauth(config.api_key)
const app = express()


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://kpscheckin.firebaseio.com"
});

let db = admin.firestore()
app.use(bodyParser.json())
app.use(cors())


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
        res.send("Value is Undefined ")
    }
    else {
        firebase.signInWithEmail(email, password, async function (err, response) {
            if (err) {
                res.status(401).json({
                    message: err.message
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

//edit response 
app.get('/getSection/:id', permission_professor, (req, res) => {

    const section_id = req.params.id
    db.collection('section_subject').doc(section_id).get()
        .then(doc => {
            const result = [];
            let data_section;
            if (doc.exists) {
                if (doc.data().Time.length === 1) {
                    data_section = {
                        section_id: doc.id,
                        Year: doc.data().Year,
                        section_number: doc.data().section_number,
                        Subject: doc.data().Subject,
                        time_absent: doc.data().time_absent,
                        time_late: doc.data().time_late,
                        day1: doc.data().Time[0].day,
                        start_time1: doc.data().Time[0].start_time,
                        finish_time1: doc.data().Time[0].end_time,
                        total_mark: doc.data().total_mark,
                        status: doc.data().status,
                        teacher_name: doc.data().teacher_name
                    }
                }
                else {
                    data_section = {
                        section_id: doc.id,
                        Year: doc.data().Year,
                        section_number: doc.data().section_number,
                        Subject: doc.data().Subject,
                        time_absent: doc.data().time_absent,
                        time_late: doc.data().time_late,
                        day1: doc.data().Time[0].day,
                        start_time1: doc.data().Time[0].start_time,
                        finish_time1: doc.data().Time[0].end_time,
                        day2: doc.data().Time[1].day,
                        start_time2: doc.data().Time[1].start_time,
                        finish_time2: doc.data().Time[1].end_time,
                        total_mark: doc.data().total_mark,
                        status: doc.data().status,
                        teacher_name: doc.data().teacher_name
                    }
                }
                result.push(data_section)
                return res.status(200).json({
                    message: "Get Section Success",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: result
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
            if (!result.empty) {
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

app.post('/listSecStudent', permission_professor, async (req, res) => {

    const promise = []
    const user_id = []
    const result = []

    await db.collection('section_subject')
        .where(new admin.firestore.FieldPath('Subject', 'subject_name'), '==', req.body.subject_name)
        .where(new admin.firestore.FieldPath('Year', 'year'), '==', req.body.year)
        .where(new admin.firestore.FieldPath('Year', 'semester'), '==', req.body.semester)
        .where("section_number", '==', req.body.section_number)
        .where("teacher_id", '==', req.user_id)
        .get()
        .then(async response => {
            if (response.empty) {
                return res.status(404).json({
                    message: "No Matching Document"
                })
            }
            else {
                response.forEach(record => {
                    promise.push(record.id)
                })
                if (promise !== "undefined") {
                    await db.collection('user_registration').where('section_id', '==', promise[0]).get()
                        .then(result => {
                            result.forEach(record => {
                                user_id.push({
                                    id: record.id,
                                    uid: record.data().uid,
                                    sec_id: record.data().section_id,
                                    status: record.data().status
                                })
                            })
                        })
                    await db.collection('users').get()
                        .then(async snapshot_user => {
                            snapshot_user.forEach(users => {
                                user_id.forEach(pro => {
                                    if (users.id === pro.uid) {
                                        result.push({
                                            auto_id: pro.id,
                                            std_id: users.data().id,
                                            firstname: users.data().firstname,
                                            lastname: users.data().lastname,
                                            email: users.data().email,
                                            status: pro.status
                                        })
                                    }
                                })
                            })
                            return res.json({
                                message: "Get Data Success",
                                status: {
                                    dataStatus: "SUCCESS"
                                },
                                data: result
                            })
                        })
                }
            }
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })
})

//add approve student and reject student 18/2/2020
app.put('/approveStudent', permission_professor, async (req, res) => {

    const id = req.body.id;
    console.log(id)
    for (let i = 0; i < id.length; i++) {
        await db.collection('user_registration').doc(id[i]).update({
            status: "APPROVE"
        })
    }
    return res.status(200).json({
        message: "Approve Student in Section Success",
        status: {
            dataStatus: "SUCCESS"
        }
    })
})

app.delete('/rejectStudent', permission_professor, async (req, res) => {
    try {
        const id = req.body.id
        for (let i = 0; i < id.length; i++) {
            await db.collection('user_registration').doc(id[i]).delete()
        }
        return res.status(200).json({
            message: "Reject Student in Section Success",
            status: {
                dataStatus: "SUCCESS"
            }
        })
    }catch(err){
        console.log(error)
    }
})

//CRUD_BEACON
//Deploy 
app.post('/createBeacon', permission_professor, async (req, res) => {

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

app.get('/getBeacon/:id', permission_professor, (req, res) => {

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

app.delete('/deleteBeacon/:id', check_admin_professor, (req, res) => {

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

//Nisit
app.get('/listSubjectsByStudent', nisit_permission, async (req, res) => {

    let user_id = req.user_id
    try {
        const result = [];

        const collection_user_registration = await db.collection('user_registration')
        const registration_list = await collection_user_registration.where('uid', '==', user_id).get()

        if (registration_list.empty) {
            return res.status(404).json({
                message: "No Matching Document"
            })
        }
        const regis_id = [];
        //collect section_subject id into array
        registration_list.forEach(record => {
            regis_id.push({
                id: record.id,
                uid: record.data().uid,
                section_id: record.data().section_id,
                status: record.data().status
            })
        })

        const registration = await Promise.all(regis_id)

        const db_section_subject = await db.collection('section_subject')
        const sections = await db_section_subject.get()

        sections.forEach(section => {
            registration.forEach(regis => {
                if (regis.section_id === section.id) {
                    result.push({
                        id: regis.id,
                        section_number: section.data().section_number,
                        Year: section.data().Year,
                        teacher_name: section.data().teacher_name,
                        Time: section.data().Time,
                        Subject: section.data().Subject,
                        status: section.data().status,
                        total_mark: section.data().total_mark,
                        time_late: section.data().time_late,
                        teacher_id: section.data().teacher_id,
                        time_absent: section.data().time_absent,
                    })
                }
            })
        })
        return res.status(200).json({
            message: "Get List Subject Success",
            status: {
                dataStatus: "SUCCESS"
            },
            data: result
        })

    }
    catch (error) {
        return res.status(500).json({
            message: error
        })
    }
})

app.delete('/dropSubject/:id', nisit_permission, (req, res) => {

    const id = req.params.id

    db.collection('user_registration').doc(id).delete()
        .then(() => {
            return res.status(200).json({
                message: "Drop Subject Success",
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


exports.api = functions.https.onRequest(app)

// exports.ResetPassword = functions.https.onRequest((req,res) => {

//    firebase.sendPasswordResetEmail('thanakit.40@gmail.com',(err,result) => {
//        if(err) throw err.message
//       else{
//           console.log("KKKK")
//       }
//    })
// })
