using Microsoft.UI.Xaml.Controls;
using wreckchat.Models;
using wreckchat.Services.Api;
using wreckchat.Services.Auth;

namespace wreckchat.Presentation;

public sealed partial class LoginPage : Page
{
    private LoginModel _model;

    public LoginPage(LoginModel model)
    {
        this.InitializeComponent();
        _model = model;
    }

    private async void LoginButton_Click(object sender, RoutedEventArgs e)
    {
        string username = UsernameInput.Text;
        string password = PasswordInput.Password;

        await _model.CheckData(username, password);
    }
}
