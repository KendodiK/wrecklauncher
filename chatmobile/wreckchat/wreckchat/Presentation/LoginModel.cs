namespace wreckchat.Presentation;

public class LoginModel
{
    private string _username = string.Empty;

    public string Username
    {
        get => _username;
        set => _username = value;
    }

    public void Login()
    {
        if (string.IsNullOrWhiteSpace(Username))
        {
            // TODO: Show error
            return;
        }
        // TODO: Navigate to chat page
    }

    public void SignUp()
    {
        // TODO: Navigate to signup page
    }
}

