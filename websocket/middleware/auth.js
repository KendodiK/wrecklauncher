const nativeUserController = require('../../database/controllers/NativeUsersController.js');

module.exports.tokenValidate = async function (req) {
    try {
      const auth = req.headers?.authorization;
      if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
        return { status: 401, error: 'Missing or invalid Authorization header' };
      }
      const token = auth.slice('bearer '.length).trim();

      const parts = token.split('.');
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return { status: 401, error: 'Invalid token format' };
      }

      const [userId, userUniqueToken] = parts;

      const nativeUserCtrl = new nativeUserController();
      const user = await nativeUserCtrl.show(userId);
      if (!user || user.token !== userUniqueToken) {
        return { status: 401, error: 'Invalid token' };
      }

      return { status: 200, user: { id: userId, name: user.name } };
    } catch (error) {
      console.error('Error in token validation:', error);
      return { status: 500, error: 'Internal server error during token validation' };
    }
}