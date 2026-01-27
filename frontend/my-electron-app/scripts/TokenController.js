const fs = require('fs/promises');
const path = require('path');
const fetch = require('node-fetch');
/**
 * Token class for generating, saving- and re-reading token from file.
 * For easy access to token simply just call the 
 */
class Token{
    #token;
    #tokenFile;
    #password;
    constructor(username, password, tokenfile){
        this.username = username;
        this.#password = password;
        this.#tokenFile = tokenfile;
        this.#token = null;
    }
    /**
 * 
 * Saves token to tokenFile, requires fs library
 * 
 * @param {string} token the users userid+"."+token from database
 */
     async #saveToken(token) {
        try {
          await fs.mkdir(path.dirname(this.#tokenFile), { recursive: true });
          await fs.writeFile(this.#tokenFile, token, 'utf-8');
          console.log('Token saved to file');
        } catch (err) {
          console.error('Failed to save token:', err.message);
        }
      }
  /**
   * 
   * Gets token from local file from tokenFile and returns it, requires fs library
   * 
   * @returns token or if not found null
   */
   async #getToken() {
    try {
      const token = await fs.readFile(this.#tokenFile, 'utf-8');
      // Remove quotes if present
      return token.trim().replace(/^"(.*)"$/, '$1');
    } catch (err) {
      if (err.code === 'ENOENT') return null;
      console.error('Failed to read token:', err.message);
      return null;
    }
  }

  /**
   * 
   * Generates token only if specified or cannot read it from file
   * 
   * @returns {string} token (userid.token is the structure of the string)
   */
   async #generateToken() {
    try {
      let token = await this.#getToken();
      if (token) return token.trim();

      const serverurl = 'http://localhost:3000';
      const response = await fetch(`${serverurl}/api/login/${this.username}/${this.#password}`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      token = await response.json();
      await this.#saveToken(token);
      console.log('Generated and saved new token:', token);
      return token;
    } catch (err) {
      console.error('Failed to fetch token:', err.message);
      return null;
    }
  }
  /**
 * Returns token but if for some reason isn't saved in token variable it tries to read from file and even that doesnt return a token then generates a new one and saves it.
 * 
 * @returns token
 */
   async getToken(){
    if(!this.#token) {this.#token = await this.#generateToken()};
    return this.#token;
  }

}
module.exports = Token;