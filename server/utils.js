'use strict';

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function randomInRange(min, max) {
    return min + Math.random() * (max - min);
}

function pickRandom(items) {
    if (!Array.isArray(items) || items.length === 0) return null;
    return items[Math.floor(Math.random() * items.length)];
}

function humanizeAssetName(value) {
    return String(value || '')
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/\b\w/g, (m) => m.toUpperCase()) || 'Untitled';
}

function sanitizeAssetSlug(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\.[^.]+$/, '')
        .replace(/[^a-z0-9-_]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '');
}

function toAssetId(relativePath) {
    return String(relativePath || '').replace(/\\/g, '/').replace(/\.[^.]+$/, '');
}

function toForwardSlashPath(value) {
    return value.replace(/\\/g, '/');
}

function isPathInside(parentPath, candidatePath) {
    const path = require('path');
    const relativePath = path.relative(parentPath, candidatePath);
    return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function normalizeIpAddress(ipAddress) {
    if (!ipAddress || typeof ipAddress !== 'string') return 'unknown';
    const trimmed = ipAddress.trim();
    if (!trimmed) return 'unknown';
    if (trimmed.includes(',')) return normalizeIpAddress(trimmed.split(',')[0]);
    if (trimmed.startsWith('::ffff:')) return trimmed.slice(7);
    return trimmed;
}

function getClientIp(source) {
    if (!source) return 'unknown';
    const headers = source.handshake?.headers || source.headers || {};
    const forwardedFor = headers['x-forwarded-for'];
    if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
        return normalizeIpAddress(forwardedFor);
    }
    const address = source.handshake?.address
        || source.conn?.remoteAddress
        || source.request?.socket?.remoteAddress
        || source.socket?.remoteAddress
        || source.ip;
    return normalizeIpAddress(address);
}

function formatMilliseconds(ms) {
    if (!ms || ms < 0) return '0s';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}

function getUpgradeCost(type, level, upgradeConfig) {
    const config = upgradeConfig[type];
    if (!config) return Infinity;
    return Math.round(config.baseCost * Math.pow(config.costScale, level) / 5) * 5;
}

module.exports = {
    clamp,
    randomInRange,
    pickRandom,
    humanizeAssetName,
    sanitizeAssetSlug,
    toAssetId,
    toForwardSlashPath,
    isPathInside,
    normalizeIpAddress,
    getClientIp,
    formatMilliseconds,
    getUpgradeCost
};
