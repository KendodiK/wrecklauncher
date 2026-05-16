namespace wreckchat.Models;

public class UserModel
{
    /*private readonly string _id, _name, _pfpUrl, _token, _bio;

    public UserModel(string id, string name, string pfpUrl, string token, string bio)
    {
        _id = id;
        _name = name;
        _pfpUrl = pfpUrl;
        _token = token;
        _bio = bio;
    }*/
    public string Id { get; set; }
    public string Name { get; set; }
    public string Bio { get; set; }
    public string Pfp { get; set; }
}
