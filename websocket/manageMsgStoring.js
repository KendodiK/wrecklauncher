const FriendsController = require('../database/controllers/FriendsController.js');
const ChatsController = require('../database/controllers/ChatsController.js');

module.exports.storeInDB = async function (sender, reciver, msg) {
    // Store a chat message in DB (uses existing controllers + reusable DB handler)
    try {
        const chatCtrl = new ChatsController();

        const friendId = await friendCheck(sender, reciver);

        const data = [friendId, msg, sender];
        const storedMsg = await chatCtrl.create(data);
        const id = storedMsg?.id ?? storedMsg?.insertId ?? null;
        console.log('msg saved with id:', id);
        return id;
    } catch (err) {
        console.error('Error storing message in DB:', err);
        throw err;
    }
}

module.exports.areFriends = async function (sender, reciver) {
    try {
        const friendId = await friendCheck(sender, reciver);
        return !!friendId;
    } catch (err) {
        console.log('Error or failed to get friendship id:', err);
        return false;
    }
}

async function friendCheck(sender, reciver) {
    try {
        const friendsCtrl = new FriendsController();
        const friendId = await friendsCtrl.getFriendId(sender, reciver);
        if (!friendId) {
            throw new Error(`No friendship found between user ${sender} and user ${reciver}`);
        }
        return friendId;
    } catch (err) {
        console.error('Error while getting friendship between users:', err);
        throw err;
    }
}