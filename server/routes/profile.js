'use strict';

const express = require('express');
const router = express.Router();

const {
    requireUserAuth, updateUserSelectedSkin, updateUserSelectedWeapon,
    unlockSkinForUser, unlockWeaponForUser
} = require('../auth');

router.post('/skin/select', requireUserAuth, (req, res) => {
    const { skinTheme } = req.body || {};
    const result = updateUserSelectedSkin(req.user, skinTheme);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
    res.json({ ok: true, profile: result.profile });
});

router.post('/skin/unlock', requireUserAuth, (req, res) => {
    const { skinTheme } = req.body || {};
    const result = unlockSkinForUser(req.user, skinTheme);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
    res.json({ ok: true, profile: result.profile, unlockedSkin: result.unlockedSkin });
});

router.post('/weapon/select', requireUserAuth, (req, res) => {
    const { weaponType } = req.body || {};
    const result = updateUserSelectedWeapon(req.user, weaponType);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
    res.json({ ok: true, profile: result.profile });
});

router.post('/weapon/unlock', requireUserAuth, (req, res) => {
    const { weaponType } = req.body || {};
    const result = unlockWeaponForUser(req.user, weaponType);
    if (!result.ok) return res.status(400).json({ ok: false, error: result.reason });
    res.json({ ok: true, profile: result.profile, unlockedWeapon: result.unlockedWeapon });
});

module.exports = router;
