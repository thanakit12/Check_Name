const functions = require('firebase-functions');
const admin = require('firebase-admin')
var serviceAccount = require("./service_account.json");
const express = require('express')
const firebaseauth = require('firebaseauth')
const config = require('./config')
const bodyParser = require('body-parser')
const cors = require('cors')
const moment = require('moment-timezone')
const { Parser } = require('json2csv');
const json2xls = require('json2xls');
const { exportXls } = require('./export/func.js')


const { check_admin, permission_professor, check_admin_professor, nisit_permission, permission_all } = require('./api/permission/func')

const firebase = new firebaseauth(config.api_key)
const app = express()


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://kpscheckin.firebaseio.com"
});

let db = admin.firestore()
app.use(bodyParser.json())
app.use(cors())
// app.use(json2xls.middleware)


//register student  
//merge วันที่ 23/1/2020 15.18
app.post('/register', async (req, res) => {

    const email = req.body.email
    const password = req.body.password
    const extras = {
        name: req.body.firstname + " " + req.body.lastname
    }
    // console.log("Register Function")
    const check_id = await db.collection('users').where('id', '==', req.body.id).get()
    let customClaims;

    if (check_id.empty) {
        // console.log("Role :", req.body.role);
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
        else if (req.body.role === 'STUDENT') {
            customClaims = {
                nisit: true
            }
        }
        else {
            return res.status(500).json({
                message: "Please insert correct type of user ex. 'ADMIN','LECTURER','STUDENT'",
                status: {
                    dataStatus: "FAILURE"
                }
            })
        }

        firebase.registerWithEmail(email, password, extras, async function (err, result) {
            if (err) {
                return res.status(500).json({
                    message: err.message,
                    status: {
                        dataStatus: "FAILURE"
                    }
                })
            }
            else {
                const user = result.user
                const uid = user.id

                let user_data = {
                    id: req.body.id,
                    firstname: req.body.firstname,
                    lastname: req.body.lastname,
                    email: req.body.email,
                    mobile: req.body.mobile,
                    role: req.body.role,
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
                        return res.status(500).json({
                            message: err.message,
                            status: {
                                dataStatus: "FAILURE"
                            }
                        })
                    })
            }
        })
    }
    else {
        return res.status(500).json({
            message: "ไม่สามรถเพิ่มได้ เนื่องจาก มี id นี้อยู่ใน ระบบ แล้ว",
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
})


// เสร็จแล้ววันที่ v.1.0.0 22/1/2020 19.46 
app.post('/login', (req, res) => {
    const email = req.body.email
    const password = req.body.password
    if (email === undefined || password === undefined) {
        res.status(401).json({
            message: "Value is Undefined",
            status: {
                dataStatus: "FAILURE"
            }
        })

    }
    else {
        firebase.signInWithEmail(email, password, async function (err, response) {
            if (err) {
                res.status(401).json({
                    message: err.message,
                    status: {
                        dataStatus: "FAILURE"
                    }
                })
            }
            else {
                const user = response.user
                const uid = user.id
                await db.collection('users').doc(uid).get()
                    .then(res => {
                        user.displayName = res.data().firstname + " " + res.data().lastname;
                        user.role = res.data().role;
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
    if (snapshot.empty) {
        return res.status(404).json({
            message: "No Matching Document ",
            data: [],
            status: {
                dataStatus: "SUCCESS"
            }
        })
    }
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
            return res.status(500).json(
                {
                    message: err.message,
                    status: {
                        dataStatus: "FAILURE"
                    }
                }
            )
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
                                message: "NoT Found Document",
                                status: {
                                    dataStatus: "SUCCESS"
                                },
                                data: []
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

//get Name 

//Create Subject  //แก้ v.1.0.1 30/1/2020
//edit createSubject clear
app.post('/createSubject', check_admin_professor, async (req, res) => {

    let subject;
    if (req.body.subject_code !== "" && req.body.subject_name !== "") {
        await db.collection('subjects').where('subject_code', '==', req.body.subject_code)
            .where('subject_name', '==', req.body.subject_name)
            .get()
            .then(async result => {
                if (result.empty) {
                    if (req.claim.professor === true) {
                        subject = {
                            subject_code: req.body.subject_code,
                            subject_name: req.body.subject_name,
                            approved_status: "PENDING",
                            uid: req.uid
                        }
                    }
                    else {
                        subject = {
                            subject_code: req.body.subject_code,
                            subject_name: req.body.subject_name,
                            approved_status: "APPROVE",
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
                }
                else {
                    return res.status(500).json({
                        message: "ไม่สามารถสร้างวิชาได้ เนื่องจาก มีวิชานี้แล้ว",
                        status: {
                            dataStatus: "FAILURE"
                        }
                    })
                }
            })
    }
    else {
        return res.status(500).json({
            message: "กรุณากรอกข้อมูลให้ครบ",
            status: {
                dataStatus: "FAILURE"
            }
        })
    }

})

//getSubject // ลบสิทธิ์ admin
app.get('/getSubjectsApprove', check_admin, async (req, res) => {

    const snapshot_subjects = await db.collection('subjects').get()
    const subjects = []
    const promise = [];
    let year, semester;
    await db.collection('semester_year').where('status', '==', 'ACTIVE').get()
        .then(docs => {
            docs.forEach(row => {
                year = row.data().year;
                semester = row.data().semester;
            })
        })
    if (snapshot_subjects.empty) {
        return res.status(404).json({
            message: "No Document",
            status: {
                dataStatus: "SUCCESS"
            },
            data: []
        })
    }

    snapshot_subjects.forEach(doc => {
        promise.push(db.collection('section_subject')
            .where(new admin.firestore.FieldPath('Year', 'year'), '==', year)
            .where(new admin.firestore.FieldPath('Year', 'semester'), '==', semester)
            .where(new admin.firestore.FieldPath('Subject', 'subject_code'), '==', doc.data().subject_code)
            .where(new admin.firestore.FieldPath('Subject', 'subject_name'), '==', doc.data().subject_name)
            .get()
            .then(docs => {
                subjects.push({
                    id: doc.id,
                    subject_code: doc.data().subject_code,
                    subject_name: doc.data().subject_name,
                    approved_status: doc.data().approved_status,
                    count: docs.size
                })
            })
        )
    })
    await Promise.all(promise);
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
                    let subject_code = result.data().subject_code;
                    let subject_name = result.data().subject_name;
                    await db.collection('section_subject')
                        .where(new admin.firestore.FieldPath('Subject', 'subject_code'), '==', subject_code)
                        .where(new admin.firestore.FieldPath('Subject', 'subject_name'), '==', subject_name)
                        .get()
                        .then(async sections => {
                            if (!sections.empty) {
                                let count = sections.size;
                                // console.log(count)
                                return res.status(500).json({
                                    message: "Can't Delete Subject Bacause This Subject is used ",
                                    status: {
                                        dataStatus: "FAILURE"
                                    },
                                })
                            }
                            else {
                                await db.collection('subjects').doc(subject_id).delete()
                                    .then(() => {
                                        return res.status(200).json({
                                            message: "Delete Subject Success",
                                            status: {
                                                dataStatus: "SUCCESS"
                                            }
                                        })
                                    })
                            }
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

app.get('/getSubject/:id', check_admin_professor, (req, res) => {

    const subject_id = req.params.id
    db.collection('subjects').doc(subject_id).get()
        .then(async result => {
            if (result.exists) {
                let creator_id = result.data().uid;
                let creator_name = await getName(creator_id);
                return res.status(200).json({
                    message: "Get Subject Success",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: {
                        id: result.id,
                        subject_name: result.data().subject_name,
                        subject_code: result.data().subject_code,
                        creater_name: creator_name,
                        semester: result.data().semester,
                        year: result.data().year,
                        approved_status: result.data().approved_status
                    }
                })
            }
            else {
                return res.status(404).json({
                    message: "No Matching Document ",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: []
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
    db.collection('section_subject')
        .where(new admin.firestore.FieldPath('Subject', 'subject_code'), '==', req.body.Subject.subject_code)
        .where(new admin.firestore.FieldPath('Subject', 'subject_name'), '==', req.body.Subject.subject_name)
        .where('section_number', '==', req.body.section_number)
        .where('teacher_id', '==', req.user_id)
        .get()
        .then(result => {
            if (!result.empty) {
                return res.status(500).json({
                    message: "Can't add data because data is exists",
                    status: {
                        dataStatus: "FAILURE"
                    }
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
                            message: err.message,
                            status: {
                                dataStatus: "FAILURE"
                            }
                        })
                    })
            }
        })
})

//edit response 
//ยังไม่เสร็จ
app.get('/getSection/:id', permission_professor, async (req, res) => {

    const section_id = req.params.id
    const result = []
    await db.collection('section_subject').doc(section_id).get()
        .then(doc => {
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
                    message: "No Matching Document ",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: []
                })
            }
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message,
                status: {
                    dataStatus: "FAILURE"
                }
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
    try {
        const sec_id = req.params.id
        const check = await db.collection('section_subject').doc(sec_id).get()
        if (check.exists) {
            db.collection('section_subject').doc(sec_id).delete()
                .then(async () => {
                    let promise = [];
                    await db.collection('user_registration').where('section_id', '==', sec_id)
                        .get()
                        .then(async regis => {
                            if (!regis.empty) {
                                regis.forEach(row_regis => {
                                    promise.push(db.collection('user_registration').doc(row_regis.id).delete());
                                })
                            }
                        })
                    await Promise.all(promise);
                })
                .then(async () => {
                    let promise = [];
                    await db.collection('classes').where('section_id', '==', sec_id)
                        .get()
                        .then(classes => {
                            if (!classes.empty) {
                                classes.forEach(row_class => {
                                    promise.push(db.collection('classes').doc(row_class.id).delete()
                                        .then(async () => {
                                            await db.collection('class_attendance').where('class_id', '==', row_class.id)
                                                .get()
                                                .then(attan => {
                                                    if (!attan.empty) {
                                                        attan.forEach(row_attan => {
                                                            db.collection('class_attendance').doc(row_attan.id).delete()
                                                        })
                                                    }
                                                })
                                        }))
                                })
                            }
                        })
                    await Promise.all(promise);
                })
                .then(() => {
                    return res.status(200).json({
                        message: "Delete Section Success",
                        status: {
                            dataStatus: "SUCCESS"
                        }
                    })
                })
        }
        else {
            return res.status(404).json({
                message: "No Matching Document"
            })
        }
    }
    catch (error) {
        return res.status(500).json({
            message: error.message,
            status: {
                dataStatus: "FAILURE"
            }
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
                            message: err.message,
                            status: {
                                dataStatus: "FAILURE"
                            }
                        })
                    })
            }
            else {
                return res.status(404).json({
                    message: "No Matching Document",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: []
                })
            }
        })
})


app.get('/ListStudent', permission_professor, async (req, res) => {

    await db.collection('semester_year').where('status', '==', 'ACTIVE').get()
        .then(async result => {
            if (!result.empty) {
                result.forEach(doc => {
                    year = doc.data().year;
                    semester = doc.data().semester;
                })
                await db.collection('section_subject')
                    .where('teacher_id', '==', req.user_id)
                    .where(new admin.firestore.FieldPath('Year', 'year'), '==', Number(year))
                    .where(new admin.firestore.FieldPath('Year', 'semester'), '==', semester.toString())
                    .get()
                    .then(async (response) => {
                        // if (response.empty) {
                        //     return res.status(404).json({
                        //         message: "No Matching Document ",
                        //         status:{
                        //             dataStatus:"SUCCESS"
                        //         },
                        //         data: []
                        //     })
                        // }
                        const promise = [];
                        const section = [];
                        response.forEach(rec => {
                            section.push({
                                section_id: rec.id,
                                subject_name: rec.data().Subject.subject_name,
                                subject_code: rec.data().Subject.subject_code,
                                section_number: rec.data().section_number
                            })
                        })
                        const data = []
                        section.forEach(section => {
                            promise.push(
                                db.collection('user_registration').where('section_id', '==', section.section_id).where('status', '==', 'PENDING').get()
                                    .then(result => {
                                        result.forEach(row => {
                                            data.push({
                                                regis_id: row.id,
                                                subject_name: section.subject_name,
                                                subject_code: section.subject_code,
                                                section_id: row.data().section_id,
                                                section_number: section.section_number,
                                                uid: row.data().uid,
                                                status: row.data().status
                                            })
                                        })
                                    }))
                        })
                        await Promise.all(promise);
                        const final = [];
                        db.collection('users').get()
                            .then(users => {
                                if (users.empty) {
                                    return res.status(404).json({
                                        message: "No Matching Document ",
                                        data: []
                                    })
                                }
                                users.forEach(user => {
                                    data.forEach(dat => {
                                        if (user.id === dat.uid) {
                                            final.push({
                                                regis_id: dat.regis_id,
                                                section_id: dat.section_id,
                                                subject_code: dat.subject_code,
                                                subject_name: dat.subject_name,
                                                section_number: dat.section_number,
                                                std_id: user.data().id,
                                                firstname: user.data().firstname,
                                                lastname: user.data().lastname,
                                                status: dat.status
                                            })
                                        }
                                    })
                                })
                                return res.status(200).json({
                                    message: "Get Data Success",
                                    status: {
                                        dataStatus: "SUCCESS"
                                    },
                                    data: final
                                })
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

//Add function getStudentSection at 21/2/2020
//deploy Success
app.get('/getStudentSection/:id', permission_professor, async (req, res) => {
    const section_id = req.params.id
    await db.collection('section_subject').doc(section_id).get()
        .then(async result => {
            if (result.exists) {
                db.collection('user_registration').where('section_id', '==', result.id).where('status', '==', 'APPROVE').get()
                    .then(async resp => {
                        const student = [];
                        const promise = [];
                        resp.forEach(rec => {
                            promise.push(db.collection('users').doc(rec.data().uid).get()
                                .then(user => {
                                    student.push({
                                        std_id: user.data().id,
                                        firstname: user.data().firstname,
                                        lastname: user.data().lastname,
                                        status: rec.data().status
                                    })
                                }))
                        })
                        await Promise.all(promise)
                        return res.status(200).json({
                            message: "Get Data Success",
                            status: {
                                dataStatus: "SUCCESS"
                            },
                            data: {
                                subject_code: result.data().Subject.subject_code,
                                subject_name: result.data().Subject.subject_name,
                                section_number: result.data().section_number,
                                students: student
                            },
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
                    message: "No Matching Document ",
                    data: []
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

app.get('/getCurrentYear', permission_all, async (req, res) => {

    const snapshot = await db.collection('semester_year').where('status', '==', 'ACTIVE').get()
    let payload;
    if (snapshot.empty) {
        return res.status(404).json({
            message: "No Document ....",
            status: {
                dataStatus: "SUCCESS"
            },
            data: []
        })
    }
    else {
        snapshot.forEach(result => {
            payload = {
                id: result.id,
                year: Number(result.data().year),
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
                    year: Number(req.body.year),
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
                    year: Number(req.body.year),
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
                message: "No Matching Document",
                data: []
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
// handle uid duplicate
//edit success
app.post('/subjectRegister', nisit_permission, async (req, res) => {
    const uid = req.user_id
    await db.collection('user_registration').where('uid', '==', uid).where('section_id', '==', req.body.section_id).get()
        .then(async result => {
            if (result.empty) {
                await db.collection('user_registration')
                    .add({
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
                            message: err.message,
                            status: {
                                dataStatus: "FAILURE"
                            }
                        })
                    })
            }
            else {
                return res.status(500).json({
                    message: "คุณไม่สามารถลงทะเบียน ได้ เนื่องจาก มีข้อมูลอยู่แล้ว",
                    status: {
                        dataStatus: "FAILURE"
                    }
                })
            }
        })
})

app.post('/listSecStudent', permission_professor, async (req, res) => {

    if (req.body.section_number === "") {
        await db.collection('section_subject')
            .where('teacher_id', '==', req.user_id)
            .where(new admin.firestore.FieldPath('Year', 'year'), '==', req.body.year)
            .where(new admin.firestore.FieldPath('Year', 'semester'), '==', req.body.semester)
            .where(new admin.firestore.FieldPath('Subject', 'subject_name'), '==', req.body.subject_name)
            .get()
            .then(async response => {
                const promise = []
                const result = []
                response.forEach(doc => {
                    // console.log(doc.id)
                    promise.push(db.collection('user_registration').where('section_id', '==', doc.id).get()
                        .then(data => {
                            data.forEach(rec => {
                                result.push({
                                    regis_id: rec.id,
                                    section_id: doc.id,
                                    subject_code: doc.data().Subject.subject_code,
                                    subject_name: doc.data().Subject.subject_name,
                                    section_number: doc.data().section_number,
                                    uid: rec.data().uid,
                                    status: rec.data().status
                                })
                            })
                        }))
                })
                const final = [];
                await Promise.all(promise)
                await db.collection('users').get()
                    .then(row => {
                        row.forEach(record => {
                            result.forEach(regis => {
                                if (record.id === regis.uid) {
                                    final.push({
                                        regis_id: regis.regis_id,
                                        section_id: regis.section_id,
                                        subject_code: regis.subject_code,
                                        subject_name: regis.subject_name,
                                        section_number: regis.section_number,
                                        std_id: record.data().id,
                                        firstname: record.data().firstname,
                                        lastname: record.data().lastname,
                                        status: regis.status
                                    })
                                }
                            })
                        })
                    })
                final.sort((a, b) => a.std_id - b.std_id)
                return res.status(200).json({
                    message: "Get Data Success",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: final
                })
            })
    }
    else {
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
                        message: "No Matching Document",
                        data: []
                    })
                }
                else {
                    const promise = []
                    const result = []
                    response.forEach(doc => {
                        promise.push(db.collection('user_registration').where('section_id', '==', doc.id).get()
                            .then(data => {
                                data.forEach(rec => {
                                    result.push({
                                        regis_id: rec.id,
                                        section_id: doc.id,
                                        subject_code: doc.data().Subject.subject_code,
                                        subject_name: doc.data().Subject.subject_name,
                                        section_number: doc.data().section_number,
                                        uid: rec.data().uid,
                                        status: rec.data().status
                                    })
                                })
                            }))
                    })
                    const final = [];
                    await Promise.all(promise)
                    await db.collection('users').get()
                        .then(row => {
                            row.forEach(record => {
                                result.forEach(regis => {
                                    if (record.id === regis.uid) {
                                        final.push({
                                            regis_id: regis.regis_id,
                                            section_id: regis.section_id,
                                            subject_code: regis.subject_code,
                                            subject_name: regis.subject_name,
                                            section_number: regis.section_number,
                                            std_id: record.data().id,
                                            firstname: record.data().firstname,
                                            lastname: record.data().lastname,
                                            status: regis.status
                                        })
                                    }
                                })
                            })
                        })
                    final.sort((a, b) => a.std_id - b.std_id)
                    return res.status(200).json({
                        message: "Get Data Success",
                        status: {
                            dataStatus: "SUCCESS"
                        },
                        data: final
                    })
                }
            })
            .catch(err => {
                return res.status(500).json({
                    message: err.message
                })
            })
    }
})

//add approve student and reject student 18/2/2020
app.put('/approveStudent', permission_professor, async (req, res) => {

    const id = req.body.id;
    // console.log(id)
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
    } catch (err) {
        return res.status(500).json({
            message: err.message
        })
    }
})

//CRUD_BEACON
//Deploy 
app.post('/createBeacon', permission_professor, async (req, res) => {

    let isexist;

    if (req.body.name === '') {
        return res.status(500).json({
            message: "Please Insert Name of Beacon",
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
    else if (req.body.uuid === '') {
        return res.status(500).json({
            message: "Please Insert Beacon Data",
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
    db.collection('beacon')
        .where('uuid', '==', req.body.uuid)
        .get()
        .then(result => {
            result.forEach(doc => {
                isexist = true;
            })
            if (isexist) {
                return res.status(500).json({
                    message: "Cannot Add Data Because Data is exists ",
                    status: {
                        dataStatus: "FAILURE"
                    }
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
            if (result.empty) {
                return res.status(404).json({
                    message: "No Matching Document ",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: []
                })
            }
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
                message: "No Matching Document",
                status: {
                    dataStatus: "SUCCESS"
                },
                data: []
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
            message: error,
            status: {
                dataStatus: 'FAILURE'
            }
        })
    }
})

app.delete('/dropSubject/:id', nisit_permission, (req, res) => {

    const id = req.params.id

    db.collection('user_registration').doc(id).update({
        status: "DROP"
    })
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
                message: err.message,
                status: {
                    dataStatus: "FAILURE"
                }
            })
        })
})

app.delete('/dropStudent/:id', permission_professor, async (req, res) => {

    const request_id = req.params.id;
    await db.collection('user_registration').doc(request_id).get()
        .then(async resp => {
            if (resp.exists) {
                await db.collection('user_registration').doc(request_id).delete()
                    .then(() => {
                        return res.status(200).json({
                            message: "Drop Student Success",
                            status: {
                                dataStatus: "SUCCESS"
                            }
                        })
                    })
            }
            else {
                return res.status(404).json({
                    message: "No Document Found",
                    status: {
                        dataStatus: "SUCCESS"
                    }
                })
            }
        })

        .catch(err => {
            return res.status(500).json({
                message: err.message,
                status: {
                    dataStatus: "FAILURE"
                }
            })
        })
})


app.get('/getBeaconInActive', permission_professor, async (req, res) => {

    const beacon = [];
    await db.collection('beacon').where('status', '==', 'DISABLE')
        .get()
        .then(resp => {
            if (resp.empty) {
                return res.status(404).json({
                    message: "No Beacon",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: [],
                })
            }
            resp.forEach(record => {
                beacon.push({
                    id: record.id,
                    uuid: record.data().uuid,
                    major: record.data().major,
                    minor: record.data().minor,
                    name: record.data().name
                })
            })
            return res.status(200).json({
                message: "Get Beacon Disable Success",
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
app.post('/openClass', permission_professor, async (req, res) => {

    const zone = 'Asia/Bangkok';
    const time = moment(new Date()).tz(zone).format("X");
    await db.collection('semester_year').where('status', '==', 'ACTIVE')
        .get()
        .then(async result => {
            let year, semester;
            result.forEach(record => {
                semester = record.data().semester;
                year = record.data().year
            })

            await db.collection('classes').where('status', '==', 'ACTIVE')
                .where('uid', '==', req.user_id)
                .get()
                .then(async resp => {
                    if (resp.empty) {
                        await db.collection('classes').add({
                            year: Number(year),
                            semester: semester,
                            section_id: req.body.section_id,
                            beacon_id: req.body.beacon_id,
                            opened_timestamp: Number(time),
                            status: "ACTIVE",
                            uid: req.user_id,
                            distance: Number(req.body.distance)
                        })
                            .then(async () => {
                                await db.collection('beacon').doc(req.body.beacon_id).update({
                                    status: 'ACTIVE'
                                })
                            })
                            .then(() => {
                                return res.status(200).json({
                                    message: "Open Class Success",
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
                        return res.status(500).json({
                            message: "You are already open class",
                            status: {
                                dataStatus: 'FAILURE'
                            }
                        })
                    }
                })
        })
})

//Nisit Subject Register

app.get('/getSubjectByStudent', nisit_permission, async (req, res) => {

    const subject = [];

    await db.collection('subjects').where('approved_status', '==', 'APPROVE')
        .get()
        .then(result => {
            result.forEach(row => {
                subject.push({
                    subject_code: row.data().subject_code,
                    subject_name: row.data().subject_name,
                    approved_status: row.data().approved_status,
                    creater_name: row.data().creater_name,
                    uid: row.data().uid,
                })
            })
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })

    let year, semester;
    await db.collection('semester_year').where('status', '==', 'ACTIVE')
        .get()
        .then(result => {
            result.forEach(record => {
                year = record.data().year;
                semester = record.data().semester;
            })
        })

    const promise = [];
    let subject_name, subject_code;
    subject.forEach(record => {
        promise.push(
            db.collection('section_subject')
                .where(new admin.firestore.FieldPath('Year', 'year'), '==', Number(year))
                .where(new admin.firestore.FieldPath('Year', 'semester'), '==', semester.toString())
                .where(new admin.firestore.FieldPath('Subject', 'subject_code'), '==', record.subject_code)
                .where(new admin.firestore.FieldPath('Subject', 'subject_name'), '==', record.subject_name)
                .get())
    })

    const result = await Promise.all(promise)
    let section = [];
    let final = [];
    result.forEach(record => {
        section = []
        if (record.size > 1) {
            record.forEach(value => {
                subject_code = value.data().Subject.subject_code;
                subject_name = value.data().Subject.subject_name;
                section.push({
                    id: value.id,
                    teacher_id: value.data().teacher_id,
                    time_absent: value.data().time_absent,
                    teacher_name: value.data().teacher_name,
                    Time: value.data().Time,
                    status: value.data().status,
                    total_mark: value.data().total_mark,
                    time_late: value.data().time_late,
                    section_number: value.data().section_number
                })
            })
            final.push({
                Subject: {
                    subject_code: subject_code,
                    subject_name: subject_name
                },
                sections: section
            })
        }
        else if (record.size > 0) {
            section = [];
            record.forEach(value => {
                subject_code = value.data().Subject.subject_code;
                subject_name = value.data().Subject.subject_name
                section.push({
                    id: value.id,
                    teacher_id: value.data().teacher_id,
                    time_absent: value.data().time_absent,
                    teacher_name: value.data().teacher_name,
                    Time: value.data().Time,
                    status: value.data().status,
                    total_mark: value.data().total_mark,
                    time_late: value.data().time_late,
                    section_number: value.data().section_number
                })
            })
            final.push({
                Subject: {
                    subject_code: subject_code,
                    subject_name: subject_name
                },
                sections: section
            })
        }
    })

    return res.status(200).json({
        message: "Get Data Success",
        status: {
            dataStatus: "SUCCESS"
        },
        data: final
    })

})

//Mobile Api

app.get('/ListSectionTeacher', permission_professor, async (req, res) => {

    const subject = [];

    await db.collection('subjects').where('approved_status', '==', 'APPROVE')
        .get()
        .then(result => {
            result.forEach(row => {
                subject.push({
                    subject_code: row.data().subject_code,
                    subject_name: row.data().subject_name,
                    approved_status: row.data().approved_status,
                    creater_name: row.data().creater_name,
                    uid: row.data().uid,
                })
            })
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })

    let year, semester;
    await db.collection('semester_year').where('status', '==', 'ACTIVE')
        .get()
        .then(result => {
            result.forEach(record => {
                year = record.data().year;
                semester = record.data().semester;
            })
        })

    const promise = [];
    let subject_name, subject_code;
    subject.forEach(record => {
        promise.push(
            db.collection('section_subject')
                .where('teacher_id', '==', req.user_id)
                .where(new admin.firestore.FieldPath('Year', 'year'), '==', Number(year))
                .where(new admin.firestore.FieldPath('Year', 'semester'), '==', semester.toString())
                .where(new admin.firestore.FieldPath('Subject', 'subject_code'), '==', record.subject_code)
                .where(new admin.firestore.FieldPath('Subject', 'subject_name'), '==', record.subject_name)
                .get())
    })

    const result = await Promise.all(promise)
    let section = [];
    let final = [];
    result.forEach(record => {
        section = []
        if (record.size > 1) {
            record.forEach(value => {
                subject_code = value.data().Subject.subject_code;
                subject_name = value.data().Subject.subject_name;
                section.push({
                    id: value.id,
                    teacher_id: value.data().teacher_id,
                    time_absent: value.data().time_absent,
                    teacher_name: value.data().teacher_name,
                    Time: value.data().Time,
                    status: value.data().status,
                    total_mark: value.data().total_mark,
                    time_late: value.data().time_late,
                    section_number: value.data().section_number
                })
            })
            final.push({
                Subject: {
                    subject_code: subject_code,
                    subject_name: subject_name
                },
                sections: section
            })
        }
        else if (record.size > 0) {
            section = [];
            record.forEach(value => {
                subject_code = value.data().Subject.subject_code;
                subject_name = value.data().Subject.subject_name
                section.push({
                    id: value.id,
                    teacher_id: value.data().teacher_id,
                    time_absent: value.data().time_absent,
                    teacher_name: value.data().teacher_name,
                    Time: value.data().Time,
                    status: value.data().status,
                    total_mark: value.data().total_mark,
                    time_late: value.data().time_late,
                    section_number: value.data().section_number
                })
            })
            final.push({
                Subject: {
                    subject_code: subject_code,
                    subject_name: subject_name
                },
                sections: section
            })
        }
    })
    final.sort((a, b) => a.Subject.subject_code - b.Subject.subject_code)

    return res.status(200).json({
        message: "Get Data Success",
        status: {
            dataStatus: "SUCCESS"
        },
        data: final
    })
})

app.get('/ListStudentInSection/:id', permission_professor, async (req, res) => {

    const id = req.params.id
    await db.collection('section_subject').doc(id).get()
        .then(async result => {
            if (result.exists) {
                db.collection('user_registration').where('section_id', '==', result.id).get()
                    .then(async resp => {
                        const student = [];
                        const promise = [];
                        resp.forEach(rec => {
                            promise.push(db.collection('users').doc(rec.data().uid).get()
                                .then(user => {
                                    student.push({
                                        request_id: rec.id,
                                        std_id: user.data().id,
                                        firstname: user.data().firstname,
                                        lastname: user.data().lastname,
                                        status: rec.data().status
                                    })
                                }))
                        })
                        await Promise.all(promise)
                        student.sort((a, b) => a.std_id - b.std_id)
                        return res.status(200).json({
                            message: "Get Data Success",
                            status: {
                                dataStatus: "SUCCESS"
                            },
                            data: {
                                subject_code: result.data().Subject.subject_code,
                                subject_name: result.data().Subject.subject_name,
                                section_number: result.data().section_number,
                                students: student
                            },
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
                    message: "Get Data Success ",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: {
                        subject_code: result.data().Subject.subject_code,
                        subject_name: result.data().Subject.subject_name,
                        section_number: result.data().section_number,
                        students: []
                    }
                })
            }
        })

})

app.get('/ListRegistration', nisit_permission, async (req, res) => {

    const promise = [];
    const registration = [];
    await db.collection('user_registration').where('uid', '==', req.user_id).get()
        .then(async resp => {
            if (resp.empty) {
                return res.status(404).json({
                    message: "No List Registration",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: []
                })
            }
            resp.forEach(record => {
                let section_id = record.data().section_id
                promise.push(db.collection('section_subject').doc(section_id).get()
                    .then(result => {
                        if (result.exists) {
                            registration.push({
                                request_id: record.id,
                                section_id: result.id,
                                subject_code: result.data().Subject.subject_code,
                                subject_name: result.data().Subject.subject_name,
                                section_number: result.data().section_number,
                                status: record.data().status
                            })
                        }
                    }))
            })

            await Promise.all(promise).catch(err => {
                console.log("Error", err)
            })
            await db.collection('users').doc(req.user_id).get()
                .then(user => {
                    return res.status(200).json({
                        message: "Get User Registration List Success",
                        status: {
                            dataStatus: "SUCCESS"
                        },
                        data: {
                            id: user.data().id,
                            firstname: user.data().firstname,
                            lastname: user.data().lastname,
                            registrations: registration
                        }
                    })
                })
                .catch(err => {
                    return res.status(500).json({
                        message: err.message,
                        status: {
                            dataStatus: "FAILURE"
                        }
                    })
                })
        })
        .catch(err => {
            return res.status(500).json({
                message: err.message,
                status: {
                    dataStatus: "FAILURE"
                }
            })
        })
})

app.get('/ListSubjects', check_admin_professor, async (req, res) => {

    try {
        const snapshot_subjects = await db.collection('subjects').where('approved_status', '==', 'APPROVE').get()
        const promise = [];
        let year, semester;
        const subjects = [];
        await db.collection('semester_year').where('status', '==', 'ACTIVE').get()
            .then(docs => {
                docs.forEach(row => {
                    year = row.data().year;
                    semester = row.data().semester;
                })
            })
        if (snapshot_subjects.empty) {
            return res.status(404).json({
                message: "No Document",
                status: {
                    dataStatus: "SUCCESS"
                },
                data: []
            })
        }

        snapshot_subjects.forEach(doc => {
            promise.push(db.collection('section_subject')
                .where(new admin.firestore.FieldPath('Year', 'year'), '==', year)
                .where(new admin.firestore.FieldPath('Year', 'semester'), '==', semester)
                .where(new admin.firestore.FieldPath('Subject', 'subject_code'), '==', doc.data().subject_code)
                .where(new admin.firestore.FieldPath('Subject', 'subject_name'), '==', doc.data().subject_name)
                .get()
                .then(docs => {
                    subjects.push({
                        id: doc.id,
                        subject_code: doc.data().subject_code,
                        subject_name: doc.data().subject_name,
                        approved_status: doc.data().approved_status,
                        count: docs.size
                    })
                })
            )
        })
        await Promise.all(promise);
        return res.status(200).json({
            message: "Get Success",
            status: {
                dataStatus: "SUCCESS"
            },
            data: subjects
        })
    }
    catch (error) {
        return res.status(500).json({
            message: error.message,
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
})


app.get('/getClass', permission_professor, async (req, res) => {

    const classes = [];
    const promise = [];
    await db.collection('classes').where('status', '==', 'ACTIVE')
        .where('uid', '==', req.user_id)
        .get()
        .then(async resp => {
            if (resp.empty) {
                return res.status(404).json({
                    message: "No Class Open",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: []
                })
            }
            resp.forEach(doc => {
                promise.push(db.collection('section_subject').doc(doc.data().section_id).get()
                    .then(section => {
                        classes.push({
                            class_id: doc.id,
                            subject_code: section.data().Subject.subject_code,
                            subject_name: section.data().Subject.subject_name,
                            section_number: section.data().section_number,
                            Lecturer_name: section.data().teacher_name,
                            Time: section.data().Time,
                            beacon_id: doc.data().beacon_id,
                            classed_status: doc.data().status
                        })
                    }))
            })
            await Promise.all(promise);
            return res.status(200).json({
                message: "Get Data Class Open",
                status: {
                    dataStatus: 'SUCCESS'
                },
                data: classes
            })
        })
})

app.put('/closeClass/:id', permission_professor, async (req, res) => {

    const class_id = req.params.id;
    let beacon_id;
    await db.collection('classes').doc(class_id).get()
        .then(async classes => {
            beacon_id = classes.data().beacon_id;
            await db.collection('classes').doc(class_id).update({
                status: "DISABLE",
                closed_timestamp: Number(moment(new Date()).tz('Asia/Bangkok').format("X"))
            })
                .then(async () => {
                    await db.collection('beacon').doc(beacon_id).update({
                        status: "DISABLE"
                    })
                    return res.status(200).json({
                        message: "Close Class Success",
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
        .catch(err => {
            return res.status(500).json({
                message: err.message
            })
        })
})

//deploy at 9/4/2020 finish
app.get('/getClassForCheckName', nisit_permission, async (req, res) => {

    try {
        const promise = [];
        await db.collection('user_registration').where('uid', '==', req.user_id)
            .where('status', '==', 'APPROVE')
            .get()
            .then(async resp => {
                resp.forEach(row => {
                    let section_id = row.data().section_id;
                    promise.push(db.collection('classes').where('section_id', '==', section_id)
                        .where('status', '==', 'ACTIVE').get())
                })
            })
        const classes = await Promise.all(promise);

        let sections = [];
        let array_promise = [];
        classes.forEach(chunk_class => {
            chunk_class.forEach(row_class => {
                array_promise.push(db.collection('section_subject').doc(row_class.data().section_id).get()
                    .then(async section => {
                        if (section.exists) {
                            const beacon = await db.collection('beacon').doc(row_class.data().beacon_id).get();
                            sections.push({
                                class_id: row_class.id,
                                Section: {
                                    section_id: section.id,
                                    subject_code: section.data().Subject.subject_code,
                                    subject_name: section.data().Subject.subject_name,
                                    section_number: section.data().section_number,
                                    Time: section.data().Time,
                                    beacon: {
                                        uuid: beacon.data().uuid,
                                        major: beacon.data().major,
                                        minor: beacon.data().minor
                                    }
                                },
                            })
                        }
                    }))
            })
        })
        await Promise.all(array_promise);
        return res.status(200).json({
            message: "Get List Class For CheckName Success",
            status: {
                dataStatus: "SUCCESS"
            },
            data: sections
        })
    }
    catch (err) {
        return res.status(500).json({
            message: err.message,
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
})

app.post('/CheckName', nisit_permission, async (req, res) => {

    const zone = 'Asia/Bangkok';
    const time = moment(new Date()).tz(zone).format("X");
    let beacon_id, time_absent, time_late;
    await db.collection('beacon').where('uuid', '==', req.body.uuid)
        .where('major', '==', req.body.major)
        .where('minor', '==', req.body.minor)
        .get()
        .then(async (beacon) => {
            if (!beacon.empty) {
                beacon.forEach(row_beacon => {
                    beacon_id = row_beacon.id
                })

                await db.collection('classes').doc(req.body.class_id).get()
                    .then((resp) => {
                        let data = {
                            time: resp.data().opened_timestamp,
                            section_id: resp.data().section_id,
                            distance: resp.data().distance
                        }
                        return data;
                    })
                    .then(async (data) => {
                        await db.collection('section_subject').doc(data.section_id).get()
                            .then(async (sections) => {
                                time_absent = sections.data().time_absent
                                time_late = sections.data().time_late
                                const open_time = moment.unix(data.time);

                                const now = moment.unix(time);
                                const factor = await getFactor();
                                let factor_distance = data.distance * factor;
                                const diff = moment(open_time, "DD/MM/YYYY HH:mm:ss").diff(moment(now, "DD/MM/YYYY HH:mm:ss"));
                                const d = moment.duration(Math.abs(diff));
                                const minutes = (d.hours() * 60) + d.minutes();
                                // console.log("minutes", minutes)
                                const dateTime = moment(new Date()).tz(zone).format('YYYY-MM-DD HH:mm:ss');
                                // console.log("factor_distance", factor_distance)
                                if (req.body.distance < factor_distance) {
                                    await db.collection('class_attendance').where('class_id', '==', req.body.class_id)
                                        .where('macAddress', '==', req.body.macAddress)
                                        .get()
                                        .then(async attandence => {
                                            if (attandence.empty) {
                                                if (minutes >= Number(time_late) && minutes < Number(time_absent)) {
                                                    await db.collection('class_attendance').add({
                                                        beacon_id: beacon_id,
                                                        distance: req.body.distance,
                                                        macAddress: req.body.macAddress,
                                                        time: Number(time),
                                                        uid: req.user_id,
                                                        class_id: req.body.class_id,
                                                        status: 'LATE',
                                                        rssi: req.body.rssi
                                                    })
                                                        .then(() => {
                                                            return res.status(201).json({
                                                                message: "Class Attendance Success",
                                                                status: {
                                                                    dataStatus: "SUCCESS"
                                                                },
                                                                dateTime: dateTime,
                                                                statusCheckIn: "LATE"
                                                            })
                                                        })
                                                }
                                                else if (minutes >= Number(time_absent)) {
                                                    await db.collection('class_attendance').add({
                                                        beacon_id: beacon_id,
                                                        distance: req.body.distance,
                                                        macAddress: req.body.macAddress,
                                                        time: Number(time),
                                                        uid: req.user_id,
                                                        class_id: req.body.class_id,
                                                        status: 'ABSENT',
                                                        rssi: req.body.rssi
                                                    })
                                                        .then(() => {
                                                            return res.status(201).json({
                                                                message: "Class Attendance Success",
                                                                status: {
                                                                    dataStatus: "SUCCESS"
                                                                },
                                                                dateTime: dateTime,
                                                                statusCheckIn: "ABSENT"
                                                            })
                                                        })
                                                }
                                                else {
                                                    await db.collection('class_attendance').add({
                                                        beacon_id: beacon_id,
                                                        distance: req.body.distance,
                                                        macAddress: req.body.macAddress,
                                                        time: Number(time),
                                                        uid: req.user_id,
                                                        class_id: req.body.class_id,
                                                        status: 'ONTIME',
                                                        rssi: req.body.rssi
                                                    })
                                                        .then(() => {
                                                            return res.status(201).json({
                                                                message: "Class Attendance Success",
                                                                status: {
                                                                    dataStatus: "SUCCESS"
                                                                },
                                                                dateTime: dateTime,
                                                                statusCheckIn: "ONTIME"
                                                            })
                                                        })
                                                }
                                            }
                                            else {
                                                return res.status(500).json({
                                                    message: "This Mac Address is already used in this class.",
                                                    status: {
                                                        dataStatus: "FAILURE"
                                                    }
                                                })
                                            }
                                        })
                                }
                                else {
                                    return res.status(500).json({
                                        message: "You are outside the attendance area. Please try again.",
                                        status: {
                                            dataStatus: "FAILURE"
                                        }
                                    })
                                }
                            })
                    })
                    .catch(err => {
                        return res.status(500).json({
                            message: err.message,
                            status: {
                                dataStatus: "FAILURE"
                            }
                        })
                    })
            }
        })
})

app.get('/TeachHistory/:id', permission_professor, async (req, res) => {

    try {
        const section_id = req.params.id;
        const list_class = await db.collection('classes').where('section_id', '==', section_id).orderBy('opened_timestamp', 'asc').get();

        let response = [];
        let classes = [];
        let i = 1;
        list_class.forEach(row_class => {
            const date = moment.unix(row_class.data().opened_timestamp).tz('Asia/Bangkok').format('DD MMMM YYYY');
            let time = moment.unix(row_class.data().opened_timestamp).tz('Asia/Bangkok').format("HH:mm")
            if (row_class.data().closed_timestamp === undefined) {
                classes.push({
                    number: i,
                    class_id: row_class.id,
                    section_id: row_class.data().section_id,
                    date: date,
                    time: time + " - " + "OPENING"
                })
            }
            else {
                let open_time = moment.unix(row_class.data().opened_timestamp).tz('Asia/Bangkok').format('HH:mm');
                let close_time = moment.unix(row_class.data().closed_timestamp).tz('Asia/Bangkok').format('HH:mm')
                classes.push({
                    number: i,
                    class_id: row_class.id,
                    section_id: row_class.data().section_id,
                    date: date,
                    time: open_time + " - " + close_time
                })
            }
            i++;
        })

        await db.collection('section_subject').doc(section_id).get()
            .then(section => {
                response.push({
                    subject_code: section.data().Subject.subject_code,
                    subject_name: section.data().Subject.subject_name,
                    class: classes
                })
            })
            .then(() => {
                return res.status(200).json({
                    message: "Get Data Success",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: response
                })
            })
    }
    catch (err) {
        return res.status(500).json({
            message: err.message
        })
    }
})

app.get('/studentHistory/:id', nisit_permission, async (req, res) => {

    try {
        const section_id = req.params.id;
        const classes_list = await db.collection('classes').where('section_id', '==', section_id).orderBy('opened_timestamp', 'asc').get();

        let promise = [];
        classes_list.forEach(row_class => {
            promise.push(db.collection('class_attendance').where('class_id', '==', row_class.id)
                .where('uid', '==', req.user_id).get())
        })

        const attandance = await Promise.all(promise);
        let final = [];
        let i = 1;
        attandance.forEach(chunk_attandance => {
            chunk_attandance.forEach(row_attandance => {
                let date = moment.unix(row_attandance.data().time).tz('Asia/Bangkok').format("DD MMMM YYYY");
                let time = moment.unix(row_attandance.data().time).tz('Asia/Bangkok').format('HH:mm');
                final.push({
                    number: i,
                    status: row_attandance.data().status,
                    date: date,
                    time: time
                })
                i++;
            })
        })
        return res.status(200).json({
            message: "Get data Success",
            status: {
                dataStatus: "SUCCESS"
            },
            data: final
        })
    }
    catch (err) {
        return res.status(500).json({
            message: err.message,
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
})

app.get('/studentInClass/:id', permission_professor, async (req, res) => {

    try {
        const class_id = req.params.id;
        const attandance = await db.collection('class_attendance').where('class_id', '==', class_id).get();

        let promise = [];
        let data_user = [];
        let amount = 0;

        attandance.forEach(row_attandance => {
            let uid = row_attandance.data().uid
            promise.push(db.collection('users').doc(uid).get()
                .then(users => {
                    let time = moment.unix(row_attandance.data().time).tz('Asia/Bangkok').format("HH:mm");
                    data_user.push({
                        id: users.data().id,
                        firstname: users.data().firstname,
                        lastname: users.data().lastname,
                        time: time,
                        status: row_attandance.data().status
                    })
                    amount++;
                })
            )
        })

        await Promise.all(promise);
        data_user.sort((a, b) => a.id - b.id);
        await db.collection('classes').doc(class_id).get()
            .then((cl) => {
                return res.status(200).json({
                    message: "Get Student in Class Success",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: {
                        class_id: cl.id,
                        amount: amount,
                        students: data_user
                    }
                })
            })
    }
    catch (err) {
        return res.status(500).json({
            message: err.message,
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
})

app.get('/getBeaconByClass/:id', nisit_permission, async (req, res) => {

    try {
        const class_id = req.params.id;
        let beacon = [];
        await db.collection('classes').doc(class_id).get()
            .then(async (classes) => {
                let beacon_id = classes.data().beacon_id;
                await db.collection('beacon').doc(beacon_id).get()
                    .then(b => {
                        beacon.push({
                            id: b.id,
                            uuid: b.data().uuid,
                            major: b.data().major,
                            minor: b.data().minor
                        })
                    })
                return res.status(200).json({
                    message: "Get Data Class Success",
                    status: {
                        dataStatus: "SUCCESS"
                    },
                    data: beacon
                })
            })
    }
    catch (err) {
        return res.status(500).json({
            message: err.message,
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
})

app.post('/forgetPassword', (req, res) => {

    const email = req.body.email;
    firebase.sendPasswordResetEmail(email, function (err, user) {
        if (err) {
            return res.status(500).json({
                message: err.message,
                status: {
                    dataStatus: "FAILURE"
                }
            })
        }
        else {
            return res.status(200).json({
                message: "Send Email To Reset Password Success",
                status: {
                    dataStatus: "SUCCESS"
                }
            })
        }
    })
})

app.get('/export', async (req, res) => {

    try {
        let columns = [
            {
                label: 'id',
                value: 'id'
            },
            {
                label: 'student',
                value: row => row.student
            }
        ];
        let year = req.query.year;
        let semester = req.query.semester;
        let subject_name = req.query.subject_name;
        let section = req.query.section;
        let subject_code = req.query.subject_code;

        let section_id, total_mark;
        await db.collection('section_subject')
            .where(new admin.firestore.FieldPath('Year', 'year'), '==', Number(year))
            .where(new admin.firestore.FieldPath('Year', 'semester'), '==', semester)
            .where(new admin.firestore.FieldPath('Subject', 'subject_code'), '==', subject_code)
            .where(new admin.firestore.FieldPath('Subject', 'subject_name'), '==', subject_name)
            .where('section_number', '==', section)
            .get()
            .then(async (sections) => {
                if (sections.empty) {
                    // console.log("This is Not found!")
                }
                sections.forEach(row => {
                    section_id = row.id;
                    total_mark = row.data().total_mark;
                })
                let promise = [];
                await db.collection('user_registration').where('section_id', '==', section_id).where('status', '==', 'APPROVE')
                    .get()
                    .then((registration) => {
                        registration.forEach(row => {
                            promise.push(db.collection('users').doc(row.data().uid).get())
                        })
                    })
                let count_date = 0;
                let dates = [];
                const user_registration = await Promise.all(promise);
                let array_class = [];
                await db.collection('classes').where('section_id', '==', section_id).orderBy('opened_timestamp', 'asc').get()
                    .then(classes => {
                        if (!classes.empty) {
                            classes.forEach(row_class => {
                                let date = moment.unix(row_class.data().opened_timestamp).tz('Asia/Bangkok').format("DD/MM/YYYY HH:mm")
                                array_class.push({
                                    class_id: row_class.id,
                                    opened_timestamp: row_class.data().opened_timestamp,
                                    closed_timestamp: row_class.data().closed_timestamp
                                })
                                columns.push({ label: `${date}`, value: `${date}` })
                                count_date++;
                            })
                        }
                    })
                let promise3 = [];
                let class_attendance = [];
                if (array_class.length >= 1) {
                    array_class.forEach(row_class => {
                        promise3.push(db.collection('class_attendance').where('class_id', '==', row_class.class_id).orderBy('time', 'asc').get()
                            .then(class_att => {
                                if (!class_att.empty) {
                                    class_att.forEach(row_attan => {
                                        class_attendance.push({
                                            id: row_attan.id,
                                            class_id: row_class.class_id,
                                            status: row_attan.data().status,
                                            time: row_attan.data().time,
                                            uid: row_attan.data().uid,
                                            open_time: row_class.opened_timestamp,
                                            close_time: row_class.closed_timestamp
                                        })
                                    })
                                }
                            }))
                    })
                }
                await Promise.all(promise3);
                let final = [];
                let score, count = 1;
                class_attendance.forEach(row_attan => {
                    let open_time = row_attan.open_time
                    // let close_time = row_attan.close_time
                    let date = moment.unix(open_time).tz('Asia/Bangkok').format('DD/MM/YYYY HH:mm');
                    user_registration.forEach(row_user => {
                        if (row_user.id === row_attan.uid) {
                            let status = row_attan.status;
                            if (status === 'ONTIME') {
                                score = 1;
                            }
                            else if (status === 'LATE') {
                                score = 0.5;
                            }
                            else {
                                score = 0;
                            }
                            final.push({
                                id: row_user.data().id,
                                student: row_user.data().firstname + " " + row_user.data().lastname,
                                [`${date}`]: score,
                                [`Total(${total_mark})`]: score,
                                count: count
                            })
                        }
                        else {
                            final.push({
                                id: row_user.data().id,
                                student: row_user.data().firstname + " " + row_user.data().lastname,
                                [`Total(${total_mark})`]: 0,
                                count: 0
                            })
                        }
                    })
                })

                Object.byString = function (o, s) {
                    s = s.replace(/\[(\w+)\]/g, '.$1'); // convert indexes to properties
                    s = s.replace(/^\./, '');           // strip a leading dot
                    var a = s.split('.');
                    for (var i = 0, n = a.length; i < n; ++i) {
                        var k = a[i];
                        if (k in o) {
                            o = o[k];
                        } else {
                            return;
                        }
                    }
                    return o;
                }
                const newArray = new Map();
                final.forEach(row => {
                    let id = row.id
                    let total = Object.byString(row, `Total(${total_mark})`)
                    if (newArray.has(id)) {
                        let r = newArray.get(id);
                        r.count += row.count
                        r[`Total(${total_mark})`] += total
                        newArray.set(id, Object.assign({}, row, r))
                    }
                    else {
                        newArray.set(id, row);
                    }
                })

                columns.push({ label: `Total(${total_mark})`, value: `Total(${total_mark})` },
                    { label: 'count', value: row => row.count })
                const result = Array.from(newArray.values())
                result.sort((a, b) => a.id - b.id);
                let settings = {
                    sheetName: `${subject_code}_${subject_name}_${section}`,
                    fileName: `${subject_code}_${subject_name}_${section}`,
                }
                let file;
                if (result.length > 0) {
                    for (let i = 0; i < result.length; i++) {
                        if (result[i][`Total(${total_mark})`] == 0) {
                            result[i][`Total(${total_mark})`] = 0;
                        } else {
                            result[i][`Total(${total_mark})`] = ((result[i][`Total(${total_mark})`] / count_date) * total_mark).toFixed(2);
                        }
                    }

                    file = exportXls(columns, result, settings);
                }
                else {
                    const users = [];
                    user_registration.forEach(row_user => {
                        users.push({
                            id: row_user.data().id,
                            student: row_user.data().firstname + " " + row_user.data().lastname,
                            Total: 0,
                            count: 0
                        })
                    })
                    users.sort((a, b) => a.id - b.id);
                    file = exportXls(columns, users, settings)
                }
                res.setHeader(
                    "Content-disposition",
                    `attachment; filename=${subject_code}_${subject_name}_${section}.xlsx`,
                )
                res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
                res.end(new Buffer(file, 'base64'))

            })

    }
    catch (err) {
        return res.status(500).json({
            message: err.message,
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
})


async function getFactor() {
    let factor;
    await db.collection('factor_distance').get()
        .then(factors => {
            factors.forEach(ft => {
                factor = ft.data().factor;
            })
        })
    return factor;
}

app.get('/getExport/:id', permission_professor, async (req, res) => {

    let section_id = req.params.id;

    try {
        const list_class = await db.collection('classes').where('section_id', '==', section_id).orderBy('opened_timestamp', 'asc').get()

        const classes = [];
        const promise = [];

        list_class.forEach(row_class => {
            let date = moment.unix(row_class.data().opened_timestamp).tz('Asia/Bangkok').format('DD/MM/YYYY HH:mm')
            classes.push({
                id: row_class.id,
                date: date
            })
        })

        await db.collection('user_registration').where('section_id', '==', section_id).where('status', '==', 'APPROVE')
            .get()
            .then((registration) => {
                registration.forEach(row => {
                    promise.push(db.collection('users').doc(row.data().uid).get())
                })
            })

        const user_inClass = await Promise.all(promise);
        let promise3 = [];
        let class_attendance = [];
        classes.forEach(row_class => {
            promise3.push(db.collection('class_attendance').where('class_id', '==', row_class.id).orderBy('time', 'asc').get()
                .then(class_att => {
                    if (!class_att.empty) {
                        class_att.forEach(row_attan => {
                            class_attendance.push({
                                id: row_attan.id,
                                class_id: row_attan.data().class_id,
                                status: row_attan.data().status,
                                time: row_attan.data().time,
                                uid: row_attan.data().uid,
                                open_time: row_class.date
                            })
                        })
                    }
                }))
        })
        let final = [];
        await Promise.all(promise3);
        class_attendance.forEach(row_attan => {
            let date = row_attan.open_time
            user_inClass.forEach(row_user => {
                if (row_user.id === row_attan.uid) {
                    let status = row_attan.status;
                    if (status === 'ONTIME') {
                        score = 1;
                    }
                    else if (status === 'LATE') {
                        score = 0.5;
                    }
                    else {
                        score = 0;
                    }
                    final.push({
                        id: row_user.data().id,
                        student: row_user.data().firstname + " " + row_user.data().lastname,
                        date: date,
                        score: score
                    })
                }
                else {
                    final.push({
                        id: row_user.data().id,
                        student: row_user.data().firstname + " " + row_user.data().lastname,
                        date: date,
                        score: 0
                    })
                }
            })
        })


        await db.collection('section_subject').doc(section_id).get()
            .then(section => {
                section_name = section.data().Subject.subject_name
                section_number = section.data().section_number
                total_mark = section.data().total_mark
            })
        return res.status(200).json({
            message: "Get Success",
            status: {
                dataStatus: "SUCCESS"
            },
            data: {
                section_name: section_name,
                section: section_number,
                total_mark: total_mark,
                class: classes,
                student: final
            }
        })
    }
    catch (err) {
        return res.status(500).json({
            message: err.message,
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
})


app.post('/TestDistanceBeacon', async (req, res) => {

    try {
        await db.collection('TestBeacon').add({
            uuid: req.body.uuid,
            rssi: req.body.rssi,
            distance: req.body.distance,
            major: req.body.major,
            minor: req.body.minor
        })
            .then(() => {
                return res.status(200).json({
                    message: "Add Success",
                    status: {
                        dataStatus: "SUCCESS"
                    }
                })
            })
    }
    catch (err) {
        return res.status(500).json({
            message: err.message,
            status: {
                dataStatus: "FAILURE"
            }
        })
    }
})

app.delete('/clearData', check_admin,async (req, res) => {

    try {
        let id_year, currentYear;
        const getYearAvailable = await db.collection('semester_year').where('status', '==', 'ACTIVE').get();
        getYearAvailable.forEach(row_year => {
            id_year = row_year.id;
            currentYear = row_year.data().year
        })
        let deleteYear = [];
        const getYear = await db.collection('semester_year').get();
        getYear.forEach(row => {
            let diffYear = Math.abs(row.data().year - currentYear);
            if (diffYear > 5) {
                deleteYear.push({
                    id: row.id,
                    year: row.data().year,
                    semester: row.data().semester
                })
            }
        })
        let promise = [];
        deleteYear.forEach(row_year => {
            promise.push(db.collection('semester_year').doc(row_year.id).delete()
                .then(() => {
                    db.collection('section_subject')
                        .where(new admin.firestore.FieldPath('Year', 'year'), '==', row_year.year)
                        .get()
                        .then(chunk_section => {
                            if (!chunk_section.empty) {
                                chunk_section.forEach(row_section => {
                                    db.collection('section_subject').doc(row_section.id).delete()
                                        .then(async () => {
                                            await db.collection('user_registration').where('section_id', '==', row_section.id)
                                                .get()
                                                .then(registrations => {
                                                    registrations.forEach(row_regis => {
                                                        db.collection('user_registration').doc(row_regis.id).delete()
                                                            .then(() => {
                                                                db.collection('classes').where('section_id', '==', row_section.id)
                                                                    .get()
                                                                    .then(cl => {
                                                                        cl.forEach(row_class => {
                                                                            db.collection('classes').doc(row_class.id).delete()
                                                                                .then(() => {
                                                                                    db.collection('class_attendance').where('class_id', '==', row_class.id)
                                                                                        .get()
                                                                                        .then(attan => {
                                                                                            attan.forEach(row_attan => {
                                                                                                db.collection('class_attendance').doc(row_attan.id).delete();
                                                                                            })
                                                                                        })
                                                                                })
                                                                        })
                                                                    })
                                                            })
                                                    })
                                                })
                                        })
                                })
                            }
                        })
                }))
        })

        await Promise.all(promise);
        return res.status(200).json({
            message:"Clear Data Success",
            status:{
                dataStatus:"SUCCESS"
            }
        })

    }
    catch (error) {
       return res.status(500).json({
           message:error.message,
           status:{
               dataStatus:"FAILURE"
           }
       })
    }
})

exports.api = functions.https.onRequest(app)

async function getName(uid){
    let name;
    await db.collection('users').doc(uid).get()
    .then(users => {
        name = users.data().firstname + " " + users.data().lastname
    })
    return name;
}
