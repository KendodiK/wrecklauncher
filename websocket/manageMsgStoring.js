const friendsController = require('../database/controllers/FriendsController.js');
const ChatsController = require('../database/controllers/ChatsController.js');

module.exports.storeInDB = async function (sender, reciver, msg) {
    try {
        const chatCtrl = new ChatsController();

        const fiendId = firendCheck(sender, reciver);
        if (friendId instanceof Error) {
            return friendId;
        }
        const data = { "friend_id": fiendId, "message": msg, "sender_id": sender};
        const storedMsg = await chatCtrl.create(data);
        console.log("msg saved with id:", storedMsg.id);
        return storedMsg.id;
    } catch (err) {
        console.error('Error storing message in DB:', err);
        throw err;
    }
}

module.exports.areFriends = async function (sender, reciver) {
    const friendId = firendCheck(sender, reciver);
    if (friendId instanceof Error) {
        console.log('Error or faild to get friendship id:', friendId);
        return false;
    }
    return true
}

async function firendCheck(sender, reciver) {
    try {
        const friendsCtrl = new friendsController();
        const friendId = await friendsCtrl.getFriendId(sender, reciver);
        if (!friendId) {
            throw new Error(`No friendship found between user ${sender} and user ${reciver}`);
        }
        return friendId
    } catch (err) {
        console.error('Error while getting friendship between users:', err);
        throw err;
    }

}