const fs = require('fs');
const path = require('path');

const USERS_DB_PATH = path.join(__dirname, '..', 'data', 'users.json');

function loadUserStore() {
    const raw = fs.readFileSync(USERS_DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
        users: Array.isArray(parsed.users) ? parsed.users : []
    };
}

function saveUserStore(store) {
    fs.writeFileSync(USERS_DB_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
}

function findUser(store, username) {
    const normalized = String(username || '').trim().toLowerCase();
    return store.users.find((user) => String(user.usernameLower || user.username || '').toLowerCase() === normalized) || null;
}

function listAdmins(store) {
    const admins = store.users.filter((user) => Boolean(user.isAdmin));
    if (!admins.length) {
        console.log('No admin accounts are currently assigned.');
        return;
    }

    admins
        .sort((left, right) => String(left.username || '').localeCompare(String(right.username || '')))
        .forEach((user) => {
            console.log(user.username);
        });
}

function main() {
    const command = String(process.argv[2] || '').trim().toLowerCase();
    const username = String(process.argv[3] || '').trim();
    const store = loadUserStore();

    if (!command || command === 'help' || command === '--help' || command === '-h') {
        console.log('Usage: node tools/admin-account.js <list|grant|revoke> [username]');
        process.exit(0);
    }

    if (command === 'list') {
        listAdmins(store);
        return;
    }

    if (!username) {
        console.error('Provide a username for the grant or revoke action.');
        process.exit(1);
    }

    const user = findUser(store, username);
    if (!user) {
        console.error(`User "${username}" was not found in data/users.json.`);
        process.exit(1);
    }

    if (command === 'grant') {
        if (user.isAdmin) {
            console.log(`${user.username} is already an admin.`);
            return;
        }

        user.isAdmin = true;
        saveUserStore(store);
        console.log(`Granted admin access to ${user.username}.`);
        return;
    }

    if (command === 'revoke') {
        if (!user.isAdmin) {
            console.log(`${user.username} is not currently an admin.`);
            return;
        }

        const otherAdmins = store.users.filter((entry) => entry.id !== user.id && Boolean(entry.isAdmin));
        if (!otherAdmins.length) {
            console.error('Refusing to revoke the last admin account.');
            process.exit(1);
        }

        user.isAdmin = false;
        saveUserStore(store);
        console.log(`Revoked admin access from ${user.username}.`);
        return;
    }

    console.error(`Unknown command "${command}". Use list, grant, or revoke.`);
    process.exit(1);
}

main();
