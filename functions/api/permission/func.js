
const functions = require('firebase-functions');
const admin = require('firebase-admin')
const express = require('express')
const bodyParser = require('body-parser')
const cors = require('cors')



const permission_all = (req,res,next) => {
    if(req.headers.token === undefined){
        return res.status(401).json({ message: "Please insert token" })
    }
    else{
        const token = req.headers.token
        admin.auth().verifyIdToken(token).then(claim => {
            if (claim.admin === true || claim.professor === true || claim.nisit === true) {
                next()
            }
            else {
                return res.status(403).json({ message: "You don't have permission" })
            }
        })
        .catch(err => {
            return res.status(500).json({
               message: "Error: " + err.message
            })
        })
    }
}
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

const permission_professor = async (req, res, next) => {
    if (req.headers.token === undefined) {
        return res.status(401).json({ message: "Please insert token" })
    }
    else {
        const token = req.headers.token
        admin.auth().verifyIdToken(token).then(async claim => {
            if (claim.professor === true) {
                const user = await admin.firestore().collection('users').doc(claim.user_id).get()
                req.name = user.data().firstname + " " + user.data().lastname
                // req.name = claim.name
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

const check_admin_professor = (req, res, next) => {

    if (req.headers.token !== undefined) {
        const token = req.headers.token
        admin.auth().verifyIdToken(token)
            .then(async claim => {
                if (claim.admin === true || claim.professor === true) {
                    const user = await admin.firestore().collection('users').doc(claim.user_id).get()
                    req.name = user.data().firstname + " " + user.data().lastname
                    // req.name = claim.name
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

const nisit_permission = async (req, res, next) => {
    if (req.headers.token === undefined) {
        return res.status(401).json({ message: "Please insert token" })
    }
    else {
        const token = req.headers.token
        admin.auth().verifyIdToken(token).then(async claim => {
            if (claim.nisit === true) {
                const user = await admin.firestore().collection('users').doc(claim.user_id).get()
                req.name = user.data().firstname + " " + user.data().lastname
                // req.name = claim.name
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


module.exports = {
    check_admin,
    permission_professor,
    check_admin_professor,
    nisit_permission,
    permission_all
}