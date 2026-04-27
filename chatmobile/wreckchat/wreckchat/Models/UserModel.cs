namespace wreckchat.Models;

public class UserModel
{
    public string Id { get; set; }
    public string Name { get; set; }
    public string Bio { get; set; }
    public string Pfp { get; set; }

    private int frinedId = 0;
    private bool isOnline = false;
    public bool shownInFriendsList = false;
    public bool shownInChatList = false;

    public int SetFriendId(int id) => frinedId = id;
    public int GetFriendId() => frinedId;
    public bool IsOnline() => isOnline;
    public void ChangeOnlineStatus() => isOnline = !isOnline;
    public void ChangeShownInFriendsList() => shownInFriendsList = !shownInFriendsList;
    public void ChangeShownInChatList() => shownInChatList = !shownInChatList;
}
