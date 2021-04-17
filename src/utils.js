/**
 * Useful methods
 */
class Utils {
  /**
   * Trim long strings and add '…'
   *
   * @param {string} inputString - string to be trimmed
   * @param {number} maxLenght - max string lenght
   * @returns {string|*}
   */
  static trimString(inputString, maxLenght) {
    return maxLenght && (inputString.length > maxLenght)
      ? inputString.substring(0, maxLenght - 1) + '…'
      : inputString;
  }
}

module.exports = Utils;
