'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const {
    requireUserAuth, createUserAccount, loginUserAccount,
    createAuthToken, setAuthCookie, clearAuthCookie, getPublicProfile, saveUserStore
} = require('../auth');

router.post('/register', (req, res) => {
    const { username, password } = req.body || {};
    const result = createUserAccount(username, password);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
    const token = createAuthToken(result.user);
    setAuthCookie(res, token);
    res.json({ ok: true, token, profile: getPublicProfile(result.user) });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body || {};
    const result = loginUserAccount(username, password);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
    const token = createAuthToken(result.user);
    setAuthCookie(res, token);
    res.json({ ok: true, token, profile: getPublicProfile(result.user) });
});

router.get('/session', requireUserAuth, (req, res) => {
    setAuthCookie(res, createAuthToken(req.user));
    res.json({ ok: true, profile: getPublicProfile(req.user) });
});

router.post('/logout', requireUserAuth, (req, res) => {
    req.user.sessionNonce = crypto.randomBytes(16).toString('hex');
    saveUserStore();
    clearAuthCookie(res);
    res.json({ ok: true });
});

module.exports = router;
