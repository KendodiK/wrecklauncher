const friendsController = require('../database/controllers/FriendsController.js');
const ChatsController = require('../database/controllers/ChatsController');

module.exports.storeInDB = async function (sender, reciver, msg) {
    try {
        const friendsCtrl = new friendsController();
        const chatCtrl = new ChatsController();

        const fiendId = await friendsCtrl.getFriendId(sender, reciver);
        if (!fiendId) {
            throw new Error(`No friendship found between user ${sender} and user ${reciver}`);
        } else if (fiendId instanceof Error) {
            throw fiendId;
        }
        const data = { "friend_id": fiendId, "message": msg, "sender_id": sender};
        const storedMsg = await chatCtrl.create(data);
        console.log("msg saved with id:", storedMsg.id);
        return storedMsg.id;
    } catch (error) {
        console.error('Error storing message in DB:', error);
        throw error;
    }
}