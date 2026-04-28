using System;
using System.Collections.Generic;
using System.Text;

namespace wreckchat.Models;

internal class ChatModel
{
    public int id;
    public List<ChatMessageModel> messages;
    public string lastMessageSenderId, lastMessage;

    public ChatModel(int id, List<ChatMessageModel> messages, string lastMessageSenderId = "", string lastMessage = "")
    {
        this.id = id;
        this.messages = messages;
        this.lastMessageSenderId = lastMessageSenderId;
        this.lastMessage = lastMessage;
    }

    public void AddMessages(List<ChatMessageModel> messages)
    {
        this.messages.AddRange(messages);

        if (messages.Count > 0)
        {
            var lastMessage = messages[messages.Count - 1];
            this.lastMessageSenderId = lastMessage.Sender_id;
            this.lastMessage = lastMessage.Message;
        }
    }
}
