using System;
using System.Collections.Generic;
using System.Text;

namespace wreckchat.Models;

public class ChatMessageModel
{
    public int Id { get; set; }
    public int Friend_id { get; set; }
    public string Message { get; set; }
    public string Sender_id { get; set; }
}
