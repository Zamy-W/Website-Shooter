'use strict';

const express = require('express');
const router = express.Router();

const { getGameAssetCatalog } = require('../assets');

router.get('/game-assets', (req, res) => {
    const catalog = getGameAssetCatalog();
    res.json({
        ok: true,
        defaultSkinId: catalog.defaultSkinId,
        defaultWeaponId: catalog.defaultWeaponId,
        defaultEnemySpriteId: catalog.defaultEnemySpriteId,
        skins: catalog.skins,
        enemySprites: catalog.enemySprites,
        weapons: catalog.weapons
    });
});

module.exports = router;
